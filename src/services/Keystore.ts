/**
 * One master key (MK) encrypts every local secret, in one of two modes:
 *
 * - password: a random key wrapped under PBKDF2(password). Unwrapping it is
 *   the password check.
 * - device: a non-extractable CryptoKey stored as is. No prompts, the same
 *   protection 1.x gave Algo25 keys, and export still works.
 *
 * Exportable forms keep the mnemonic material next to the signing material, so
 * signing never rebuilds a phrase.
 *
 * Writes spanning records, the header or the account list go through
 * keystoreTx and re-check the header inside it: the side panel and the options
 * page share this database but not their caches.
 *
 * 1.x data stays readable via @legacy-read paths until migrateLegacy (first
 * password entry) or upgradeSecret (mnemonic re-entry) moves it.
 */
import {
  get,
  getAll,
  KeystoreConflict,
  keystoreTx,
  stampAccounts,
} from "@/dbLute";
import {
  KDF,
  deriveKeyFromPassSalt,
  generateDeviceMk,
  importMk,
  keystoreAad,
  mkAad,
  randomBytes,
  randomIv,
  randomSalt,
} from "@/services/kdf";
import Seed from "@/services/Seed";
import Unlock from "@/services/Unlock";
import type {
  DeviceKeystoreHeader,
  FalconSeedData,
  KeystoreForm,
  KeystoreHeader,
  KeystoreKind,
  KeystoreMode,
  KeystoreRecord,
  LuteAccount,
  MasterKey,
  PasswordKeystoreHeader,
  SeedData,
} from "@/types";
import {
  badPassword,
  bs,
  bytesEqual,
  concatBytes as concat,
  falconKeyFromKeySeed,
  getFalconAddress,
  getFalconKey,
  isBadPassword,
} from "@/utils/keys";
import {
  BIP32DerivationType,
  fromSeed,
  harden,
  KeyContext,
  XHDWalletAPI,
} from "@algorandfoundation/xhd-wallet-api";
import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import algosdk, { FALCON_1024_SCHEME } from "algosdk";

const BIP39_SEED_BYTES = 64;
const BIP39_ENTROPY_BYTES = 32;
const SEED_ID_DRIFT = "Seed id moved";

function newId() {
  return randomBytes(16).toHex();
}

function sameKeys<T>(current: T[], expected: T[]) {
  const a = [...current].sort();
  const b = [...expected].sort();
  return a.length === b.length && a.every((k, ix) => k === b[ix]);
}

export function validLength(kind: KeystoreKind, form: KeystoreForm, n: number) {
  switch (`${kind}/${form}`) {
    case "bip39/entropy":
      // 24 words only.
      return n - BIP39_SEED_BYTES === BIP39_ENTROPY_BYTES;
    case "bip39/seed":
      return n === BIP39_SEED_BYTES;
    case "algo25/seed":
      return n === 32;
    case "falcon25/seed":
      return n === 64;
    case "falcon25/hash":
      return n === 32;
    default:
      return false;
  }
}

export function isExportable(kind: KeystoreKind, form: KeystoreForm) {
  return (
    (kind === "bip39" && form === "entropy") ||
    (kind !== "bip39" && form === "seed")
  );
}

/** Returns a copy. The caller zeroes it. */
export function signingMaterial(
  kind: KeystoreKind,
  form: KeystoreForm,
  pt: Uint8Array
) {
  switch (kind) {
    case "bip39":
      return pt.slice(pt.length - BIP39_SEED_BYTES);
    case "algo25":
      return pt.slice(0, 32);
    case "falcon25":
      return form === "seed" ? pt.slice(32) : pt.slice();
  }
}

