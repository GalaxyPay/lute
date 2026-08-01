// Password key derivation, shared by Seed (encrypt/decrypt) and Unlock (session
// cache). Kept in its own module so neither has to import the other.

// Current parameters. Bumping `iterations` here is safe: every seed records the
// value it was encrypted with, and Seed.decryptSeed re-encrypts anything older.
export const KDF = { iterations: 600_000, saltBytes: 16 };

// Seeds written before versioning have no `iterations` field.
export const KDF_LEGACY_ITERATIONS = 100_000;

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

/** Verifier hash. Uses the same KDF as encryption so it is no cheaper to attack. */
export async function deriveVerifierHash(
  pass: string,
  salt: Uint8Array,
  iterations = KDF.iterations
) {
  const keyMaterial = await importPassword(pass);
  const bits = await crypto.subtle.deriveBits(
    params(salt, iterations),
    keyMaterial,
    256
  );
  return new Uint8Array(bits).toBase64();
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
