// Kept out of utils/index.ts, whose re-exports reach the network and store,
// so the keystore can import these without dragging that in.
import algosdk from "algosdk";
import { generateKey } from "falcon-1024";

export function isBadPassword(err: any) {
  return err?.name === "OperationError";
}

export function needsPassword(err: any) {
  return err?.message === "Password Required";
}

/** The user closed a prompt; not an error worth reporting. */
export class UserCancelled extends Error {
  constructor() {
    super("Cancelled");
    this.name = "UserCancelled";
  }
}

export function isCancelled(err: any) {
  return err?.name === "UserCancelled";
}

/** Shaped like a WebCrypto decrypt failure so `isBadPassword` matches it. */
export function badPassword() {
  return new DOMException("Incorrect Password", "OperationError");
}

/** Returns both from one keygen, which is costly. */
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

/** A key seed is the hashed form of a 25-word seed. */
export function falconKeyFromKeySeed(keySeed: Uint8Array) {
  const { publicKey } = generateKey(keySeed);
  const { address } = algosdk.addressFromPQKey(
    algosdk.FALCON_1024_SCHEME,
    publicKey
  );
  return { address, publicKey };
}

export function falconAddressFromKeySeed(keySeed: Uint8Array) {
  return falconKeyFromKeySeed(keySeed).address;
}

// PKCS#8 header for a raw Ed25519 private key; the 32-byte seed follows it.
const ED25519_PKCS8_PREFIX = Uint8Array.fromBase64("MC4CAQAwBQYDK2VwBCIEIA==");

/** Zeroes its pkcs8 copy of the seed; `seed32` itself is left to the caller. */
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

export function concatBytes(a: Uint8Array, b: Uint8Array) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

// WebCrypto's BufferSource typing rejects Uint8Array<ArrayBufferLike>; every
// array passed through here is backed by a plain ArrayBuffer.
export const bs = (u: Uint8Array) => u as Uint8Array<ArrayBuffer>;
