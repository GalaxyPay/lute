import {
  KDF_LEGACY_ITERATIONS,
  deriveKeyFromPassSalt,
  seedGcmParams,
} from "@/services/kdf";
import type { SeedData } from "@/types";

/**
 * Session unlock, extension only.
 *
 * The web build has no memory-only store: sessionStorage is not shared with the
 * sign popup (its opener is the dApp, a different origin) and anything else
 * would mean writing a password shortcut to disk. browser.storage.session is
 * never persisted, is wiped on browser restart, and is not visible to content
 * scripts, so the feature is offered there and nowhere else.
 *
 * What is cached is the per-seed derived AES key, never the password. An unlock
 * therefore cannot be replayed as a password, gives nothing to brute-force, and
 * leaves mnemonic and child key export still prompting.
 *
 * Every browser.* reference lives inside a function guarded by isWeb, because
 * `browser` is only auto-imported in extension builds.
 */

const STATE_KEY = "unlock";
const ALARM = "lute-lock";

// Absolute ceiling. The idle window slides on use; this never moves, so an
// actively used wallet still locks.
const HARD_CAP_MS = 8 * 60 * 60 * 1000;

interface UnlockState {
  // seedId -> base64 raw AES-256 key. Raw bytes rather than a structured-cloned
  // CryptoKey because storage.session does not reliably round-trip CryptoKey,
  // and in a memory-only area readable solely by trusted extension contexts the
  // distinction buys nothing: either form decrypts the seed.
  keys: Record<number, string>;
  expiresAt: number;
  hardExpiresAt: number;
}

async function read(): Promise<UnlockState | undefined> {
  const stored = await browser.storage.session.get(STATE_KEY);
  return stored[STATE_KEY] as UnlockState | undefined;
}

async function write(state: UnlockState) {
  await browser.storage.session.set({ [STATE_KEY]: state });
  await browser.alarms.create(ALARM, {
    when: Math.min(state.expiresAt, state.hardExpiresAt),
  });
}

function live(state: UnlockState | undefined) {
  if (!state) return false;
  return Date.now() < Math.min(state.expiresAt, state.hardExpiresAt);
}

const Unlock = {
  enabled() {
    const store = useAppStore();
    return !store.isWeb && store.autoLockMinutes > 0;
  },

  /**
   * Keep store.unlocked in sync with the shared state.
   *
   * The side panel and the options page are separate apps with separate Pinia
   * instances, so either can unlock or lock while the other is on screen.
   * Watching the storage area rather than broadcasting from each mutation site
   * covers every path at once — unlock, Lock Now, alarm expiry, rotation — and
   * cannot drift as new ones are added.
   */
  watch() {
    const store = useAppStore();
    if (store.isWeb) return;
    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "session" || !(STATE_KEY in changes)) return;
      store.unlocked = live(changes[STATE_KEY]!.newValue as UnlockState);
    });
  },

  /** Wallet-level check. Clears on expiry so a missed alarm cannot extend it. */
  async isUnlocked() {
    const store = useAppStore();
    if (store.isWeb) return false;
    const state = await read();
    if (!state || !live(state)) {
      // Also resets the flag: this context may not have existed when the state
      // went away, so there was no storage event for it to observe.
      await this.clear();
      return false;
    }
    store.unlocked = true;
    return true;
  },

  async get(seedId: number) {
    if (!(await this.isUnlocked())) return undefined;
    const state = await read();
    const raw = state?.keys[seedId];
    if (!raw) return undefined;
    return await crypto.subtle.importKey(
      "raw",
      Uint8Array.fromBase64(raw),
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"]
    );
  },

  /**
   * Unlock the wallet. Derives a key for every local seed, not just the one
   * being signed with: a lazily filled map would leave a seed you have not
   * signed with yet prompting while the wallet reads as unlocked. Passkey seeds
   * have no password and are skipped.
   */
  async unlock(pass: string) {
    const store = useAppStore();
    if (!this.enabled()) return;
    const locals = store.seeds.filter((s) => s.data && s.salt && s.iv);
    const derived = await Promise.all(
      locals.map(async (sd) => {
        const key = await deriveKeyFromPassSalt(
          pass,
          sd.salt!,
          sd.iterations ?? KDF_LEGACY_ITERATIONS,
          true
        );
        // Cache only keys proven against their ciphertext. Seeds are meant to
        // share the wallet password, but one that does not must miss the cache
        // and prompt — not read as unlocked with a key that cannot decrypt it.
        try {
          const ent = await crypto.subtle.decrypt(
            seedGcmParams(sd),
            key,
            sd.data!
          );
          new Uint8Array(ent).fill(0);
        } catch {
          return undefined;
        }
        const raw = await crypto.subtle.exportKey("raw", key);
        return [sd.id, new Uint8Array(raw).toBase64()] as const;
      })
    );
    const proven = derived.filter((d) => !!d) as [number, string][];
    const now = Date.now();
    const state = await read();
    await write({
      // Merge over a live state rather than replacing it: entering the odd
      // seed's own password must not evict the wallet-password keys, and vice
      // versa. Each entry was just proven, so newer always wins.
      keys: {
        ...(live(state) ? state!.keys : {}),
        ...Object.fromEntries(proven),
      },
      expiresAt: now + store.autoLockMinutes * 60_000,
      hardExpiresAt: now + HARD_CAP_MS,
    });
    store.unlocked = true;
  },

  /**
   * Slide the idle window. Called only after a successful cached decrypt, never
   * on failures and never on general UI activity — tying the refresh to actual
   * key use is what stops an idle timer becoming a permanent unlock.
   */
  async touch() {
    const store = useAppStore();
    if (store.isWeb) return;
    const state = await read();
    if (!live(state)) return;
    await write({
      ...state!,
      expiresAt: Math.min(
        Date.now() + store.autoLockMinutes * 60_000,
        state!.hardExpiresAt
      ),
    });
  },

  /**
   * Cache one seed's key under the existing window without extending it, for a
   * seed created while already unlocked.
   */
  async add(sd: SeedData, pass: string) {
    const store = useAppStore();
    // Takes the record directly: a seed written moments ago is not in
    // store.seeds until the next getCache().
    if (store.isWeb || !sd.salt || !(await this.isUnlocked())) return;
    const state = await read();
    if (!state) return;
    const key = await deriveKeyFromPassSalt(
      pass,
      sd.salt,
      sd.iterations ?? KDF_LEGACY_ITERATIONS,
      true
    );
    const raw = await crypto.subtle.exportKey("raw", key);
    state.keys[sd.id] = new Uint8Array(raw).toBase64();
    await write(state);
  },

  async clear() {
    const store = useAppStore();
    store.unlocked = false;
    if (store.isWeb) return;
    await browser.storage.session.remove(STATE_KEY);
    await browser.alarms.clear(ALARM);
  },
};

export default Unlock;
