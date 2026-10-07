import algosdk from "algosdk";
import { describe, expect, it } from "vitest";
import {
  FALCON_MN,
  falconAddress,
  HD2_MN,
  HD_MN,
  HD_OTHER_MN,
  HOT_MN,
} from "./fixtures/v3db";
import { fresh } from "./helpers";

const hotAddr = algosdk.mnemonicToSecretKey(HOT_MN).addr.toString();
const falconAddr = falconAddress(FALCON_MN).addr;

describe("device mode", () => {
  it("is created on first use when there is no password", async () => {
    const { Keystore } = await fresh();
    expect(await Keystore.mode()).toBe("device");
    expect(await Keystore.header()).toBeUndefined();
    const mk = await Keystore.getMk();
    const h: any = await Keystore.header();
    expect(h.mode).toBe("device");
    expect(h.id).toBe(mk.id);
    expect(h.gen).toBe(1);
    expect(h.mk.extractable).toBe(false);
    expect((await Keystore.getMk()).id).toBe(mk.id);
  });

  it("ends with one key when two contexts create it at once", async () => {
    const { Keystore } = await fresh();
    const [a, b] = await Promise.all([
      Keystore.createDevice(),
      Keystore.createDevice(),
    ]);
    expect(a.id).toBe(b.id);
  });
});

describe("password mode", () => {
  it("needs the password once the header exists", async () => {
    const { Keystore } = await fresh();
    const mk = await Keystore.newPassword("pw");
    const h: any = await Keystore.header();
    expect(h).toMatchObject({ mode: "password", id: mk.id, gen: 1 });
    await expect(Keystore.getMk()).rejects.toThrow("Password Required");
    expect((await Keystore.getMk("pw")).id).toBe(mk.id);
    await expect(Keystore.getMk("nope")).rejects.toMatchObject({
      name: "OperationError",
    });
  });

  it("refuses a second password over an existing one", async () => {
    const { Keystore } = await fresh();
    await Keystore.newPassword("pw");
    await expect(Keystore.newPassword("again")).rejects.toThrow(
      "already set"
    );
  });
});

describe("records", () => {
  it("binds kind, form and id: a relabelled record does not decrypt", async () => {
    const { Keystore, db } = await fresh();
    const mk = await Keystore.getMk();
    await Keystore.putSecrets(mk, [
      {
        kind: "falcon25",
        form: "hash",
        id: "falcon25:X",
        plaintext: new Uint8Array(32).fill(9),
      },
    ]);
    const rec: any = await db.get("keystore", "falcon25:X");
    expect(await Keystore.decryptRecord(mk, rec)).toEqual(
      new Uint8Array(32).fill(9)
    );
    for (const tampered of [
      { ...rec, form: "seed" },
      { ...rec, kind: "algo25" },
      { ...rec, id: "falcon25:Y" },
    ])
      await expect(Keystore.decryptRecord(mk, tampered)).rejects.toMatchObject(
        { name: "OperationError" }
      );
  });

  it("rejects plaintext of the wrong length for its form", async () => {
    const { Keystore } = await fresh();
    const mk = await Keystore.getMk();
    await expect(
      Keystore.putSecrets(mk, [
        {
          kind: "algo25",
          form: "seed",
          id: "algo25:X",
          plaintext: new Uint8Array(31),
        },
      ])
    ).rejects.toThrow("Invalid algo25 seed length");
    expect(Keystore.validLength("bip39", "entropy", 33 + 64)).toBe(false);
    expect(Keystore.validLength("bip39", "entropy", 16 + 64)).toBe(true);
  });

  it("allocates seed ids from one counter, shared with passkeys", async () => {
    const { Keystore, Seed, db } = await fresh();
    const mk = await Keystore.getMk();
    // Both read the counter before either commits; one has to retry.
    const ids = await Promise.all([
      Keystore.storeMnemonic(mk, "bip39", HD_MN),
      Keystore.storeMnemonic(mk, "bip39", HD2_MN),
    ]);
    expect([...ids].sort()).toEqual(["bip39:1", "bip39:2"]);
    expect(await Seed.storePasskeyCred("cred")).toBe(3);
    expect(await Seed.storePasskeyCred("cred")).toBe(3);
    expect(await Keystore.storeMnemonic(mk, "bip39", HD_OTHER_MN)).toBe(
      "bip39:4"
    );
    expect(await db.get("app", "nextSeedId")).toBe(5);
  });

  it("exports the mnemonic each kind was stored from", async () => {
    const { Keystore } = await fresh();
    const mk = await Keystore.getMk();
    const hd = await Keystore.storeMnemonic(mk, "bip39", HD_MN);
    await Keystore.storeMnemonic(mk, "algo25", HOT_MN, {
      id: `algo25:${hotAddr}`,
    });
    await Keystore.storeMnemonic(mk, "falcon25", FALCON_MN, {
      id: `falcon25:${falconAddr}`,
    });
    expect(await Keystore.exportMnemonic(mk, hd)).toBe(HD_MN);
    expect(await Keystore.exportMnemonic(mk, `algo25:${hotAddr}`)).toBe(HOT_MN);
    expect(await Keystore.exportMnemonic(mk, `falcon25:${falconAddr}`)).toBe(
      FALCON_MN
    );
  });

  it("refuses to export one-way material", async () => {
    const { Keystore } = await fresh();
    const mk = await Keystore.getMk();
    await Keystore.putSecrets(mk, [
      {
        kind: "bip39",
        form: "seed",
        id: "bip39:7",
        plaintext: new Uint8Array(64),
      },
    ]);
    await expect(Keystore.exportMnemonic(mk, "bip39:7")).rejects.toThrow(
      "Upgrade it"
    );
  });
});

