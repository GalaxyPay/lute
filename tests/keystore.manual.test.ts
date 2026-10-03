import { describe, expect, it } from "vitest";
import {
  buildV3,
  FALCON_MN,
  type Fixture,
  HD2_MN,
  HD_MN,
  HD_OTHER_MN,
  HOT_MN,
  PASS,
} from "./fixtures/v3db";
import { fresh, loadCaches } from "./helpers";

const MSG = new Uint8Array([9, 8, 7]);

async function upgraded() {
  let fx!: Fixture;
  const env = await fresh(async () => {
    fx = await buildV3("current");
  });
  const mk = await env.Keystore.unlockWithPassword(PASS);
  return { ...env, fx, mk };
}

describe("mnemonic verification against public data", () => {
  it("matches an HD mnemonic against the xpub of every account on the seed", async () => {
    const { Keystore, fx } = await upgraded();
    const accts = [
      { addr: fx.hdA0.addr, slot: 0, seedId: 1, xpub: fx.hdA0.xpub },
      { addr: fx.hdA2.addr, slot: 2, seedId: 1, xpub: fx.hdA2.xpub },
    ];
    expect(await Keystore.mnemonicMatches("bip39", HD_MN, accts)).toBe(true);
    expect(await Keystore.mnemonicMatches("bip39", HD2_MN, accts)).toBe(false);
    // A record without an xpub falls back to the address.
    const noXpub = accts.map(({ xpub: _x, ...a }) => a);
    expect(await Keystore.mnemonicMatches("bip39", HD_MN, noXpub)).toBe(true);
    expect(await Keystore.mnemonicMatches("bip39", "not words", accts)).toBe(
      false
    );
    expect(await Keystore.mnemonicMatches("bip39", HD_MN, [])).toBe(false);
  });

  it("matches Algo25 and Falcon mnemonics by address", async () => {
    const { Keystore, fx } = await upgraded();
    const hot = [{ addr: fx.hotAddr }];
    const falcon = [{ addr: fx.falconAddr }];
    expect(await Keystore.mnemonicMatches("algo25", HOT_MN, hot)).toBe(true);
    expect(await Keystore.mnemonicMatches("algo25", FALCON_MN, hot)).toBe(
      false
    );
    expect(await Keystore.mnemonicMatches("falcon25", FALCON_MN, falcon)).toBe(
      true
    );
    expect(await Keystore.mnemonicMatches("falcon25", HOT_MN, falcon)).toBe(
      false
    );
  });
});

describe("upgrading an account", () => {
  it("replaces a migrated HD seed in place and keeps its seed id", async () => {
    const { Keystore, db, mk, fx } = await upgraded();
    await Keystore.upgradeSecret(mk, "bip39", HD_MN, {
      seedId: 1,
      addr: fx.hdA0.addr,
    });
    const rec: any = await db.get("keystore", "bip39:1");
    expect(rec.form).toBe("entropy");
    expect(await Keystore.exportMnemonic(mk, "bip39:1")).toBe(HD_MN);
    expect(((await db.getAll("seeds")) as any[]).map((s) => s.id)).toEqual([
      3, 4,
    ]);
  });

  it("replaces a seed left under another password without needing it", async () => {
    const { Keystore, db, mk, fx } = await upgraded();
    await Keystore.upgradeSecret(mk, "bip39", HD_OTHER_MN, {
      seedId: 4,
      addr: fx.hdOther0.addr,
    });
    expect(((await db.getAll("seeds")) as any[]).map((s) => s.id)).toEqual([
      3,
    ]);
    expect(await Keystore.exportMnemonic(mk, "bip39:4")).toBe(HD_OTHER_MN);
  });

  it("never deletes a passkey credential", async () => {
    const { Keystore, db, mk } = await upgraded();
    await Keystore.upgradeSecret(mk, "bip39", HD_MN, {
      seedId: 3,
      addr: "x",
    });
    expect(await db.get("seeds", 3)).toMatchObject({ credentialId: "cred-3" });
  });

  it("replaces a 1.x Algo25 key and signs identically", async () => {
    const { Keystore, Signer, SignContext, db, mk, fx } = await upgraded();
    await Keystore.upgradeSecret(mk, "algo25", HOT_MN, { addr: fx.hotAddr });
    expect(await db.keys("keys")).toEqual([]);
    const sig = await Signer.signBytes(
      { addr: fx.hotAddr, isFalcon25: false } as any,
      MSG,
      new SignContext(PASS)
    );
    const expected = new Uint8Array(
      await crypto.subtle.sign({ name: "Ed25519" }, fx.hotKey, MSG)
    );
    expect(sig).toEqual(expected);
    expect(await Keystore.exportMnemonic(mk, `algo25:${fx.hotAddr}`)).toBe(
      HOT_MN
    );
  });

  it("moves each account's status from legacy to exportable", async () => {
    const env = await upgraded();
    const { Keystore, mk, fx, store, accountSecret } = env;
    const status = (a: any) => accountSecret.secretStatus(a, store);
    const hdA0 = { addr: fx.hdA0.addr, slot: 0, seedId: 1 };
    const hot = { addr: fx.hotAddr };
    const falcon = { addr: fx.falconAddr };
    const other = { addr: fx.hdOther0.addr, slot: 0, seedId: 4 };
    await loadCaches(env);
    expect(status(hdA0)).toBe("keystore-opaque");
    expect(status(hot)).toBe("legacy-key");
    expect(status(falcon)).toBe("keystore-opaque");
    expect(status(other)).toBe("legacy-seed");
    expect(status({ addr: "L", slot: 0 })).toBe("ledger");
    expect(status({ addr: "P", slot: 0, seedId: 3 })).toBe("passkey");
    expect(status({ addr: "M", appId: 1n })).toBe("none");
    expect(status({ addr: "W" })).toBe("none");

    await Keystore.upgradeSecret(mk, "bip39", HD_MN, { seedId: 1, addr: "" });
    await Keystore.upgradeSecret(mk, "algo25", HOT_MN, { addr: fx.hotAddr });
    await Keystore.upgradeSecret(mk, "falcon25", FALCON_MN, {
      addr: fx.falconAddr,
    });
    await Keystore.upgradeSecret(mk, "bip39", HD_OTHER_MN, {
      seedId: 4,
      addr: "",
    });
    await loadCaches(env);
    for (const a of [hdA0, hot, falcon, other])
      expect(status(a)).toBe("keystore");
  });
});
