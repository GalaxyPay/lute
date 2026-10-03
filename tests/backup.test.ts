import algosdk from "algosdk";
import { describe, expect, it } from "vitest";
import {
  buildV3,
  type Fixture,
  HD_MN,
  MSIG_ADDR,
  PASSKEY_ADDR,
  PASS,
} from "./fixtures/v3db";
import { fresh } from "./helpers";

const NEW_HOT = algosdk.mnemonicFromSeed(new Uint8Array(32).fill(11));
const NEW_HOT_ADDR = algosdk.mnemonicToSecretKey(NEW_HOT).addr.toString();

/** A 1.x wallet after its first password entry, one upgrade and one new account. */
async function sourceWallet() {
  let fx!: Fixture;
  const env = await fresh(async () => {
    fx = await buildV3("current");
  });
  const mk = await env.Keystore.unlockWithPassword(PASS);
  await env.Keystore.upgradeSecret(mk, "bip39", HD_MN, {
    seedId: 1,
    addr: fx.hdA0.addr,
  });
  await env.Keystore.storeMnemonic(mk, "algo25", NEW_HOT, {
    id: `algo25:${NEW_HOT_ADDR}`,
    accounts: (cur) => [...cur, { addr: NEW_HOT_ADDR }],
  });
  const { text, skipped } = await env.Backup.exportBundle(
    await env.Keystore.unwrap(PASS),
    "file password",
    { from: "web", appVersion: "test" }
  );
  return { text, skipped, fx };
}

describe("backup and restore", () => {
  it("lists what cannot travel", async () => {
    const { skipped, fx } = await sourceWallet();
    expect(skipped.map((s) => s.addr).sort()).toEqual(
      [PASSKEY_ADDR, fx.hotAddr, fx.hdOther0.addr].sort()
    );
  });

  it("restores into another wallet with new seed ids", async () => {
    const { text, fx } = await sourceWallet();
    const { Backup, Keystore, Seed, db } = await fresh();
    // Occupy seed id 1 so restored seeds must be renumbered.
    await Seed.storePasskeyCred("local-passkey");

    await expect(Backup.readBundle(text, "wrong")).rejects.toMatchObject({
      name: "OperationError",
    });
    const file = JSON.parse(text);
    const flipped = Uint8Array.fromBase64(file.data);
    flipped[0]! ^= 1;
    await expect(
      Backup.readBundle(
        JSON.stringify({ ...file, data: flipped.toBase64() }),
        "file password"
      )
    ).rejects.toMatchObject({ name: "OperationError" });
    await expect(Backup.readBundle("{}", "x")).rejects.toThrow(
      "Not a Lute backup file"
    );

    const payload = await Backup.readBundle(text, "file password");
    const mk = await Keystore.getMk();
    const { added } = await Backup.restoreBundle(mk, payload);
    expect(added).toBe(8);

    const accounts: any[] = await db.get("app", "accounts");
    const find = (addr: string) => accounts.find((a) => a.addr === addr);
    const a0 = find(fx.hdA0.addr);
    expect(a0.seedId).not.toBe(1);
    expect(find(fx.hdA2.addr).seedId).toBe(a0.seedId);
    expect(await Keystore.exportMnemonic(mk, `bip39:${a0.seedId}`)).toBe(
      HD_MN
    );
    expect(await Keystore.exportMnemonic(mk, `algo25:${NEW_HOT_ADDR}`)).toBe(
      NEW_HOT
    );
    // One-way material travels too: still signable on the other side.
    const b0 = find(fx.hdB0.addr);
    expect((await db.get("keystore", `bip39:${b0.seedId}`))?.form).toBe(
      "seed"
    );
    expect(find(MSIG_ADDR).appId).toBe(123n);
    expect(find(fx.hotAddr)).toBeUndefined();

    const again = await Backup.restoreBundle(mk, payload);
    expect(again.added).toBe(0);
    expect(((await db.get("app", "accounts")) as any[]).length).toBe(8);
  });
});
