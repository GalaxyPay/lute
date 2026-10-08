/**
 * The sync payload between the web app and the extension (separate origins,
 * separate databases).
 *
 * Not encrypted here: SyncSession seals it under an ephemeral key, so keys are
 * never stored outside a wallet or sealed under a user-chosen password.
 *
 * Passkey seeds can't travel (a passkey is bound to its origin), nor can 1.x
 * records not yet in the keystore; both are listed as skipped.
 *
 * An account the receiver already has is left alone, except that an
 * exportable secret upgrades its one-way or 1.x copy, as re-entering the
 * mnemonic would.
 */
import { get, getAll, keys } from "@/dbLute";
import {
  isHd,
  isUpgradeable,
  keystoreId,
  secretKind,
  type SecretContext,
  secretStatus,
} from "@/services/accountSecret";
import Keystore, {
  type SecretItem,
  signingMaterial,
  validLength,
  withFalconPks,
} from "@/services/Keystore";
import type {
  FalconSeedData,
  KeystoreForm,
  KeystoreKind,
  KeystoreRecord,
  LuteAccount,
  MasterKey,
  SeedData,
} from "@/types";
import {
  ed25519Sign,
  falconAddressFromKeySeed,
  getFalconKey,
} from "@/utils/keys";
import { Address } from "algosdk";

export type WalletSide = "web" | "ext";

const PROBE = new TextEncoder().encode("lute-sync:key-check");

/**
 * Ed25519 is checked by signing so its public key is never derived outside
 * WebCrypto.
 */
async function signsFor(s: TransferSecret, addr: string) {
  const pt = Uint8Array.fromBase64(s.data);
  try {
    if (!validLength(s.kind, s.form, pt.length)) return false;
    const material = signingMaterial(s.kind, s.form, pt);
    try {
      if (s.kind === "falcon25")
        return falconAddressFromKeySeed(material).toString() === addr;
      const key = await crypto.subtle.importKey(
        "raw",
        new Uint8Array(Address.fromString(addr).publicKey),
        { name: "Ed25519" },
        false,
        ["verify"]
      );
      const sig = await ed25519Sign(material, PROBE);
      return await crypto.subtle.verify({ name: "Ed25519" }, key, sig, PROBE);
    } finally {
      material.fill(0);
    }
  } finally {
    pt.fill(0);
  }
}

/** The 64-byte seed of a bip39 secret, as a copy the caller must zero. */
function bip39Seed(s: TransferSecret) {
  const pt = Uint8Array.fromBase64(s.data);
  try {
    if (!validLength(s.kind, s.form, pt.length)) return;
    return signingMaterial(s.kind, s.form, pt);
  } finally {
    pt.fill(0);
  }
}

function secretIds(a: LuteAccount) {
  if (a.appId) return [];
  if (isHd(a)) return [keystoreId("bip39", a)];
  if (a.slot != null) return [];
  return [keystoreId("algo25", a), keystoreId("falcon25", a)];
}

export interface TransferSecret {
  kind: KeystoreKind;
  form: KeystoreForm;
  id: string;
  data: string;
}

export interface Skipped {
  addr: string;
  reason: string;
}

export interface TransferPayload {
  createdAt: string;
  from: WalletSide;
  appVersion: string;
  accounts: LuteAccount[];
  secrets: TransferSecret[];
  skipped: Skipped[];
}

const SKIP_REASONS: Partial<Record<string, string>> = {
  passkey: "Passkey seed: add it again with the same passkey",
  "legacy-seed": "Seed under an old password: upgrade the account first",
  "legacy-key": "Added before mnemonic export: upgrade the account first",
};

// Multisig accounts carry a bigint app id, which JSON cannot represent.
function replacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? { $bigint: value.toString() } : value;
}

function reviver(_key: string, value: any) {
  return value && typeof value === "object" && "$bigint" in value
    ? BigInt(value.$bigint)
    : value;
}

async function secretContext() {
  return {
    keys: (await keys("keys")) as string[],
    seeds: (await getAll("seeds")) as SeedData[],
    falcon25Seeds: (await getAll("falcon25-seeds")) as FalconSeedData[],
    keystore: (await getAll("keystore")) as KeystoreRecord[],
  };
}

