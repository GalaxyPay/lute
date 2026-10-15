import { importMk } from "@/services/kdf";
import type { MasterKey } from "@/types";

/**
 * Session unlock, extension only, password mode only.
 *
 * The web build has no memory-only store: sessionStorage is not shared with the
 * sign popup (its opener is the dApp, a different origin) and anything else
 * would mean writing a password shortcut to disk. browser.storage.session is
 * never persisted, is wiped on browser restart, and is not visible to content
 * scripts, so the feature is offered there and nowhere else. A device-mode
 * wallet has nothing to unlock.
 *
 * What is cached is the keystore master key, never the password. An unlock
 * therefore cannot be replayed as a password, and mnemonic export still
 * prompts because it never reads this cache.
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
  // Raw master key, base64. Raw bytes rather than a structured-cloned
  // CryptoKey because storage.session does not reliably round-trip CryptoKey,
  // and in a memory-only area readable solely by trusted extension contexts the
  // distinction buys nothing.
  mk: string;
  // So a key from before a mode switch in another context is never used.
  id: string;
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
  // State written by 1.x (a per-seed key map) has no `mk` and reads as locked.
  if (!state?.mk) return false;
  return Date.now() < Math.min(state.expiresAt, state.hardExpiresAt);
}

const Unlock = {
  enabled() {
    const store = useAppStore();
    return (
      !store.isWeb &&
      store.autoLockMinutes > 0 &&
      store.keystoreMode === "password"
    );
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

  async get(id: string): Promise<MasterKey | undefined> {
    if (!(await this.isUnlocked())) return undefined;
    const state = await read();
    if (!state || state.id !== id) return undefined;
    const raw = Uint8Array.fromBase64(state.mk);
    try {
      return { key: await importMk(raw), id };
    } finally {
      raw.fill(0);
    }
  },

  /** Replaces any live window. The caller zeroes `raw`. */
  async unlock(raw: Uint8Array, id: string) {
    const store = useAppStore();
    if (!this.enabled()) return;
    const now = Date.now();
    await write({
      mk: raw.toBase64(),
      id,
      expiresAt: now + store.autoLockMinutes * 60_000,
      hardExpiresAt: now + HARD_CAP_MS,
    });
    store.unlocked = true;
  },

  /**
   * Slide the idle window. Called only after the cached key was used, never on
   * failures and never on general UI activity — tying the refresh to actual
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

  async clear() {
    const store = useAppStore();
    store.unlocked = false;
    if (store.isWeb) return;
    await browser.storage.session.remove(STATE_KEY);
    await browser.alarms.clear(ALARM);
  },
};

export default Unlock;
