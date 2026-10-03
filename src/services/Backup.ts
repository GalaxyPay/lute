/**
 * Encrypted wallet backup, for moving accounts between the web app and the
 * extension (separate origins, separate databases) or keeping a copy.
 *
 * The file is encrypted under its own password with a fresh salt, never under
 * the wallet's master key: a leaked file plus a password must not open the live
 * wallet. It is an offline brute-force target, hence the higher iteration
 * count. Secrets are carried decrypted inside it, and re-encrypted under the
 * receiving wallet's master key on restore.
 *
 * Accounts whose secret cannot travel are listed as skipped instead: 1.x
 * records that are not in the keystore yet, and passkey seeds (a passkey is
 * bound to the origin that registered it).
 */
import { get, getAll, keys } from "@/dbLute";
import { keystoreId, secretStatus } from "@/services/accountSecret";
import Keystore, { type SecretItem } from "@/services/Keystore";
import { KDF, deriveKeyFromPassSalt, randomBytes, randomIv } from "@/services/kdf";
import type {
  FalconSeedData,
  KeystoreForm,
  KeystoreKind,
  KeystoreRecord,
  LuteAccount,
  MasterKey,
  SeedData,
} from "@/types";

export const BACKUP = {
  magic: "lute-backup",
  v: 1,
  iterations: 1_000_000,
};

/** See setKdfIterationsForTests. */
export function setBackupIterationsForTests(iterations: number) {
  BACKUP.iterations = iterations;
}

const AAD = new TextEncoder().encode(`${BACKUP.magic}:v${BACKUP.v}`);

export interface BackupSecret {
  kind: KeystoreKind;
  form: KeystoreForm;
  id: string;
  data: string;
}

export interface Skipped {
  addr: string;
  reason: string;
}

export interface BackupPayload {
  exportedAt: string;
  from: "web" | "extension";
  appVersion: string;
  accounts: LuteAccount[];
  secrets: BackupSecret[];
  skipped: Skipped[];
}

interface BackupFile {
  magic: string;
  v: number;
  kdf: string;
  iterations: number;
  salt: string;
  iv: string;
  data: string;
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

async function fileKey(pass: string, salt: Uint8Array, iterations: number) {
  return await deriveKeyFromPassSalt(pass, salt, iterations);
}

const Backup = {
  async exportBundle(
    mk: MasterKey,
    filePass: string,
    meta: { from: BackupPayload["from"]; appVersion: string }
  ) {
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
    const secrets: BackupSecret[] = [];
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
    const payload: BackupPayload = {
      exportedAt: new Date().toISOString(),
      ...meta,
      accounts: included,
      secrets,
      skipped,
    };
    const salt = randomBytes(32);
    const iv = randomIv();
    const key = await fileKey(filePass, salt, BACKUP.iterations);
    const data = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: AAD },
      key,
      new TextEncoder().encode(JSON.stringify(payload, replacer))
    );
    const file: BackupFile = {
      magic: BACKUP.magic,
      v: BACKUP.v,
      kdf: KDF.alg,
      iterations: BACKUP.iterations,
      salt: salt.toBase64(),
      iv: iv.toBase64(),
      data: new Uint8Array(data).toBase64(),
    };
    return { text: JSON.stringify(file), skipped };
  },

  /** Decrypt a backup file. Throws OperationError on a wrong password. */
  async readBundle(text: string, filePass: string): Promise<BackupPayload> {
    let file: BackupFile;
    try {
      file = JSON.parse(text);
    } catch {
      throw Error("Not a Lute backup file");
    }
    if (file?.magic !== BACKUP.magic) throw Error("Not a Lute backup file");
    if (file.v !== BACKUP.v || file.kdf !== KDF.alg)
      throw Error("This backup was made by a newer version of Lute");
    const key = await fileKey(
      filePass,
      Uint8Array.fromBase64(file.salt),
      file.iterations
    );
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: Uint8Array.fromBase64(file.iv),
        additionalData: AAD,
      },
      key,
      Uint8Array.fromBase64(file.data)
    );
    return JSON.parse(new TextDecoder().decode(plain), reviver);
  },

  /**
   * Add a backup's accounts and their secrets to this wallet. Accounts already
   * here are left alone. HD seeds get new seed ids here and their accounts are
   * repointed at them. Everything lands in one transaction.
   */
  async restoreBundle(mk: MasterKey, payload: BackupPayload) {
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
        items.push({ kind: s.kind, form: s.form, plaintext: Uint8Array.fromBase64(s.data) });
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

export default Backup;