/** Build the exportable plaintext for a mnemonic. The caller zeroes it. */
export function plaintextFromMnemonic(kind: KeystoreKind, mn: string) {
  switch (kind) {
    case "bip39": {
      if (!bip39.validateMnemonic(mn, wordlist)) throw Error("Invalid Mnemonic");
      const entropy = bip39.mnemonicToEntropy(mn, wordlist);
      if (entropy.length !== BIP39_ENTROPY_BYTES) {
        entropy.fill(0);
        throw Error("Invalid Mnemonic");
      }
      const seed = bip39.mnemonicToSeedSync(mn);
      const plaintext = concat(entropy, seed);
      entropy.fill(0);
      seed.fill(0);
      return { form: "entropy" as const, plaintext };
    }
    case "algo25":
      // Validates the checksum word.
      return { form: "seed" as const, plaintext: algosdk.seedFromMnemonic(mn) };
    case "falcon25": {
      const seed = algosdk.seedFromMnemonic(mn);
      const keySeed = algosdk.pq25WordMnemonicToSeed(mn, FALCON_1024_SCHEME);
      const plaintext = concat(seed, keySeed);
      seed.fill(0);
      keySeed.fill(0);
      return { form: "seed" as const, plaintext };
    }
  }
}

export function mnemonicFromPlaintext(kind: KeystoreKind, pt: Uint8Array) {
  switch (kind) {
    case "bip39":
      return bip39.entropyToMnemonic(
        pt.subarray(0, pt.length - BIP39_SEED_BYTES),
        wordlist
      );
    case "algo25":
      return algosdk.mnemonicFromSeed(pt);
    case "falcon25":
      return algosdk.mnemonicFromSeed(pt.subarray(0, 32));
  }
}

async function buildPasswordHeader(
  pass: string,
  raw: Uint8Array,
  id: string,
  gen: number
): Promise<PasswordKeystoreHeader> {
  const salt = randomSalt();
  const wrapIv = randomIv();
  const kek = await deriveKeyFromPassSalt(pass, salt, KDF.iterations);
  const wrappedMk = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: wrapIv, additionalData: mkAad(id) },
    kek,
    bs(raw)
  );
  return {
    v: 2,
    mode: "password",
    id,
    gen,
    kdf: KDF.alg,
    iterations: KDF.iterations,
    salt,
    wrapIv,
    wrappedMk,
  };
}

/** Throws OperationError on a wrong password. The caller zeroes the result. */
async function unwrapRaw(pass: string, h: PasswordKeystoreHeader) {
  const kek = await deriveKeyFromPassSalt(pass, h.salt, h.iterations);
  const raw = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bs(h.wrapIv), additionalData: mkAad(h.id) },
    kek,
    h.wrappedMk
  );
  return new Uint8Array(raw);
}

async function encryptRecord(
  mk: MasterKey,
  kind: KeystoreKind,
  form: KeystoreForm,
  id: string,
  plaintext: Uint8Array
): Promise<KeystoreRecord> {
  if (!validLength(kind, form, plaintext.length))
    throw Error(`Invalid ${kind} ${form} length`);
  const iv = randomIv();
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: keystoreAad(kind, form, id) },
    mk.key,
    bs(plaintext)
  );
  return { id, kind, form, iv, data };
}

async function decryptRecord(mk: MasterKey, rec: KeystoreRecord) {
  const pt = new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: bs(rec.iv),
        additionalData: keystoreAad(rec.kind, rec.form, rec.id),
      },
      mk.key,
      rec.data
    )
  );
  if (!validLength(rec.kind, rec.form, pt.length)) {
    pt.fill(0);
    throw Error("Corrupt keystore record");
  }
  return pt;
}

/** Aborts if the header or the record set moved since they were read. */
async function switchMasterKey(
  from: MasterKey,
  expect: KeystoreHeader,
  next: KeystoreHeader,
  to: MasterKey
) {
  const recs = await getAll("keystore");
  const out: KeystoreRecord[] = [];
  for (const r of recs) {
    const pt = await decryptRecord(from, r);
    try {
      out.push(await encryptRecord(to, r.kind, r.form, r.id, pt));
    } finally {
      pt.fill(0);
    }
  }
  await keystoreTx(async (tx) => {
    const app = tx.objectStore("app");
    const cur: KeystoreHeader | undefined = await app.get("keystore");
    if (cur?.id !== expect.id || cur.gen !== expect.gen)
      throw new KeystoreConflict();
    const ids = await tx.objectStore("keystore").getAllKeys();
    if (!sameKeys(ids, recs.map((r) => r.id))) throw new KeystoreConflict();
    app.put(next, "keystore");
    for (const r of out) tx.objectStore("keystore").put(r, r.id);
  });
  await Unlock.clear();
}

