import { get, getAll, rotateAtomic, set } from "@/dbLute";
import type { PasswordVerifier, SeedData } from "@/types";
import Unlock from "@/services/Unlock";
import {
  KDF,
  KDF_LEGACY_ITERATIONS,
  deriveKeyFromPassSalt,
  deriveVerifierHash,
  legacyVerifierHash,
  randomIv,
  randomSalt,
} from "@/services/kdf";
import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

// Salt the passkey PRF is evaluated with. Every seed ever derived from a
// passkey depends on this value, changing it invalidates all of them.
const PRF_SALT = new TextEncoder().encode("Algorand");

export type PasskeyErrorCode = "aborted" | "invalid" | "exists" | "prf";

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
  if (err?.name === "InvalidStateError")
    return new PasskeyError(
      "exists",
      "This device already has a passkey registered for Lute. Use the existing seed instead."
    );
  return err;
}

const Seed = {
  /** Encrypt a seed under `pass` with fresh salt+iv at the current parameters. */
  async encryptSeed(seed: Uint8Array, pass: string) {
    const salt = randomSalt();
    const iv = randomIv();
    const key = await deriveKeyFromPassSalt(pass, salt, KDF.iterations);
    const data = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      Buffer.from(seed)
    );
    return { data, salt, iv, iterations: KDF.iterations };
  },

  async storeBip39Seed(mn: string, pass: string) {
    const seed = Buffer.from(bip39.mnemonicToSeedSync(mn));
    const rec = await this.encryptSeed(seed, pass);
    const id = (await set("seeds", undefined, rec)) as number;
    // The wallet may already be unlocked; cache this seed under the existing
    // window so the next signature does not re-prompt.
    await Unlock.add({ id, ...rec }, pass);
    return { id, seed };
  },

  /**
   * `upgrade` re-encrypts a legacy seed at the current parameters on the way
   * out. Rotation passes false: it is about to rewrite every seed under the new
   * password anyway, and an extra write before the atomic commit would be both
   * wasted work and a second thing that can fail.
   */
  async decryptSeed(pass: string, sd: SeedData, upgrade = true) {
    if (!sd.salt || !sd.iv || !sd.data) throw Error("Bad Seed Data");
    const iterations = sd.iterations ?? KDF_LEGACY_ITERATIONS;
    const key = await deriveKeyFromPassSalt(pass, sd.salt, iterations);
    const ent = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: Buffer.from(sd.iv) },
      key,
      sd.data
    );
    const seed = Buffer.from(ent);
    if (upgrade && iterations < KDF.iterations)
      await this.reencryptSeed(sd, seed, pass);
    return seed;
  },

  /**
   * Upgrade a legacy seed to the current KDF parameters. Runs on the next
   * successful decrypt, the only moment the password is available.
   */
  async reencryptSeed(sd: SeedData, seed: Uint8Array, pass: string) {
    const rec = { id: sd.id, ...(await this.encryptSeed(seed, pass)) };
    await set("seeds", undefined, rec);
    // store.seeds is now stale; a second decrypt in this page would derive
    // against the old salt and fail.
    const store = useAppStore();
    const ix = store.seeds.findIndex((s) => s.id === sd.id);
    if (ix !== -1) store.seeds[ix] = rec;
  },

  /** Build a verifier record without writing it. Rotation writes its own. */
  async buildVerifier(pass: string): Promise<PasswordVerifier> {
    const saltArr = randomSalt();
    return {
      salt: saltArr.toBase64(),
      hash: await deriveVerifierHash(pass, saltArr, KDF.iterations),
      iterations: KDF.iterations,
    };
  },

  async setPassword(pass: string) {
    await set("app", "password", await this.buildVerifier(pass));
  },

  async verifyPassword(pass: string) {
    const rec: PasswordVerifier | undefined = await get("app", "password");
    if (!rec) throw Error("Password not found");
    const salt = Uint8Array.fromBase64(rec.salt);
    if (!rec.iterations) {
      // Pre-versioning verifier. Upgrade it once the password checks out.
      if ((await legacyVerifierHash(pass, salt)) !== rec.hash) return false;
      await this.setPassword(pass);
      return true;
    }
    return (await deriveVerifierHash(pass, salt, rec.iterations)) === rec.hash;
  },

  /**
   * Re-encrypt every local seed under a new password and replace the verifier.
   *
   * Partial application is unrecoverable, so this pre-flights every decrypt and
   * commits in a single IndexedDB transaction. All crypto happens before the
   * transaction opens: IDB auto-commits when the event loop yields, so awaiting
   * crypto.subtle inside one kills it with TransactionInactiveError.
   */
  async rotatePassword(oldPass: string, newPass: string) {
    if (!(await this.verifyPassword(oldPass))) return false;
    const store = useAppStore();
    // Read from the database, not store.seeds: a stale cache would silently
    // skip a seed and strand it under the old password.
    const all: SeedData[] = await getAll("seeds");
    const locals = all.filter((s) => s.data);
    const seeds: Uint8Array[] = [];
    try {
      // Pre-flight: every seed must decrypt before anything is written. Each
      // result is collected as it resolves so a later rejection still leaves
      // the earlier plaintexts reachable for the finally to zero.
      await Promise.all(
        locals.map(async (sd, ix) => {
          seeds[ix] = await this.decryptSeed(oldPass, sd, false);
        })
      );
      const rewritten = await Promise.all(
        seeds.map(async (seed, ix) => ({
          id: locals[ix]!.id,
          ...(await this.encryptSeed(seed, newPass)),
        }))
      );
      await rotateAtomic(
        rewritten,
        await this.buildVerifier(newPass),
        locals.map((s) => s.id)
      );
    } finally {
      // Sparse if a decrypt rejected, hence the guard.
      seeds.forEach((s) => s?.fill(0));
    }
    // Cached keys derive from the old password against the old salts.
    await Unlock.clear();
    await store.getCache();
    return true;
  },

  /**
   * The signing read path. Uses the session cache when the wallet is unlocked,
   * otherwise requires the password. Password-only callers (mnemonic and child
   * key export) must keep using decryptSeed so the cache cannot stand in for
   * the password on an export.
   */
  async unlockSeed(sd: SeedData, pass?: string) {
    if (sd.credentialId) return (await this.getPasskeySeed(sd.credentialId)).seed;
    if (!sd.iv || !sd.data) throw Error("Bad Seed Data");
    const cached = await Unlock.get(sd.id);
    if (cached) {
      const ent = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: Buffer.from(sd.iv) },
        cached,
        sd.data
      );
      await Unlock.touch();
      return Buffer.from(ent);
    }
    if (!pass) throw Error("Password Required");
    // Decrypt this seed first so a wrong password fails before anything caches.
    const seed = await this.decryptSeed(pass, sd);
    if (Unlock.enabled()) await Unlock.unlock(pass);
    return seed;
  },

  async getPasskeyMnemonic(credentialId?: string) {
    const store = useAppStore();
    store.setSnackbar("Waiting on Authenticator...", "info", -1);
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
        "This passkey cannot derive a seed because it was registered without prf support. Register a new passkey, or use one from a device that supports prf."
      );
    const mn = bip39.entropyToMnemonic(
      // @ts-expect-error
      new Uint8Array(results.prf.results.first),
      wordlist
    );
    return { mn, credential };
  },

  async registerPasskey() {
    const store = useAppStore();
    // A random user id per registration. Authenticators replace a discoverable
    // credential when rp id and user id both match, so a fixed id makes every
    // registration silently overwrite the previous passkey.
    const userId = window.crypto.getRandomValues(new Uint8Array(32));
    const name = `wallet+${userId.slice(0, 3).toHex()}@lute.app`;
    store.setSnackbar("Waiting on Authenticator...", "info", -1);
    let credential: Credential | null;
    try {
      credential = await navigator.credentials.create({
        publicKey: {
          authenticatorSelection: {
            residentKey: "required",
            userVerification: "required",
          },
          challenge: new Uint8Array(32),
          extensions: { prf: {} },
          pubKeyCredParams: [
            { alg: -7, type: "public-key" },
            { alg: -8, type: "public-key" },
            { alg: -257, type: "public-key" },
          ],
          rp: { name: "Lute" },
          user: {
            id: userId,
            name,
            displayName: name,
          },
        },
      });
    } catch (err: any) {
      throw asPasskeyError(err);
    } finally {
      store.snackbar.display = false;
    }
    if (!credential) throw new PasskeyError("invalid", "Invalid Credential");
    return credential.id;
  },

  async getPasskeySeed(credentialId?: string) {
    const { mn, credential } = await this.getPasskeyMnemonic(credentialId);
    const seed = Buffer.from(bip39.mnemonicToSeedSync(mn));
    return { seed, credentialId: credential.id };
  },

  async storePasskeyCred(credentialId: string) {
    const seeds = await getAll("seeds");
    const existing = seeds.find((s) => s.credentialId === credentialId);
    if (existing) return existing.id;
    return await set("seeds", undefined, { credentialId });
  },
};

export default Seed;
