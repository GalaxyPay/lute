/**
 * The accounts and keys one wallet hands to another during a sync between the
 * web app and the extension (separate origins, separate databases).
 *
 * This module only builds and applies the payload. It never encrypts it: the
 * sync session seals it under an ephemeral key for the one transfer, so keys
 * are never stored outside a wallet or sealed under a user-chosen password.
 *
 * Accounts whose secret cannot travel are listed as skipped instead: 1.x
 * records that are not in the keystore yet, and passkey seeds (a passkey is
 * bound to the origin that registered it).
 */
import { get, getAll, keys } from "@/dbLute";
import { keystoreId, secretStatus } from "@/services/accountSecret";
import Keystore, { type SecretItem } from "@/services/Keystore";
import type {
  FalconSeedData,
  KeystoreForm,
  KeystoreKind,
  KeystoreRecord,
  LuteAccount,
  MasterKey,
  SeedData,
} from "@/types";

export type WalletSide = "web" | "ext";

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

const Transfer = {
  /** Every account this wallet can hand over, with its decrypted secret. */
  async buildPayload(
    mk: MasterKey,
    meta: { from: WalletSide; appVersion: string }
  ): Promise<TransferPayload> {
    const accounts: LuteAccount[] = (await get("app", "accounts")) ?? [];
    const records = (await getAll("keystore")) as KeystoreRecord[];
    const ctx = {
      keys: (await keys("keys")) as string[],
      seeds: (await getAll("seeds")) as SeedData[],
      falcon25Seeds: (await getAll("falcon25-seeds")) as FalconSeedData[],
      keystore: records,
    };
    const included: LuteAccount[] = [];
    const skipped: Skipped[] = [];
    for (const acct of accounts) {
      const reason = SKIP_REASONS[secretStatus(acct, ctx)];
      if (reason) skipped.push({ addr: acct.addr, reason });
      else included.push(acct);
    }
    const secrets: TransferSecret[] = [];
    for (const rec of records) {
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
   * Add a payload's accounts and their secrets to this wallet. Accounts already
   * here are left alone. HD seeds get new seed ids here and their accounts are
   * repointed at them. Everything lands in one transaction.
   */
  async addPayload(mk: MasterKey, payload: TransferPayload) {
    const current: LuteAccount[] = (await get("app", "accounts")) ?? [];
    const existing = new Set(current.map((a) => a.addr));
    const skipped: Skipped[] = [...payload.skipped];
    const fresh = payload.accounts.filter((a) => {
      if (!existing.has(a.addr)) return true;
      skipped.push({ addr: a.addr, reason: "Already in this wallet" });
      return false;
    });
    const items: SecretItem[] = [];
    const seedOf: number[] = [];
    for (const s of payload.secrets) {
      if (s.kind === "bip39") {
        const oldId = Number(s.id.split(":")[1]);
        if (!fresh.some((a) => a.seedId === oldId && a.slot != null)) continue;
        // No id: a new one is allocated in this wallet.
        items.push({
          kind: s.kind,
          form: s.form,
          plaintext: Uint8Array.fromBase64(s.data),
        });
        seedOf.push(oldId);
      } else if (fresh.some((a) => keystoreId(s.kind, a) === s.id)) {
        items.push({
          kind: s.kind,
          form: s.form,
          id: s.id,
          plaintext: Uint8Array.fromBase64(s.data),
        });
        seedOf.push(-1);
      }
    }
    let added = 0;
    try {
      await Keystore.putSecrets(mk, items, {
        accounts: (now, ids) => {
          const remap = new Map<number, number>();
          ids.forEach((id, ix) => {
            if (seedOf[ix]! >= 0)
              remap.set(seedOf[ix]!, Number(id.split(":")[1]));
          });
          const add: LuteAccount[] = [];
          for (const a of fresh) {
            if (now.some((c) => c.addr === a.addr)) continue;
            if (a.seedId != null && a.slot != null) {
              const seedId = remap.get(a.seedId);
              // Its seed did not travel; the account would be unusable.
              if (seedId == null) continue;
              add.push({ ...a, seedId });
            } else add.push(a);
          }
          added = add.length;
          return now.concat(add);
        },
      });
    } finally {
      items.forEach((it) => it.plaintext.fill(0));
    }
    return { added, skipped };
  },
};

export default Transfer;