export interface SecretItem {
  kind: KeystoreKind;
  form: KeystoreForm;
  // Omit for a new bip39 seed to allocate the next seed id.
  id?: string;
  plaintext: Uint8Array;
}

export interface PutOptions {
  // 1.x records this write supersedes, deleted in the same transaction.
  deleteLegacy?: { keys?: string[]; seeds?: number[]; falcon25?: string[] };
  // Rewrite the account list in the same transaction, from the database copy
  // rather than a cache.
  accounts?: (current: LuteAccount[], ids: string[]) => LuteAccount[];
}

export function withFalconPks(
  accounts: LuteAccount[],
  pks: Map<string, string>
) {
  return accounts.map((a) => {
    const falconPk = pks.get(a.addr);
    return falconPk && !a.falconPk ? { ...a, falconPk } : a;
  });
}

const Keystore = {
  validLength,
  isExportable,
  signingMaterial,
  plaintextFromMnemonic,
  mnemonicFromPlaintext,
  decryptRecord,

  async header(): Promise<KeystoreHeader | undefined> {
    return await get("app", "keystore");
  },

  /** A 1.x verifier not yet replaced by a header. */
  async hasLegacyVerifier() {
    return !!(await get("app", "password"));
  },

  /** Without a header, the mode the wallet will get on first use. */
  async mode(): Promise<KeystoreMode> {
    const h = await this.header();
    if (h) return h.mode;
    return (await this.hasLegacyVerifier()) ? "password" : "device";
  },

  /** Throws "Password Required" when locked and no `pass` is given. */
  async getMk(pass?: string): Promise<MasterKey> {
    const h = await this.header();
    if (h?.mode === "device") return { key: h.mk, id: h.id };
    if (!h && !(await this.hasLegacyVerifier())) return await this.createDevice();
    if (h) {
      const cached = await Unlock.get(h.id);
      if (cached) {
        await Unlock.touch();
        return cached;
      }
    }
    if (!pass) throw Error("Password Required");
    return await this.unlockWithPassword(pass);
  },

  /**
   * Bypasses the session unlock, for export and backup, where an unlocked
   * session must not stand in for the password.
   */
  async unwrap(pass: string): Promise<MasterKey> {
    const h = await this.header();
    if (h?.mode !== "password") throw Error("The wallet has no password");
    const raw = await unwrapRaw(pass, h);
    try {
      return { key: await importMk(raw), id: h.id };
    } finally {
      raw.fill(0);
    }
  },

  /** Only for a wallet with no password. */
  async createDevice(): Promise<MasterKey> {
    const key = await generateDeviceMk();
    const h: DeviceKeystoreHeader = {
      v: 2,
      mode: "device",
      id: newId(),
      gen: 1,
      mk: key,
    };
    try {
      await keystoreTx(async (tx) => {
        const app = tx.objectStore("app");
        if ((await app.get("keystore")) || (await app.get("password")))
          throw new KeystoreConflict();
        await app.put(h, "keystore");
      });
      return { key, id: h.id };
    } catch (err) {
      if (!(err instanceof KeystoreConflict)) throw err;
      // Another context got there first. Use its keystore if it is ours to use.
      const cur = await this.header();
      if (cur?.mode === "device") return { key: cur.mk, id: cur.id };
      throw Error("Password Required");
    }
  },

  /**
   * The single entry point for a typed wallet password, so header creation and
   * 1.x migration always happen. Throws OperationError on a wrong password.
   */
  async unlockWithPassword(pass: string): Promise<MasterKey> {
    try {
      return await this.unlockOnce(pass);
    } catch (err) {
      // Another context created the header or migrated first; retry on its header.
      if (!(err instanceof KeystoreConflict)) throw err;
      return await this.unlockOnce(pass);
    }
  },

  async unlockOnce(pass: string): Promise<MasterKey> {
    const h = await this.header();
    if (h?.mode === "device") return { key: h.mk, id: h.id };
    let raw: Uint8Array;
    let create: PasswordKeystoreHeader | undefined;
    if (!h) {
      // Never create a password keystore from an unconfirmed single entry: a
      // typo would silently become the wallet password.
      if (!(await this.hasLegacyVerifier()))
        throw Error("No wallet password is set");
      if (!(await Seed.verifyPassword(pass))) throw badPassword();
      raw = randomBytes(32);
      create = await buildPasswordHeader(pass, raw, newId(), 1);
    } else {
      raw = await unwrapRaw(pass, h);
    }
    try {
      const id = create?.id ?? h!.id;
      const mk = { key: await importMk(raw), id };
      await this.migrateLegacy(pass, mk, create ? { create } : { expect: h! });
      await Unlock.unlock(raw, id);
      return mk;
    } finally {
      raw.fill(0);
    }
  },

  /**
   * @legacy-read Move every 1.x seed `pass` decrypts into the keystore. 1.x
   * plaintext is one-way, so they land as bip39/seed and falcon25/hash:
   * signable, not exportable until the mnemonic is re-entered. Records under
   * another password stay put.
   *
   * Falcon accounts also get falconPk, which 1.x never stored, so dapps can be
   * given the key without unlocking.
   *
   * With `create` a conflict propagates so the caller can retry; with `expect`
   * it means another context is doing the same work, and is ignored.
   */
  async migrateLegacy(
    pass: string,
    mk: MasterKey,
    opts: { create?: PasswordKeystoreHeader; expect?: KeystoreHeader }
  ) {
    const seeds = ((await getAll("seeds")) as SeedData[]).filter((s) => s.data);
    const falcons = (
      (await getAll("falcon25-seeds")) as FalconSeedData[]
    ).filter((s) => s.data);
    if (!opts.create && !seeds.length && !falcons.length)
      return { migrated: 0, skipped: 0 };
    const recs: KeystoreRecord[] = [];
    const movedSeeds: number[] = [];
    const movedFalcons: string[] = [];
    const falconPks = new Map<string, string>();
    let skipped = 0;
    const carry = async (
      sd: SeedData | FalconSeedData,
      kind: KeystoreKind,
      form: KeystoreForm
    ) => {
      let pt: Uint8Array;
      try {
        pt = await Seed.decryptSeed(pass, sd);
      } catch {
        // Wrong password for this record, or a malformed one: leave it.
        skipped++;
        return false;
      }
      try {
        if (!validLength(kind, form, pt.length)) {
          skipped++;
          return false;
        }
        recs.push(await encryptRecord(mk, kind, form, `${kind}:${sd.id}`, pt));
        if (kind === "falcon25") {
          // Record the key under the address it derives, never the record id,
          // so a mislabelled record cannot attach a key to the wrong account.
          const { address, publicKey } = falconKeyFromKeySeed(pt);
          falconPks.set(address.toString(), publicKey.toBase64());
        }
        return true;
      } finally {
        pt.fill(0);
      }
    };
    for (const sd of seeds)
      if (await carry(sd, "bip39", "seed")) movedSeeds.push(sd.id);
    for (const sd of falcons)
      if (await carry(sd, "falcon25", "hash")) movedFalcons.push(sd.id);

    const write = keystoreTx(async (tx) => {
      const app = tx.objectStore("app");
      const cur: KeystoreHeader | undefined = await app.get("keystore");
      if (opts.create ? cur : cur?.id !== opts.expect?.id)
        throw new KeystoreConflict();
      // A vanished record was moved by another context; don't put a copy back.
      for (const id of movedSeeds)
        if (!(await tx.objectStore("seeds").get(id)))
          throw new KeystoreConflict();
      for (const addr of movedFalcons)
        if (!(await tx.objectStore("falcon25-seeds").get(addr)))
          throw new KeystoreConflict();
      if (opts.create) {
        app.put(opts.create, "keystore");
        // The header is the password check from here on.
        app.delete("password");
      }
      for (const r of recs) tx.objectStore("keystore").put(r, r.id);
      for (const id of movedSeeds) tx.objectStore("seeds").delete(id);
      for (const addr of movedFalcons)
        tx.objectStore("falcon25-seeds").delete(addr);
      if (falconPks.size) {
        const current: LuteAccount[] = (await app.get("accounts")) ?? [];
        app.put(stampAccounts(withFalconPks(current, falconPks)), "accounts");
      }
    });
    if (opts.create) await write;
    else {
      try {
        await write;
      } catch (err) {
        if (!(err instanceof KeystoreConflict)) throw err;
      }
    }
    return { migrated: recs.length, skipped };
  },

  /** Reads the database, never a cache. */
  async getSecret(mk: MasterKey, id: string) {
    const rec: KeystoreRecord | undefined = await get("keystore", id);
    if (!rec) throw Error("Secret Not Found");
    return { rec, plaintext: await decryptRecord(mk, rec) };
  },

  /** Retries once if another context allocated a seed id in between. */
  async putSecrets(
    mk: MasterKey,
    items: SecretItem[],
    opts: PutOptions = {}
  ): Promise<string[]> {
    for (let attempt = 0; ; attempt++) {
      const start: number = (await get("app", "nextSeedId")) ?? 1;
      let next = start;
      const ids = items.map((it) => {
        if (it.id) return it.id;
        if (it.kind !== "bip39") throw Error(`An id is required for ${it.kind}`);
        return `bip39:${next++}`;
      });
      const recs = await Promise.all(
        items.map((it, ix) =>
          encryptRecord(mk, it.kind, it.form, ids[ix]!, it.plaintext)
        )
      );
      try {
        await keystoreTx(async (tx) => {
          const app = tx.objectStore("app");
          const cur: KeystoreHeader | undefined = await app.get("keystore");
          if (cur?.id !== mk.id)
            throw new KeystoreConflict(
              "The wallet key changed in another window. Try again."
            );
          if (next !== start) {
            if (((await app.get("nextSeedId")) ?? 1) !== start)
              throw new KeystoreConflict(SEED_ID_DRIFT);
            app.put(next, "nextSeedId");
          }
          for (const r of recs) tx.objectStore("keystore").put(r, r.id);
          for (const addr of opts.deleteLegacy?.keys ?? [])
            tx.objectStore("keys").delete(addr);
          for (const addr of opts.deleteLegacy?.falcon25 ?? [])
            tx.objectStore("falcon25-seeds").delete(addr);
          for (const id of opts.deleteLegacy?.seeds ?? []) {
            // Never a passkey credential: those hold no secret to supersede.
            const sd = await tx.objectStore("seeds").get(id);
            if (sd && !sd.credentialId) tx.objectStore("seeds").delete(id);
          }
          if (opts.accounts) {
            const current: LuteAccount[] = (await app.get("accounts")) ?? [];
            app.put(stampAccounts(opts.accounts(current, ids)), "accounts");
          }
        });
        return ids;
      } catch (err) {
        if (
          !(err instanceof KeystoreConflict) ||
          err.message !== SEED_ID_DRIFT ||
          attempt
        )
          throw err;
      }
    }
  },

  /**
   * A bip39 mnemonic already in the keystore keeps its id, so re-importing
   * doesn't create a second seed; a one-way copy is upgraded in place.
   */
  async storeMnemonic(
    mk: MasterKey,
    kind: KeystoreKind,
    mn: string,
    opts: PutOptions & { id?: string } = {}
  ) {
    const { form, plaintext } = plaintextFromMnemonic(kind, mn);
    try {
      const id =
        opts.id ??
        (kind === "bip39" ? await this.findBip39(mk, plaintext) : undefined);
      const [stored] = await this.putSecrets(
        mk,
        [{ kind, form, id, plaintext }],
        opts
      );
      return stored!;
    } finally {
      plaintext.fill(0);
    }
  },

  /** Compares seeds, not entropy, so one-way records match too. */
  async findBip39(mk: MasterKey, plaintext: Uint8Array) {
    const seed = signingMaterial("bip39", "entropy", plaintext);
    try {
      const recs = ((await getAll("keystore")) as KeystoreRecord[]).filter(
        (r) => r.kind === "bip39"
      );
      for (const rec of recs) {
        const pt = await decryptRecord(mk, rec);
        const other = signingMaterial("bip39", rec.form, pt);
        pt.fill(0);
        const same = bytesEqual(seed, other);
        other.fill(0);
        if (same) return rec.id;
      }
    } finally {
      seed.fill(0);
    }
  },

  /**
   * Also removes a 1.x or passkey record. Refuses, writing nothing, if any
   * account in the database still uses the seed.
   */
  async removeSeed(seedId: number) {
    await keystoreTx(async (tx) => {
      const accounts: LuteAccount[] =
        (await tx.objectStore("app").get("accounts")) ?? [];
      if (accounts.some((a) => a.seedId === seedId))
        throw Error("This seed still has accounts in the wallet");
      tx.objectStore("keystore").delete(`bip39:${seedId}`);
      tx.objectStore("seeds").delete(seedId);
    });
  },

  /**
   * Checked against public data only (xpub, else address), so no 1.x password
   * is needed.
   */
  async mnemonicMatches(
    kind: KeystoreKind,
    mn: string,
    accts: LuteAccount[]
  ): Promise<boolean> {
    if (!accts.length) return false;
    try {
      switch (kind) {
        case "algo25":
          return accts.every(
            (a) => algosdk.mnemonicToSecretKey(mn).addr.toString() === a.addr
          );
        case "falcon25":
          return accts.every((a) => getFalconAddress(mn).toString() === a.addr);
        case "bip39": {
          if (!bip39.validateMnemonic(mn, wordlist)) return false;
          const seed = bip39.mnemonicToSeedSync(mn);
          try {
            return await this.seedMatches(seed, accts);
          } finally {
            seed.fill(0);
          }
        }
      }
    } catch {
      // A bad checksum or an unknown word: not a match.
      return false;
    }
  },

  async seedMatches(seed: Uint8Array, accts: LuteAccount[]) {
    if (!accts.length) return false;
    const copy = Buffer.from(seed);
    const root = fromSeed(copy);
    copy.fill(0);
    const api = new XHDWalletAPI();
    try {
      for (const a of accts) {
        if (a.slot == null) return false;
        if (a.xpub) {
          const xpub = await api.deriveKey(
            root,
            [harden(44), harden(283), harden(a.slot), 0],
            false,
            BIP32DerivationType.Peikert
          );
          if (xpub.toBase64() !== a.xpub) return false;
        } else {
          const pk = await api.keyGen(root, KeyContext.Address, a.slot, 0);
          if (new algosdk.Address(pk).toString() !== a.addr) return false;
        }
      }
      return true;
    } finally {
      root.fill(0);
    }
  },

  /** The caller must check mnemonicMatches first. */
  async upgradeSecret(
    mk: MasterKey,
    kind: KeystoreKind,
    mn: string,
    target: { seedId?: number; addr: string }
  ) {
    const id =
      kind === "bip39" ? `bip39:${target.seedId}` : `${kind}:${target.addr}`;
    const deleteLegacy =
      kind === "bip39"
        ? { seeds: [target.seedId!] }
        : kind === "falcon25"
          ? { falcon25: [target.addr] }
          : { keys: [target.addr] };
    // Migration skips a 1.x Falcon seed under another password, so its account
    // may still lack falconPk.
    let accounts: PutOptions["accounts"];
    if (kind === "falcon25") {
      const { address, publicKey } = getFalconKey(mn);
      const pks = new Map([[address.toString(), publicKey.toBase64()]]);
      accounts = (current) => withFalconPks(current, pks);
    }
    return await this.storeMnemonic(mk, kind, mn, {
      id,
      deleteLegacy,
      accounts,
    });
  },

  async exportMnemonic(mk: MasterKey, id: string) {
    const rec: KeystoreRecord | undefined = await get("keystore", id);
    if (!rec) throw Error("Secret Not Found");
    if (!isExportable(rec.kind, rec.form))
      throw Error(
        "This account was added before mnemonic export. Upgrade it by re-entering its mnemonic first."
      );
    const pt = await decryptRecord(mk, rec);
    try {
      return mnemonicFromPlaintext(rec.kind, pt);
    } finally {
      pt.fill(0);
    }
  },

  /**
   * Without a header, any forgotten 1.x password's seeds stay where they are,
   * readable only with that password.
   */
  async newPassword(pass: string): Promise<MasterKey> {
    const h = await this.header();
    if (h?.mode === "password") throw Error("A wallet password is already set");
    const raw = randomBytes(32);
    try {
      const next = await buildPasswordHeader(
        pass,
        raw,
        newId(),
        (h?.gen ?? 0) + 1
      );
      const mk = { key: await importMk(raw), id: next.id };
      if (h) {
        await switchMasterKey({ key: h.mk, id: h.id }, h, next, mk);
      } else {
        await keystoreTx(async (tx) => {
          const app = tx.objectStore("app");
          if (await app.get("keystore")) throw new KeystoreConflict();
          app.put(next, "keystore");
          app.delete("password");
        });
      }
      return mk;
    } finally {
      raw.fill(0);
    }
  },

  /**
   * The master key is unchanged, so this is a single header write. Returns
   * false on a wrong current password.
   */
  async rotate(oldPass: string, newPass: string) {
    let h = await this.header();
    try {
      // A 1.x wallet needs its keystore created from the current password.
      if (!h) await this.unlockWithPassword(oldPass);
      h = await this.header();
      if (h?.mode !== "password") throw Error("The wallet has no password");
      const raw = await unwrapRaw(oldPass, h);
      try {
        const next = await buildPasswordHeader(newPass, raw, h.id, h.gen + 1);
        await keystoreTx(async (tx) => {
          const app = tx.objectStore("app");
          const cur: KeystoreHeader | undefined = await app.get("keystore");
          if (cur?.id !== h!.id || cur.gen !== h!.gen)
            throw new KeystoreConflict();
          app.put(next, "keystore");
        });
      } finally {
        raw.fill(0);
      }
    } catch (err) {
      if (isBadPassword(err)) return false;
      throw err;
    }
    // Contexts holding the session unlock re-prompt once with the new password.
    await Unlock.clear();
    return true;
  },

  /** Switch to device mode. Returns false on a wrong password. */
  async removePassword(pass: string) {
    const h = await this.header();
    if (h?.mode !== "password") throw Error("The wallet has no password");
    let raw: Uint8Array;
    try {
      raw = await unwrapRaw(pass, h);
    } catch (err) {
      if (isBadPassword(err)) return false;
      throw err;
    }
    try {
      const from = { key: await importMk(raw), id: h.id };
      const key = await generateDeviceMk();
      const next: DeviceKeystoreHeader = {
        v: 2,
        mode: "device",
        id: newId(),
        gen: h.gen + 1,
        mk: key,
      };
      await switchMasterKey(from, h, next, { key, id: next.id });
    } finally {
      raw.fill(0);
    }
    return true;
  },
};

export default Keystore;
