// Password key derivation, shared by Seed (encrypt/decrypt) and Unlock (session
// cache). Kept in its own module so neither has to import the other.

// Current parameters. Bumping `iterations` (or later, `alg`) here is safe:
// the keystore header and every 1.x record carry the values they were written
// with. The header picks up new values when the password is next set or
// changed; 1.x records are only read.
export const KDF = {
  alg: "pbkdf2-sha256",
  iterations: 600_000,
  saltBytes: 16,
};

// Seeds written before versioning have no `iterations` field.
export const KDF_LEGACY_ITERATIONS = 100_000;

/**
 * GCM parameters for a seed record. Current-format records (marked by `kdf`)
 * bind the record id as additional data, so a ciphertext copied onto another
 * record fails its tag check instead of decrypting in the wrong slot. Records
 * written before the marker carry no additional data.
 *
 * The id is a number for bip39 seeds and the address for Falcon-1024 ones,
 * which are keyed by address in their own store.
 */
export function seedGcmParams(sd: {
  id: number | string;
  iv?: Uint8Array;
  kdf?: string;
}): AesGcmParams {
  const params: AesGcmParams = { name: "AES-GCM", iv: Buffer.from(sd.iv!) };
  if (sd.kdf) params.additionalData = new TextEncoder().encode(String(sd.id));
  return params;
}

export function randomSalt() {
  return crypto.getRandomValues(new Uint8Array(KDF.saltBytes));
}

export function randomIv() {
  return crypto.getRandomValues(new Uint8Array(12));
}

async function importPassword(pass: string) {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pass),
    "PBKDF2",
    false,
    ["deriveKey", "deriveBits"]
  );
}

function params(salt: Uint8Array, iterations: number) {
  return {
    name: "PBKDF2",
    salt: Buffer.from(salt),
    iterations,
    hash: "SHA-256",
  };
}

/**
 * Derive the AES-GCM key a seed is encrypted under. `extractable` defaults to
 * false; only the session unlock cache passes true, and only to export the raw
 * bytes once before discarding the handle.
 */
export async function deriveKeyFromPassSalt(
  pass: string,
  salt: Uint8Array,
  iterations = KDF.iterations,
  extractable = false
) {
  const keyMaterial = await importPassword(pass);
  return await crypto.subtle.deriveKey(
    params(salt, iterations),
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    extractable,
    ["encrypt", "decrypt"]
  );
}

async function verifierBits(pass: string, salt: Uint8Array, iterations: number) {
  const keyMaterial = await importPassword(pass);
  const bits = await crypto.subtle.deriveBits(
    params(salt, iterations),
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

/**
 * Verifier hash: SHA-256 of the PBKDF2 output. The full KDF keeps it no
 * cheaper to attack than a seed; the outer hash domain-separates it from the
 * AES keys, which are derived with identical parameters — even under a salt
 * collision the stored verifier can never equal a key.
 */
export async function deriveVerifierHash(
  pass: string,
  salt: Uint8Array,
  iterations = KDF.iterations
) {
  const bits = await verifierBits(pass, salt, iterations);
  const hash = await crypto.subtle.digest("SHA-256", bits);
  bits.fill(0);
  return new Uint8Array(hash).toBase64();
}

/**
 * Transitional verifier: the raw PBKDF2 output, as written by builds between
 * the legacy format and the hashed one. Verify-only; upgraded on next login.
 */
export async function rawVerifierHash(
  pass: string,
  salt: Uint8Array,
  iterations: number
) {
  return (await verifierBits(pass, salt, iterations)).toBase64();
}

/** Pre-versioning verifier: a single unsalted-iteration SHA-256(pass ‖ salt). */
export async function legacyVerifierHash(pass: string, salt: Uint8Array) {
  const passArr = new TextEncoder().encode(pass);
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new Uint8Array([...passArr, ...salt])
  );
  return new Uint8Array(hash).toBase64();
}

/**
 * Tests only: 600k iterations per derivation makes the suite take minutes.
 * Records carry their own count, so a lowered value is never misread.
 */
export function setKdfIterationsForTests(iterations: number) {
  KDF.iterations = iterations;
}

export function randomBytes(n: number) {
  return crypto.getRandomValues(new Uint8Array(n));
}

const enc = new TextEncoder();

/**
 * Binding kind and form, not just id, makes a one-way record relabelled as
 * exportable fail its tag check instead of exporting a useless phrase.
 */
export function keystoreAad(kind: string, form: string, id: string) {
  return enc.encode(`lute-keystore:${kind}:${form}:${id}`);
}

export function mkAad(id: string) {
  return enc.encode(`lute-keystore:mk:${id}`);
}

/**
 * Extractable only for the unlock cache, whose caller holds the bytes anyway.
 */
export async function importMk(raw: Uint8Array, extractable = false) {
  return await crypto.subtle.importKey(
    "raw",
    Buffer.from(raw),
    { name: "AES-GCM" },
    extractable,
    ["encrypt", "decrypt"]
  );
}

/** Non-extractable: a device-mode key never leaves WebCrypto. */
export async function generateDeviceMk() {
  return await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}
