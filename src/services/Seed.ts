import { get, getAll, keystoreTx } from "@/dbLute";
import {
  KDF_LEGACY_ITERATIONS,
  deriveKeyFromPassSalt,
  deriveVerifierHash,
  legacyVerifierHash,
  rawVerifierHash,
  seedGcmParams,
} from "@/services/kdf";
import type { AnySeedData, PasswordVerifier } from "@/types";
import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

// Salt the passkey PRF is evaluated with. Every seed ever derived from a
// passkey depends on this value, changing it invalidates all of them.
const PRF_SALT = new TextEncoder().encode("Algorand");

export type PasskeyErrorCode = "aborted" | "invalid" | "prf";

export class PasskeyError extends Error {
  code: PasskeyErrorCode;
  constructor(code: PasskeyErrorCode, message: string) {
    super(message);
    this.name = "PasskeyError";
    this.code = code;
  }
}

function decodeCredentialId(credentialId: string) {
  return Uint8Array.fromBase64(credentialId, { alphabet: "base64url" });
}

function asPasskeyError(err: any) {
  if (err instanceof PasskeyError) return err;
  // Browsers also report "no matching credential" as NotAllowedError, so this
  // covers both a cancelled prompt and nothing to select.
  if (err?.name === "NotAllowedError" || err?.name === "AbortError")
    return new PasskeyError(
      "aborted",
      "No passkey was used. The request was cancelled, timed out, or the device holds no passkey for Lute."
    );
  return err;
}

const Seed = {
  /**
   * @legacy-read Remove once no `seeds` record has `data` and
   * `falcon25-seeds` is empty. Never rewrites the record: the keystore
   * migration is the upgrade, and an in-place rewrite could resurrect a record
   * the migration just moved.
   */
  async decryptSeed(pass: string, sd: AnySeedData) {
    if (!sd.salt || !sd.iv || !sd.data) throw Error("Bad Seed Data");
    const iterations = sd.iterations ?? KDF_LEGACY_ITERATIONS;
    const key = await deriveKeyFromPassSalt(pass, sd.salt, iterations);
    const ent = await crypto.subtle.decrypt(seedGcmParams(sd), key, sd.data);
    return Buffer.from(ent);
  },

  /**
   * @legacy-read Only confirms the password before the keystore is created
   * from it, which deletes the verifier.
   */
  async verifyPassword(pass: string) {
    const rec: PasswordVerifier | undefined = await get("app", "password");
    if (!rec) throw Error("Password not found");
    const salt = Uint8Array.fromBase64(rec.salt);
    if (!rec.iterations)
      // Pre-versioning: a single unsalted-iteration SHA-256.
      return (await legacyVerifierHash(pass, salt)) === rec.hash;
    if (!rec.kdf)
      // Transitional: raw PBKDF2 output, before the domain-separating hash.
      return (await rawVerifierHash(pass, salt, rec.iterations)) === rec.hash;
    return (await deriveVerifierHash(pass, salt, rec.iterations)) === rec.hash;
  },

  async getPasskeyMnemonic(credentialId?: string) {
    const store = useAppStore();
    store.setSnackbar("Waiting on authenticator...", "info", -1);
    const allowCredentials: PublicKeyCredentialDescriptor[] = [];
    if (credentialId)
      allowCredentials.push({
        type: "public-key",
        id: decodeCredentialId(credentialId),
      });
    let credential: Credential | null;
    try {
      credential = await navigator.credentials.get({
        publicKey: {
          allowCredentials,
          challenge: new Uint8Array(32),
          // The prf evaluation is only released after user verification.
          userVerification: "required",
          extensions: { prf: { eval: { first: PRF_SALT } } },
        },
      });
    } catch (err: any) {
      throw asPasskeyError(err);
    } finally {
      store.snackbar.display = false;
    }
    if (!credential) throw new PasskeyError("invalid", "Invalid Credentials");
    const results = (
      credential as PublicKeyCredential
    ).getClientExtensionResults();
    if (!results.prf?.results?.first)
      throw new PasskeyError(
        "prf",
        "This passkey cannot derive a seed because it was registered without prf support. Try a device that supports prf."
      );
    const mn = bip39.entropyToMnemonic(
      // @ts-expect-error
      new Uint8Array(results.prf.results.first),
      wordlist
    );
    return { mn, credential };
  },

  async getPasskeySeed(credentialId?: string) {
    const { mn, credential } = await this.getPasskeyMnemonic(credentialId);
    const seed = Buffer.from(bip39.mnemonicToSeedSync(mn));
    return { seed, credentialId: credential.id };
  },

  /**
   * Shares app/"nextSeedId" with keystore bip39 seeds so the two never hand
   * out the same seedId.
   */
  async storePasskeyCred(credentialId: string): Promise<number> {
    const seeds = await getAll("seeds");
    const existing = seeds.find((s) => s.credentialId === credentialId);
    if (existing) return existing.id;
    return await keystoreTx(async (tx) => {
      const app = tx.objectStore("app");
      const id: number = (await app.get("nextSeedId")) ?? 1;
      app.put(id + 1, "nextSeedId");
      tx.objectStore("seeds").put({ id, credentialId });
      return id;
    });
  },
};

export default Seed;
