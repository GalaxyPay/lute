import HdWallet from "@/services/HdWallet";
import { getFalconKey } from "@/utils/keys";
import * as bip39 from "@scure/bip39";
import algosdk from "algosdk";
import { describe, expect, it, vi } from "vitest";
import {
  buildV3,
  FALCON_MN,
  falconAddress,
  type Fixture,
  HD_MN,
  HD_OTHER_MN,
  OTHER_PASS,
  PASS,
  type VerifierFormat,
} from "./fixtures/v3db";
import { fresh } from "./helpers";

const MSG = new Uint8Array([1, 2, 3, 4, 5]);

async function upgraded(format: VerifierFormat | "none" = "current") {
  let fx!: Fixture;
  const env = await fresh(async () => {
    fx = await buildV3(format);
  });
  return { ...env, fx };
}

function hdAcct(addr: string, slot: number, seedId: number) {
  return {
    addr,
    slot,
    seedId,
    isFalcon25: false,
    info: { addrIdx: 0 },
  } as any;
}

describe.each(["legacy", "raw", "current"] as const)(
  "first password entry with a %s 1.x verifier",
  (format) => {
    it("creates the keystore and moves every seed the password opens", async () => {
      const { Keystore, db, fx } = await upgraded(format);
      expect(await Keystore.mode()).toBe("password");
      await expect(Keystore.getMk()).rejects.toThrow("Password Required");

      const mk = await Keystore.unlockWithPassword(PASS);
      expect(await Keystore.header()).toMatchObject({
        mode: "password",
        id: mk.id,
        gen: 1,
      });
      expect(await db.get("app", "password")).toBeUndefined();
      const recs = ((await db.getAll("keystore")) as any[])
        .map(({ id, kind, form }) => ({ id, kind, form }))
        .sort((a, b) => a.id.localeCompare(b.id));
      expect(recs).toEqual([
        { id: "bip39:1", kind: "bip39", form: "seed" },
        { id: "bip39:2", kind: "bip39", form: "seed" },
        { id: `falcon25:${fx.falconAddr}`, kind: "falcon25", form: "hash" },
      ]);
      // Left behind: the passkey credential and the seed under another
      // password. The Algo25 CryptoKey cannot be moved at all.
      expect(((await db.getAll("seeds")) as any[]).map((s) => s.id)).toEqual([
        3, 4,
      ]);
      expect(await db.getAll("falcon25-seeds")).toEqual([]);
      expect(await db.keys("keys")).toEqual([fx.hotAddr]);

      const hd = await Keystore.getSecret(mk, "bip39:1");
      expect(hd.plaintext).toEqual(
        new Uint8Array(bip39.mnemonicToSeedSync(HD_MN))
      );
      const falcon = await Keystore.getSecret(mk, `falcon25:${fx.falconAddr}`);
      expect(falcon.plaintext).toEqual(falconAddress(FALCON_MN).keySeed);
    });
  }
);

