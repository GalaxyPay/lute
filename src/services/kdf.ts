// Password key derivation, shared by Seed (encrypt/decrypt) and Unlock (session
// cache). Kept in its own module so neither has to import the other.

// Current parameters. Bumping `iterations` (or later, `alg`) here is safe:
// every record carries the values it was written with, and Seed re-encrypts
// anything older on the next successful decrypt.
export const KDF = {
  alg: "pbkdf2-sha256",
  iterations: 600_000,
  saltBytes: 16,
};

// Seeds written before versioning have no `iterations` field.
export const KDF_LEGACY_ITERATIONS = 100_000;

/** Whether a record is already at the current KDF parameters and format. */
export function atCurrentKdf(rec: { iterations?: number; kdf?: string }) {
  return rec.kdf === KDF.alg && (rec.iterations ?? 0) >= KDF.iterations;
}

/**
 * GCM parameters for a seed record. Current-format records (marked by `kdf`)
 * bind the record id as additional data, so a ciphertext copied onto another
 * record fails its tag check instead of decrypting in the wrong slot. Records
 * written before the marker carry no additional data.
 */
export function seedGcmParams(sd: {
  id: number;
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
