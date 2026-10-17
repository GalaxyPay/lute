/**
 * A "lute" database at schema v3, written the way 1.x wrote it. Encryption is
 * reimplemented here rather than borrowed from src, so the fixture keeps
 * describing 1.x data even as the app's own code changes.
 */
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
import { generateKey } from "falcon-1024";
import { openDB } from "idb";

export const PASS = "correct horse battery";
export const OTHER_PASS = "a different password";
export const TEST_ITERATIONS = 1000;

const filled = (n: number, b: number) => new Uint8Array(n).fill(b);

export const HD_MN = bip39.entropyToMnemonic(filled(32, 1), wordlist);
export const HD2_MN = bip39.entropyToMnemonic(filled(32, 2), wordlist);
export const HD_OTHER_MN = bip39.entropyToMnemonic(filled(32, 3), wordlist);
export const HOT_SEED = filled(32, 4);
export const HOT_MN = algosdk.mnemonicFromSeed(HOT_SEED);
export const FALCON_MN = algosdk.mnemonicFromSeed(filled(32, 5));
export const LEDGER_ADDR = algosdk.encodeAddress(filled(32, 6));
export const WATCH_ADDR = algosdk.encodeAddress(filled(32, 7));
export const MSIG_ADDR = algosdk.encodeAddress(filled(32, 8));
export const PASSKEY_ADDR = algosdk.encodeAddress(filled(32, 9));

export async function hdAccount(mn: string, slot: number) {
  const root = fromSeed(Buffer.from(bip39.mnemonicToSeedSync(mn)));
  const api = new XHDWalletAPI();
  const pk = await api.keyGen(root, KeyContext.Address, slot, 0);
  const xpub = await api.deriveKey(
    root,
    [harden(44), harden(283), harden(slot), 0],
    false,
    BIP32DerivationType.Peikert
  );
  return { addr: new algosdk.Address(pk).toString(), xpub: xpub.toBase64() };
}

export function falconAddress(mn: string) {
  // Same derivation as src/utils/keys.ts, kept local on purpose.
  const keySeed = algosdk.pq25WordMnemonicToSeed(mn, FALCON_1024_SCHEME);
  const { publicKey } = generateKey(keySeed);
  const { address } = algosdk.addressFromPQKey(FALCON_1024_SCHEME, publicKey);
  return { keySeed, addr: address.toString() };
}

const enc = new TextEncoder();

async function passKey(pass: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey(
    "raw",
    enc.encode(pass),
    "PBKDF2",
    false,
    ["deriveKey", "deriveBits"]
  );
  return { material, params: { name: "PBKDF2", salt, iterations, hash: "SHA-256" } };
}

/**
 * A 1.x seed record. legacy: 100k iterations, no iterations field, no
 * additional data. transitional: iterations field, no additional data.
 * current: iterations and kdf fields, record id bound as additional data.
 */
export async function legacySeedRecord(
  pass: string,
  plaintext: Uint8Array,
  id: number | string,
  format: "legacy" | "transitional" | "current"
) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iterations = format === "legacy" ? 100_000 : TEST_ITERATIONS;
  const { material, params } = await passKey(pass, salt, iterations);
  const key = await crypto.subtle.deriveKey(
    params,
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
  const gcm: AesGcmParams = { name: "AES-GCM", iv };
  if (format === "current") gcm.additionalData = enc.encode(String(id));
  const data = await crypto.subtle.encrypt(
    gcm,
    key,
    plaintext as Uint8Array<ArrayBuffer>
  );
  return {
    id,
    salt,
    iv,
    data,
    ...(format !== "legacy" ? { iterations } : {}),
    ...(format === "current" ? { kdf: "pbkdf2-sha256" } : {}),
  };
}

export type VerifierFormat = "legacy" | "raw" | "current";

async function verifier(pass: string, format: VerifierFormat) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  if (format === "legacy") {
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new Uint8Array([...enc.encode(pass), ...salt])
    );
    return { salt: salt.toBase64(), hash: new Uint8Array(hash).toBase64() };
  }
  const { material, params } = await passKey(pass, salt, TEST_ITERATIONS);
  const bits = new Uint8Array(await crypto.subtle.deriveBits(params, material, 256));
  if (format === "raw")
    return {
      salt: salt.toBase64(),
      hash: bits.toBase64(),
      iterations: TEST_ITERATIONS,
    };
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bits));
  return {
    salt: salt.toBase64(),
    hash: hash.toBase64(),
    iterations: TEST_ITERATIONS,
    kdf: "pbkdf2-sha256",
  };
}