/**
 * Plaintext to store if `s` upgrades `mine`, else undefined. Rebuilt from the
 * mnemonic so the signing half can't disagree with it.
 */
async function upgradeFor(
  s: TransferSecret,
  mine: LuteAccount[],
  ctx: SecretContext
) {
  if (!mine.length || !Keystore.isExportable(s.kind, s.form)) return;
  for (const a of mine) {
    if (secretKind(a, ctx) !== s.kind) return;
    if (!isUpgradeable(secretStatus(a, ctx))) return;
  }
  const pt = Uint8Array.fromBase64(s.data);
  let mn: string;
  try {
    if (!Keystore.validLength(s.kind, s.form, pt.length)) return;
    mn = Keystore.mnemonicFromPlaintext(s.kind, pt);
  } finally {
    pt.fill(0);
  }
  if (!(await Keystore.mnemonicMatches(s.kind, mn, mine))) return;
  return { mn, ...Keystore.plaintextFromMnemonic(s.kind, mn) };
}

const Transfer = {
  /** Only secrets in use travel; an orphaned seed stays here. */
  async buildPayload(
    mk: MasterKey,
    meta: { from: WalletSide; appVersion: string }
  ): Promise<TransferPayload> {
    const accounts: LuteAccount[] = (await get("app", "accounts")) ?? [];
    const ctx = await secretContext();
    const records = ctx.keystore;
    const included: LuteAccount[] = [];
    const skipped: Skipped[] = [];
    for (const acct of accounts) {
      const reason = SKIP_REASONS[secretStatus(acct, ctx)];
      if (reason) skipped.push({ addr: acct.addr, reason });
      else included.push(acct);
    }
    const used = new Set(included.flatMap(secretIds));
    const secrets: TransferSecret[] = [];
    for (const rec of records) {
      if (!used.has(rec.id)) continue;
      const pt = await Keystore.decryptRecord(mk, rec);
      try {
        secrets.push({
          kind: rec.kind,
          form: rec.form,
          id: rec.id,
          data: pt.toBase64(),
        });
      } finally {
        pt.fill(0);
      }
    }
    return {
      createdAt: new Date().toISOString(),
      ...meta,
      accounts: included,
      secrets,
      skipped,
    };
  },

  serialize(payload: TransferPayload) {
    return JSON.stringify(payload, replacer);
  },

  deserialize(text: string): TransferPayload {
    return JSON.parse(text, reviver);
  },

  /**
   * Accounts on a seed this wallet already holds join it rather than duplicate
   * it. Everything lands in one transaction.
   */
  async addPayload(mk: MasterKey, payload: TransferPayload) {
    const current: LuteAccount[] = (await get("app", "accounts")) ?? [];
    const ctx = await secretContext();
    const byAddr = new Map(current.map((a) => [a.addr, a]));
    const fresh = payload.accounts.filter((a) => !byAddr.has(a.addr));
    const items: SecretItem[] = [];
    // The sender's seed id behind each item, or -1 for a non-HD secret.
    const seedOf: number[] = [];
    // Sender seed ids that map onto a seed this wallet already holds.
    const remap = new Map<number, number>();
    const deleteLegacy = {
      keys: [] as string[],
      seeds: [] as number[],
      falcon25: [] as string[],
    };
    const falconPks = new Map<string, string>();
    const upgraded = new Set<string>();
    // Fresh accounts whose key does not sign for (or derive) their address.
    const mismatched = new Set<string>();
    try {
      for (const s of payload.secrets) {
        if (s.kind === "bip39") {
          const oldId = Number(s.id.split(":")[1]);
          const sent: LuteAccount[] = [];
          const seed = bip39Seed(s);
          try {
            for (const a of payload.accounts) {
              if (a.seedId !== oldId || a.slot == null) continue;
              if (seed && (await Keystore.seedMatches(seed, [a]))) sent.push(a);
              else if (!byAddr.has(a.addr)) mismatched.add(a.addr);
            }
          } finally {
            seed?.fill(0);
          }
          // Upgrades `target`'s accounts if the sent secret is exportable.
          const join = async (target: number) => {
            const mine = current.filter((c) => isHd(c) && c.seedId === target);
            const up = await upgradeFor(s, mine, ctx);
            if (up) {
              items.push({
                kind: s.kind,
                form: up.form,
                id: `bip39:${target}`,
                plaintext: up.plaintext,
              });
              seedOf.push(-1);
              deleteLegacy.seeds.push(target);
              mine.forEach((c) => upgraded.add(c.addr));
            }
            return { mine, up };
          };
          const targets = new Set<number>();
          for (const a of sent) {
            const c = byAddr.get(a.addr);
            if (c && isHd(c)) targets.add(c.seedId!);
          }
          for (const target of targets) {
            const { mine, up } = await join(target);
            const status = secretStatus(mine[0]!, ctx);
            if (
              !remap.has(oldId) &&
              (up || status === "keystore" || status === "keystore-opaque")
            )
              remap.set(oldId, target);
          }
          if (remap.has(oldId)) continue;
          if (!sent.some((a) => !byAddr.has(a.addr))) continue;
          const plaintext = Uint8Array.fromBase64(s.data);
          // The same seed may be here with no account in common.
          const existing = await Keystore.findBip39(mk, plaintext);
          if (existing) {
            plaintext.fill(0);
            const target = Number(existing.split(":")[1]);
            await join(target);
            remap.set(oldId, target);
            continue;
          }
          // No id: a new one is allocated in this wallet.
          items.push({ kind: s.kind, form: s.form, plaintext });
          seedOf.push(oldId);
        } else if (fresh.some((a) => keystoreId(s.kind, a) === s.id)) {
          const owner = fresh.find((a) => keystoreId(s.kind, a) === s.id)!;
          if (!(await signsFor(s, owner.addr))) {
            mismatched.add(owner.addr);
            continue;
          }
          items.push({
            kind: s.kind,
            form: s.form,
            id: s.id,
            plaintext: Uint8Array.fromBase64(s.data),
          });
          seedOf.push(-1);
        } else {
          const mine = current.filter(
            (c) => !isHd(c) && keystoreId(s.kind, c) === s.id
          );
          const up = await upgradeFor(s, mine, ctx);
          if (!up) continue;
          const addr = mine[0]!.addr;
          items.push({
            kind: s.kind,
            form: up.form,
            id: s.id,
            plaintext: up.plaintext,
          });
          seedOf.push(-1);
          if (s.kind === "falcon25") {
            deleteLegacy.falcon25.push(addr);
            const { publicKey } = getFalconKey(up.mn);
            falconPks.set(addr, publicKey.toBase64());
          } else deleteLegacy.keys.push(addr);
          upgraded.add(addr);
        }
      }
      const skipped: Skipped[] = [...payload.skipped];
      for (const a of payload.accounts)
        if (byAddr.has(a.addr) && !upgraded.has(a.addr))
          skipped.push({ addr: a.addr, reason: "Already in this wallet" });
      for (const addr of mismatched)
        skipped.push({ addr, reason: "Its key does not match its address" });
      let added = 0;
      // Set by the account rewrite, which runs again if putSecrets retries.
      let dropped: Skipped[] = [];
      await Keystore.putSecrets(mk, items, {
        deleteLegacy,
        accounts: (now, ids) => {
          const seedIds = new Map(remap);
          ids.forEach((id, ix) => {
            if (seedOf[ix]! >= 0)
              seedIds.set(seedOf[ix]!, Number(id.split(":")[1]));
          });
          const add: LuteAccount[] = [];
          dropped = [];
          for (const a of fresh) {
            if (mismatched.has(a.addr)) continue;
            if (now.some((c) => c.addr === a.addr)) {
              dropped.push({ addr: a.addr, reason: "Already in this wallet" });
              continue;
            }
            if (a.seedId != null && a.slot != null) {
              const seedId = seedIds.get(a.seedId);
              // Its seed did not travel; the account would be unusable.
              if (seedId == null) {
                dropped.push({ addr: a.addr, reason: "Its seed was not sent" });
                continue;
              }
              add.push({ ...a, seedId });
            } else add.push(a);
          }
          added = add.length;
          return withFalconPks(now, falconPks).concat(add);
        },
      });
      return {
        added,
        upgraded: upgraded.size,
        skipped: skipped.concat(dropped),
      };
    } finally {
      items.forEach((it) => it.plaintext.fill(0));
    }
  },
};

export default Transfer;
