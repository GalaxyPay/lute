// Error and refusal paths of the keystore that the flow tests do not reach.
import { describe, expect, it } from "vitest";
import { fresh } from "./helpers";

const SEED = () => new Uint8Array(32).fill(7);

describe("device mode has no password to check", () => {
  it("refuses password-only operations", async () => {
    const { Keystore } = await fresh();
    await Keystore.getMk();
    await expect(Keystore.unwrap("pw")).rejects.toThrow("no password");
    await expect(Keystore.rotate("pw", "new")).rejects.toThrow("no password");
    await expect(Keystore.removePassword("pw")).rejects.toThrow("no password");
  });

  it("unlockWithPassword returns the device key whatever is typed", async () => {
    // Callers reach this only through KeystoreUnlock, which skips the prompt
    // in device mode; the password is not a check here.
    const { Keystore } = await fresh();
    const mk = await Keystore.getMk();
    expect((await Keystore.unlockWithPassword("anything")).id).toBe(mk.id);
  });

  it("a new password cannot be confirmed by a single entry", async () => {
    // No header and no 1.x verifier: a typo must not become the password.
    const { Keystore } = await fresh();
    await expect(Keystore.unlockWithPassword("pw")).rejects.toThrow(
      "No wallet password is set"
    );
    expect(await Keystore.header()).toBeUndefined();
  });
});

describe("records", () => {
  it("rejects a record whose plaintext has the wrong length", async () => {
    const { Keystore, kdf } = await fresh();
    const mk = await Keystore.getMk();
    // Well formed, correctly bound and authentic, but 31 bytes of key.
    const id = "algo25:X";
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: kdf.keystoreAad("algo25", "seed", id),
      },
      mk.key,
      new Uint8Array(31)
    );
    await expect(
      Keystore.decryptRecord(mk, {
        id,
        kind: "algo25",
        form: "seed",
        iv,
        data,
      } as any)
    ).rejects.toThrow("Corrupt keystore record");
  });

  it("reports a missing record", async () => {
    const { Keystore } = await fresh();
    const mk = await Keystore.getMk();
    await expect(Keystore.getSecret(mk, "bip39:9")).rejects.toThrow(
      "Secret Not Found"
    );
    await expect(Keystore.exportMnemonic(mk, "bip39:9")).rejects.toThrow(
      "Secret Not Found"
    );
  });
});

describe("putSecrets", () => {
  it("needs an explicit id for anything but a bip39 seed", async () => {
    const { Keystore } = await fresh();
    const mk = await Keystore.getMk();
    await expect(
      Keystore.putSecrets(mk, [
        { kind: "algo25", form: "seed", plaintext: SEED() },
      ])
    ).rejects.toThrow("An id is required for algo25");
  });

  it("refuses to write under a master key that was replaced", async () => {
    const { Keystore, db } = await fresh();
    const stale = await Keystore.getMk();
    // Setting a password re-encrypts everything under a new master key.
    await Keystore.newPassword("pw");
    await expect(
      Keystore.putSecrets(stale, [
        { kind: "algo25", form: "seed", id: "algo25:X", plaintext: SEED() },
      ])
    ).rejects.toThrow("The wallet key changed");
    expect(await db.get("keystore", "algo25:X")).toBeUndefined();
  });

  it("refuses to write after the password was removed", async () => {
    const { Keystore, db } = await fresh();
    const pwMk = await Keystore.newPassword("pw");
    expect(await Keystore.removePassword("pw")).toBe(true);
    await expect(
      Keystore.putSecrets(pwMk, [
        { kind: "algo25", form: "seed", id: "algo25:X", plaintext: SEED() },
      ])
    ).rejects.toThrow("The wallet key changed");
    expect(await db.get("keystore", "algo25:X")).toBeUndefined();
  });
});