export async function hotKey(seed: Uint8Array) {
  const prefix = Uint8Array.fromBase64("MC4CAQAwBQYDK2VwBCIEIA==");
  return await crypto.subtle.importKey(
    "pkcs8",
    new Uint8Array([...prefix, ...seed]),
    { name: "Ed25519" },
    false,
    ["sign"]
  );
}

export interface Fixture {
  hdA0: { addr: string; xpub: string };
  hdA2: { addr: string; xpub: string };
  hdB0: { addr: string; xpub: string };
  hdOther0: { addr: string; xpub: string };
  hotAddr: string;
  falconAddr: string;
  hotKey: CryptoKey;
}

/**
 * Seed ids: 1 legacy-format HD seed (PASS), 2 current-format HD seed (PASS),
 * 3 passkey credential, 4 current-format HD seed under OTHER_PASS. One Falcon
 * account under PASS, one Algo25 CryptoKey, plus Ledger, watch, multisig and a
 * passkey HD account. With verifier "none" the wallet never had a password,
 * so it holds no encrypted seeds.
 */
export async function buildV3(
  verifierFormat: VerifierFormat | "none"
): Promise<Fixture> {
  const falconAddr = falconAddress(FALCON_MN).addr;
  const hdA0 = await hdAccount(HD_MN, 0);
  const hdA2 = await hdAccount(HD_MN, 2);
  const hdB0 = await hdAccount(HD2_MN, 0);
  const hdOther0 = await hdAccount(HD_OTHER_MN, 0);
  const hotAddr = algosdk.mnemonicToSecretKey(HOT_MN).addr.toString();
  const key = await hotKey(HOT_SEED);
  const withPassword = verifierFormat !== "none";

  const db = await openDB("lute", 3, {
    upgrade(db) {
      db.createObjectStore("app");
      for (const n of [
        "assets-betanet",
        "assets-mainnet",
        "assets-testnet",
        "assets-voi testnet",
        "assets-voi mainnet",
      ])
        db.createObjectStore(n, { keyPath: "index" });
      db.createObjectStore("keys");
      db.createObjectStore("seeds", { keyPath: "id", autoIncrement: true });
      db.createObjectStore("falcon25-seeds");
    },
  });
  const accounts: any[] = [
    { addr: hotAddr, name: "hot" },
    { addr: LEDGER_ADDR, slot: 0 },
    { addr: WATCH_ADDR },
    { addr: MSIG_ADDR, appId: 123n, network: "LocalNet" },
    { addr: PASSKEY_ADDR, slot: 0, seedId: 3, xpub: "unused" },
  ];
  await db.put("keys", key, hotAddr);
  await db.put("seeds", { id: 3, credentialId: "cred-3" });
  if (withPassword) {
    const seedA = bip39.mnemonicToSeedSync(HD_MN);
    const seedB = bip39.mnemonicToSeedSync(HD2_MN);
    const seedOther = bip39.mnemonicToSeedSync(HD_OTHER_MN);
    await db.put("seeds", await legacySeedRecord(PASS, seedA, 1, "legacy"));
    await db.put("seeds", await legacySeedRecord(PASS, seedB, 2, "current"));
    await db.put(
      "seeds",
      await legacySeedRecord(OTHER_PASS, seedOther, 4, "current")
    );
    const { keySeed } = falconAddress(FALCON_MN);
    await db.put(
      "falcon25-seeds",
      await legacySeedRecord(PASS, keySeed, falconAddr, "current"),
      falconAddr
    );
    await db.put("app", await verifier(PASS, verifierFormat), "password");
    accounts.push(
      { addr: hdA0.addr, slot: 0, seedId: 1, xpub: hdA0.xpub },
      { addr: hdA2.addr, slot: 2, seedId: 1, xpub: hdA2.xpub },
      { addr: hdB0.addr, slot: 0, seedId: 2, xpub: hdB0.xpub },
      { addr: hdOther0.addr, slot: 0, seedId: 4, xpub: hdOther0.xpub },
      { addr: falconAddr }
    );
  }
  await db.put("app", accounts, "accounts");
  db.close();
  return { hdA0, hdA2, hdB0, hdOther0, hotAddr, falconAddr, hotKey: key };
}
