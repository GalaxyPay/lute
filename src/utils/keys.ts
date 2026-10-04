// Small key and error helpers. Kept out of utils/index.ts, which re-exports
// modules that reach the network and the store, so the keystore can import
// these without dragging that in.
import algosdk from "algosdk";
import { generateKey } from "falcon-1024";

export function isBadPassword(err: any) {
  return err?.name === "OperationError";
}

export function needsPassword(err: any) {
  return err?.message === "Password Required";
}

/** The user closed a prompt. Not an error worth reporting. */
export class UserCancelled extends Error {
  constructor() {
    super("Cancelled");
    this.name = "UserCancelled";
  }
}

export function isCancelled(err: any) {
  return err?.name === "UserCancelled";
}

/** An error that `isBadPassword` recognises, for a failed password check. */
export function badPassword() {
  return new DOMException("Incorrect Password", "OperationError");
}

/** Address and public key of a Falcon25 mnemonic, from one keygen. */
export function getFalconKey(mn: string) {
  const seed = algosdk.pq25WordMnemonicToSeed(mn, algosdk.FALCON_1024_SCHEME);
  try {
    return falconKeyFromKeySeed(seed);
  } finally {
    seed.fill(0);
  }
}

export function getFalconAddress(mn: string) {
  return getFalconKey(mn).address;
}

/**
 * Address and public key of a falcon key seed (the hashed form of a 25-word
 * seed). The public key is what an account records as `falconPk`.
 */
export function falconKeyFromKeySeed(keySeed: Uint8Array) {
  const { publicKey } = generateKey(keySeed);
  const { address } = algosdk.addressFromPQKey(
    algosdk.FALCON_1024_SCHEME,
    publicKey
  );
  return { address, publicKey };
}

/** The address of a falcon key seed (the hashed form of a 25-word seed). */
export function falconAddressFromKeySeed(keySeed: Uint8Array) {
  return falconKeyFromKeySeed(keySeed).address;
}

// PKCS#8 header for a raw Ed25519 private key; the 32-byte seed follows it.
const ED25519_PKCS8_PREFIX = Uint8Array.fromBase64("MC4CAQAwBQYDK2VwBCIEIA==");

/**
 * Sign with a 32-byte ed25519 seed through a short-lived, non-extractable
 * WebCrypto key. The pkcs8 buffer holding the seed is zeroed afterwards.
 */
export async function ed25519Sign(seed32: Uint8Array, bytes: Uint8Array) {
  const pkcs8 = new Uint8Array(ED25519_PKCS8_PREFIX.length + 32);
  pkcs8.set(ED25519_PKCS8_PREFIX);
  pkcs8.set(seed32.subarray(0, 32), ED25519_PKCS8_PREFIX.length);
  try {
    const key = await crypto.subtle.importKey(
      "pkcs8",
      pkcs8,
      { name: "Ed25519" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign(
      { name: "Ed25519" },
      key,
      Buffer.from(bytes)
    );
    return new Uint8Array(sig);
  } finally {
    pkcs8.fill(0);
  }
}

export function bytesEqual(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
