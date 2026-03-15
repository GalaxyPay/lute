import { set } from "@/dbLute";
import type { SeedData } from "@/types";
import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

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
    const salt = window.crypto.getRandomValues(new Uint8Array(12));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveKeyFromPassSalt(pass, salt);
    const data = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      seed
    );
    const id = await set("seeds", undefined, { data, salt, iv });
    return { id, seed };
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
    const allowCredentials: any[] = [];
    if (credentialId)
      allowCredentials.push({
        type: "public-key",
        id: Buffer.from(credentialId, "base64"),
      });
    const credential = await navigator.credentials.get({
      publicKey: {
        allowCredentials,
        challenge: new Uint8Array(32),
        extensions: {
          prf: { eval: { first: new TextEncoder().encode("Algorand") } },
        },
      },
    });
    if (!credential) throw Error("Invalid Credentials");
    const results = (
      credential as PublicKeyCredential
    ).getClientExtensionResults();
    if (!results.prf?.results?.first)
      throw Error(
        "Authenticator device/platform does not support prf. Check compatibility matrix."
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

  async storePasskeyCred(credentialId: string) {
    return await set("seeds", undefined, { credentialId });
  },
};

export default Seed;