describe("envelope migration", () => {
  it("writes nothing on a wrong password", async () => {
    const { Keystore, db } = await upgraded();
    await expect(Keystore.unlockWithPassword("wrong")).rejects.toMatchObject({
      name: "OperationError",
    });
    expect(await Keystore.header()).toBeUndefined();
    expect(await db.get("app", "password")).toBeTruthy();
    expect(await db.getAll("keystore")).toEqual([]);
    expect(((await db.getAll("seeds")) as any[]).length).toBe(4);
  });

  it("creates one keystore when two contexts enter the password at once", async () => {
    const { Keystore, db } = await upgraded();
    const [a, b] = await Promise.all([
      Keystore.unlockWithPassword(PASS),
      Keystore.unlockWithPassword(PASS),
    ]);
    expect(a.id).toBe(b.id);
    expect(((await Keystore.header()) as any).id).toBe(a.id);
    expect(((await db.getAll("keystore")) as any[]).length).toBe(3);
  });

  it("does not resurrect a record another context moved mid-migration", async () => {
    const { Keystore, Seed, db } = await upgraded();
    const real = Seed.decryptSeed.bind(Seed);
    let deleted = false;
    const spy = vi
      .spyOn(Seed, "decryptSeed")
      .mockImplementation(async (pass, sd) => {
        const out = await real(pass, sd);
        if (sd.id === 2 && !deleted) {
          deleted = true;
          await db.del("seeds", 2);
        }
        return out;
      });
    try {
      await Keystore.unlockWithPassword(PASS);
    } finally {
      spy.mockRestore();
    }
    const ids = ((await db.getAll("keystore")) as any[]).map((r) => r.id);
    expect(ids).toContain("bip39:1");
    expect(ids).not.toContain("bip39:2");
  });

  it("changing the password of a 1.x wallet creates its keystore first", async () => {
    const { Keystore, db } = await upgraded();
    expect(await Keystore.rotate("wrong", "new")).toBe(false);
    expect(await Keystore.header()).toBeUndefined();
    expect(await Keystore.rotate(PASS, "new")).toBe(true);
    expect(await Keystore.header()).toMatchObject({ mode: "password", gen: 2 });
    const mk = await Keystore.unwrap("new");
    expect((await Keystore.getSecret(mk, "bip39:1")).plaintext.length).toBe(64);
    expect(await db.get("app", "password")).toBeUndefined();
  });

  it("a forgotten 1.x password can be replaced, leaving its seeds behind", async () => {
    const { Keystore, Signer, SignContext, db, fx } = await upgraded();
    await Keystore.newPassword("fresh start");
    expect(await Keystore.mode()).toBe("password");
    expect(await db.get("app", "password")).toBeUndefined();
    expect(((await db.getAll("seeds")) as any[]).length).toBe(4);
    // The old password still opens the seeds it protected.
    const sig = await Signer.signBytes(
      hdAcct(fx.hdA0.addr, 0, 1),
      MSG,
      new SignContext(PASS)
    );
    expect(sig.length).toBe(64);
  });

  it("migrated HD seeds sign exactly as before", async () => {
    const { Keystore, Signer, SignContext, fx } = await upgraded();
    await Keystore.unlockWithPassword(PASS);
    const ctx = new SignContext(PASS);
    try {
      const sig = await Signer.signBytes(hdAcct(fx.hdA2.addr, 2, 1), MSG, ctx);
      const expected = await HdWallet.sign(
        Buffer.from(bip39.mnemonicToSeedSync(HD_MN)),
        2,
        MSG,
        0
      );
      expect(sig).toEqual(expected);
    } finally {
      ctx.dispose();
    }
  });

  it("migrated Falcon seeds still derive their account", async () => {
    const { Keystore, Signer, SignContext, fx } = await upgraded();
    await Keystore.unlockWithPassword(PASS);
    const ctx = new SignContext(PASS);
    const signer = await Signer.falconSigner(
      { addr: fx.falconAddr, isFalcon25: true } as any,
      ctx
    );
    ctx.dispose();
    expect(signer.address.toString()).toBe(fx.falconAddr);
    // The key handed back for backfilling falconPk is the account's own.
    expect(signer.publicKey).toEqual(getFalconKey(FALCON_MN).publicKey);
    const { address } = algosdk.addressFromPQKey(
      algosdk.FALCON_1024_SCHEME,
      signer.publicKey
    );
    expect(address.toString()).toBe(fx.falconAddr);
  });

  it("still signs with a seed under a different password", async () => {
    const { Keystore, Signer, SignContext, fx } = await upgraded();
    await Keystore.unlockWithPassword(PASS);
    const acct = hdAcct(fx.hdOther0.addr, 0, 4);
    await expect(
      Signer.signBytes(acct, MSG, new SignContext())
    ).rejects.toThrow("Password Required");
    const sig = await Signer.signBytes(acct, MSG, new SignContext(OTHER_PASS));
    const expected = await HdWallet.sign(
      Buffer.from(bip39.mnemonicToSeedSync(HD_OTHER_MN)),
      0,
      MSG,
      0
    );
    expect(sig).toEqual(expected);
  });

  it("migrates on the first signature when the password is typed there", async () => {
    const { Signer, SignContext, Keystore, fx } = await upgraded();
    const sig = await Signer.signBytes(
      hdAcct(fx.hdA0.addr, 0, 1),
      MSG,
      new SignContext(PASS)
    );
    expect(sig.length).toBe(64);
    expect(await Keystore.header()).toMatchObject({ mode: "password" });
  });
});

describe("1.x Algo25 keys", () => {
  it("are gated by the wallet password once one exists", async () => {
    const { Signer, SignContext, fx } = await upgraded();
    const acct = { addr: fx.hotAddr, isFalcon25: false } as any;
    await expect(
      Signer.signBytes(acct, MSG, new SignContext())
    ).rejects.toThrow("Password Required");
    await expect(
      Signer.signBytes(acct, MSG, new SignContext("wrong"))
    ).rejects.toMatchObject({ name: "OperationError" });
    const sig = await Signer.signBytes(acct, MSG, new SignContext(PASS));
    const expected = new Uint8Array(
      await crypto.subtle.sign({ name: "Ed25519" }, fx.hotKey, MSG)
    );
    expect(sig).toEqual(expected);
  });

  it("sign without a prompt in a wallet that never had a password", async () => {
    const { Signer, SignContext, Keystore, fx } = await upgraded("none");
    expect(await Keystore.mode()).toBe("device");
    const sig = await Signer.signBytes(
      { addr: fx.hotAddr, isFalcon25: false } as any,
      MSG,
      new SignContext()
    );
    expect(sig.length).toBe(64);
    expect(await Keystore.header()).toMatchObject({ mode: "device" });
  });
});