describe("hd seeds", () => {
  it("keeps one seed for a mnemonic imported twice", async () => {
    const { Keystore, db } = await fresh();
    const mk = await Keystore.getMk();
    const first = await Keystore.storeMnemonic(mk, "bip39", HD_MN);
    await Keystore.storeMnemonic(mk, "bip39", HD2_MN);
    expect(await Keystore.storeMnemonic(mk, "bip39", HD_MN)).toBe(first);
    expect(
      (await db.getAll("keystore")).filter((r: any) => r.kind === "bip39")
    ).toHaveLength(2);
    expect(await db.get("app", "nextSeedId")).toBe(3);
  });

  it("upgrades a one-way copy of a re-imported seed in place", async () => {
    const { Keystore } = await fresh();
    const mk = await Keystore.getMk();
    const seed = (await import("@scure/bip39")).mnemonicToSeedSync(HD_MN);
    await Keystore.putSecrets(mk, [
      { kind: "bip39", form: "seed", id: "bip39:7", plaintext: seed },
    ]);
    expect(await Keystore.storeMnemonic(mk, "bip39", HD_MN)).toBe("bip39:7");
    expect(await Keystore.exportMnemonic(mk, "bip39:7")).toBe(HD_MN);
  });

  it("removes a seed only when no account uses it", async () => {
    const { Keystore, Seed, db } = await fresh();
    const mk = await Keystore.getMk();
    const used = await Keystore.storeMnemonic(mk, "bip39", HD_MN);
    const unused = await Keystore.storeMnemonic(mk, "bip39", HD2_MN);
    const passkey = await Seed.storePasskeyCred("cred");
    const usedId = Number(used.split(":")[1]);
    await db.set("app", "accounts", [{ addr: "A", seedId: usedId, slot: 0 }]);
    await expect(Keystore.removeSeed(usedId)).rejects.toThrow(
      "still has accounts"
    );
    expect(await db.get("keystore", used)).toBeDefined();
    await Keystore.removeSeed(Number(unused.split(":")[1]));
    await Keystore.removeSeed(passkey);
    expect(await db.get("keystore", unused)).toBeUndefined();
    expect(await db.get("seeds", passkey)).toBeUndefined();
  });
});

describe("changing the password", () => {
  async function walletWithSecrets() {
    const env = await fresh();
    const mk = await env.Keystore.newPassword("one");
    await env.Keystore.storeMnemonic(mk, "algo25", HOT_MN, {
      id: `algo25:${hotAddr}`,
    });
    await env.Keystore.storeMnemonic(mk, "bip39", HD_MN);
    return { ...env, mk };
  }

  it("rewraps the same master key under the new password", async () => {
    const { Keystore, mk } = await walletWithSecrets();
    expect(await Keystore.rotate("wrong", "two")).toBe(false);
    expect(await Keystore.rotate("one", "two")).toBe(true);
    expect(await Keystore.header()).toMatchObject({ id: mk.id, gen: 2 });
    await expect(Keystore.unwrap("one")).rejects.toMatchObject({
      name: "OperationError",
    });
    const mk2 = await Keystore.unwrap("two");
    expect(await Keystore.exportMnemonic(mk2, `algo25:${hotAddr}`)).toBe(
      HOT_MN
    );
  });

  it("lets one of two concurrent rotations win and writes nothing for the other", async () => {
    const { Keystore } = await walletWithSecrets();
    const results = await Promise.allSettled([
      Keystore.rotate("one", "two"),
      Keystore.rotate("one", "three"),
    ]);
    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r) => r.status === "rejected");
    expect(won).toHaveLength(1);
    expect((lost[0] as PromiseRejectedResult).reason.name).toBe(
      "KeystoreConflict"
    );
    expect(await Keystore.header()).toMatchObject({ gen: 2 });
    const opens = await Promise.allSettled([
      Keystore.unwrap("two"),
      Keystore.unwrap("three"),
    ]);
    expect(opens.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("moves every record to a new key when removing and setting a password", async () => {
    const { Keystore, db, mk } = await walletWithSecrets();
    expect(await Keystore.removePassword("wrong")).toBe(false);
    expect(await Keystore.removePassword("one")).toBe(true);
    const h: any = await Keystore.header();
    expect(h.mode).toBe("device");
    expect(h.id).not.toBe(mk.id);
    const device = await Keystore.getMk();
    expect(await Keystore.exportMnemonic(device, `algo25:${hotAddr}`)).toBe(
      HOT_MN
    );
    expect(await Keystore.exportMnemonic(device, "bip39:1")).toBe(HD_MN);
    // The old key opens nothing any more.
    const rec: any = await db.get("keystore", `algo25:${hotAddr}`);
    await expect(Keystore.decryptRecord(mk, rec)).rejects.toMatchObject({
      name: "OperationError",
    });

    const pw = await Keystore.newPassword("two");
    expect(await Keystore.mode()).toBe("password");
    expect(pw.id).not.toBe(device.id);
    const opened = await Keystore.unwrap("two");
    expect(await Keystore.exportMnemonic(opened, "bip39:1")).toBe(HD_MN);
  });
});
