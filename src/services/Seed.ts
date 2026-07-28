import { getAll, set } from "@/dbLute";
import type { SeedData } from "@/types";
import { getFalconAddress } from "@/utils";
import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import algosdk, { FALCON_1024_SCHEME } from "algosdk";

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
  async deriveKeyFromPassSalt(pass: string, salt: Uint8Array) {
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(pass),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    return await window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: Buffer.from(salt),
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
  },

  async storeBip39Seed(mn: string, pass: string) {
    const seed = Buffer.from(bip39.mnemonicToSeedSync(mn));
    const seedData = await this.encryptSeed(seed, pass);
    const id = await set("seeds", undefined, seedData);
    return { id, seed };
  },

  async storeFalconSeed(mn: string, pass: string) {
    const seed = Buffer.from(
      algosdk.pq25WordMnemonicToSeed(mn, FALCON_1024_SCHEME)
    );
    const address = getFalconAddress(mn);
    const seedData = await this.encryptSeed(seed, pass);
    await set("falcon25-seeds", address.toString(), seedData);
    return address;
  },

  async encryptSeed(seed: Buffer<ArrayBuffer>, pass: string) {
    const salt = window.crypto.getRandomValues(new Uint8Array(12));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveKeyFromPassSalt(pass, salt);
    const data = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      seed
    );
    return { data, salt, iv };
  },

  async decryptSeed(pass: string, sd: SeedData) {
    if (!sd.salt || !sd.iv || !sd.data) throw Error("Bad Seed Data");
    const key = await this.deriveKeyFromPassSalt(pass, sd.salt);
    const ent = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: Buffer.from(sd.iv) },
      key,
      sd.data
    );
    return Buffer.from(ent);
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
