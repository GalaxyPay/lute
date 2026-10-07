import algosdk from "algosdk";
import { describe, expect, it, vi } from "vitest";
import {
  buildV3,
  FALCON_MN,
  type Fixture,
  HD_MN,
  HD_OTHER_MN,
  hdAccount,
  HOT_MN,
  MSIG_ADDR,
  PASSKEY_ADDR,
  PASS,
} from "./fixtures/v3db";
import { type Env, fresh, pairedTransports } from "./helpers";

const NEW_HOT = algosdk.mnemonicFromSeed(new Uint8Array(32).fill(11));
const NEW_HOT_ADDR = algosdk.mnemonicToSecretKey(NEW_HOT).addr.toString();
const B_HOT = algosdk.mnemonicFromSeed(new Uint8Array(32).fill(12));
const B_HOT_ADDR = algosdk.mnemonicToSecretKey(B_HOT).addr.toString();

/** A 1.x web wallet after its first password entry, one upgrade and one new account. */
async function senderWallet() {
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
  return { ...env, fx };
}

/**
 * The same 1.x wallet with everything upgraded and a new account on the first
 * HD seed: the sender for upgrading a copy of it that was only migrated.
 */
async function upgradedWallet() {
  const env = await senderWallet();
  const { fx, Keystore } = env;
  const mk = await Keystore.unwrap(PASS);
  await Keystore.upgradeSecret(mk, "algo25", HOT_MN, { addr: fx.hotAddr });
  await Keystore.upgradeSecret(mk, "falcon25", FALCON_MN, {
    addr: fx.falconAddr,
  });
  const hdA1 = await hdAccount(HD_MN, 1);
  await Keystore.putSecrets(mk, [], {
    accounts: (cur) => [...cur, { ...hdA1, slot: 1, seedId: 1 }],
  });
  return { ...env, hdA1 };
}

/** The 1.x wallet after its first password entry and nothing else. */
async function migratedWallet() {
  const env = await fresh(async () => {
    await buildV3("current");
  });
  await env.Keystore.unlockWithPassword(PASS);
  return env;
}

/** An extension wallet with a passkey seed (taking seed id 1) and one account. */
async function receiverWallet() {
  const env = await fresh();
  await env.Seed.storePasskeyCred("local-passkey");
  await env.Keystore.storeMnemonic(await env.Keystore.getMk(), "algo25", B_HOT, {
    id: `algo25:${B_HOT_ADDR}`,
    accounts: (cur) => [...cur, { addr: B_HOT_ADDR }],
  });
  return env;
}

/** Everything a wallet holds, for before/after comparison. */
async function snapshot(env: Env) {
  const { db } = env;
  return {
    accounts: await db.get("app", "accounts"),
    header: await db.get("app", "keystore"),
    keystore: await db.getAll("keystore"),
    seeds: await db.getAll("seeds"),
    falcon: await db.getAll("falcon25-seeds"),
    keys: await db.keys("keys"),
  };
}

/** Both outcomes, observed together so neither rejection goes unhandled. */
async function settle(s: { sent: Promise<unknown>; received: Promise<unknown> }) {
  const [sent, received] = await Promise.allSettled([s.sent, s.received]);
  const reason = (r: PromiseSettledResult<unknown>) =>
    r.status === "rejected" ? r.reason : undefined;
  return { sent: reason(sent), received: reason(received) };
}

/**
 * Run one sync from wallet A (web, unlocked up front as the UI does) to
 * wallet B (extension). `payloadSent` records when the sender's keys leave.
 */
async function run(
  a: Env,
  b: Env,
  opts: {
    confirm?: () => Promise<boolean>;
    receiverGetMk?: () => Promise<any>;
  } = {}
) {
  const [toB, toA] = pairedTransports();
  const payloadSent = vi.fn();
  const send = toB.send.bind(toB);
  toB.send = (m) => {
    if (m.t === "payload") payloadSent();
    send(m);
  };
  const receiverGetMk = vi.fn(opts.receiverGetMk ?? (() => b.Keystore.getMk()));
  const mk = await a.Keystore.unwrap(PASS);
  const sent = a.SyncSession.runSender("web", toB, { appVersion: "test", mk });
  const received = b.SyncSession.runReceiver("ext", toA, {
    confirm: opts.confirm ?? (async () => true),
    getMk: receiverGetMk,
  });
  return { sent, received, payloadSent, receiverGetMk, toA, toB };
}

describe("session crypto", () => {
  it("derives one key on both sides and binds the payload to its direction", async () => {
    const { SyncSession: S, Transfer } = await fresh();
    const web = await S.createKeys();
    const ext = await S.createKeys();
    const kWeb = await S.deriveSessionKey(web.privateKey, ext.pub, web.pub, ext.pub);
    const kExt = await S.deriveSessionKey(ext.privateKey, web.pub, web.pub, ext.pub);
    const payload = {
      createdAt: "now",
      from: "web" as const,
      appVersion: "test",
      accounts: [{ addr: "A", appId: 5n }],
      secrets: [],
      skipped: [],
    };
    const sealed = await S.seal("web", payload, kWeb);
    expect(await S.open("web", sealed, kExt)).toEqual(payload);
    // Not reflectable: the same bytes do not open as coming from the extension.
    await expect(S.open("ext", sealed, kExt)).rejects.toMatchObject({
      name: "OperationError",
    });
    const raw = Uint8Array.fromBase64(sealed);
    raw[raw.length - 1]! ^= 1;
    await expect(S.open("web", raw.toBase64(), kExt)).rejects.toMatchObject({
      name: "OperationError",
    });
    // A third party's key derives something else.
    const eve = await S.createKeys();
    const kEve = await S.deriveSessionKey(eve.privateKey, web.pub, web.pub, eve.pub);
    await expect(S.open("web", sealed, kEve)).rejects.toMatchObject({
      name: "OperationError",
    });
    expect(Transfer).toBeTruthy();
  });
});

describe("one-way sync", () => {
  it("adds the sender's accounts to the receiver and leaves the sender untouched", async () => {
    const a = await senderWallet();
    const fx = a.fx;
    const before = await snapshot(a);
    const b = await receiverWallet();

    const { sent, received } = await run(a, b);
    const [s, r] = await Promise.all([sent, received]);
    expect(r.added).toBe(8);
    expect(s).toEqual(r);
    // The receiver is in device mode, and the sender learns so.
    expect(s.passwordProtected).toBe(false);
    expect(r.skipped.map((x) => x.addr).sort()).toEqual(
      [PASSKEY_ADDR, fx.hotAddr, fx.hdOther0.addr].sort()
    );
    expect(await snapshot(a)).toEqual(before);

    const accounts: any[] = await b.db.get("app", "accounts");
    const find = (addr: string) => accounts.find((x) => x.addr === addr);
    expect(find(B_HOT_ADDR)).toBeTruthy();
    // Seed ids are renumbered here; both accounts on one seed still share it.
    const a0 = find(fx.hdA0.addr);
    expect(a0.seedId).not.toBe(1);
    expect(find(fx.hdA2.addr).seedId).toBe(a0.seedId);
    const mk = await b.Keystore.getMk();
    expect(await b.Keystore.exportMnemonic(mk, `bip39:${a0.seedId}`)).toBe(HD_MN);
    expect(await b.Keystore.exportMnemonic(mk, `algo25:${NEW_HOT_ADDR}`)).toBe(
      NEW_HOT
    );
    // One-way material travels too, and stays signable.
    const b0 = find(fx.hdB0.addr);
    expect(((await b.db.get("keystore", `bip39:${b0.seedId}`)) as any).form).toBe(
      "seed"
    );
    expect(find(MSIG_ADDR).appId).toBe(123n);
    expect(find(fx.hotAddr)).toBeUndefined();
    // The receiver's own passkey seed is untouched.
    expect(await b.db.get("seeds", 1)).toMatchObject({
      credentialId: "local-passkey",
    });

    const again = await run(a, b);
    const [, r2] = await Promise.all([again.sent, again.received]);
    expect(r2.added).toBe(0);
    expect(((await b.db.get("app", "accounts")) as any[]).length).toBe(9);
  });

  it("sends no keys until the receiver has confirmed and unlocked", async () => {
    const a = await senderWallet();
    const b = await receiverWallet();
    const session: Awaited<ReturnType<typeof run>> = await run(a, b, {
      confirm: async () => {
        // Give a misbehaving sender time to send early before checking.
        await new Promise((r) => setTimeout(r, 50));
        expect(session.payloadSent).not.toHaveBeenCalled();
        return true;
      },
    });
    await Promise.all([session.sent, session.received]);
    expect(session.receiverGetMk).toHaveBeenCalledOnce();
    expect(session.payloadSent).toHaveBeenCalledOnce();
    expect(session.receiverGetMk.mock.invocationCallOrder[0]!).toBeLessThan(
      session.payloadSent.mock.invocationCallOrder[0]!
    );
  });

  it("writes nothing on either side when the receiver declines", async () => {
    const a = await senderWallet();
    const b = await receiverWallet();
    const [beforeA, beforeB] = [await snapshot(a), await snapshot(b)];
    const s = await run(a, b, { confirm: async () => false });
    const out = await settle(s);
    expect(out.sent).toMatchObject({ code: "declined" });
    expect(out.received).toMatchObject({ code: "declined" });
    expect(s.payloadSent).not.toHaveBeenCalled();
    expect(await snapshot(a)).toEqual(beforeA);
    expect(await snapshot(b)).toEqual(beforeB);
  });

  it("writes nothing when the sender's window closes mid-session", async () => {
    const a = await senderWallet();
    const b = await receiverWallet();
    const beforeB = await snapshot(b);
    const session: Awaited<ReturnType<typeof run>> = await run(a, b, {
      confirm: async () => {
        session.toB.close();
        return true;
      },
    });
    const out = await settle(session);
    expect(out.sent).toMatchObject({ name: "SyncError" });
    expect(out.received).toMatchObject({ code: "closed" });
    expect(await snapshot(b)).toEqual(beforeB);
  });

  it("counts a password the receiver sets while confirming", async () => {
    const a = await senderWallet();
    const b = await receiverWallet();
    const { sent, received } = await run(a, b, {
      confirm: async () => {
        await b.Keystore.newPassword(PASS);
        return true;
      },
      receiverGetMk: () => b.Keystore.unwrap(PASS),
    });
    const [s, r] = await Promise.all([sent, received]);
    expect(s.passwordProtected).toBe(true);
    expect(r.passwordProtected).toBe(true);
  });

  it("tells the sender when the receiver cancels its unlock", async () => {
    const a = await senderWallet();
    const b = await receiverWallet();
    const beforeB = await snapshot(b);
    const { UserCancelled } = await import("@/utils/keys");
    const s = await run(a, b, {
      receiverGetMk: async () => {
        throw new UserCancelled();
      },
    });
    const out = await settle(s);
    expect(out.sent).toMatchObject({ code: "cancelled" });
    expect(out.received).toMatchObject({ code: "cancelled" });
    expect(s.payloadSent).not.toHaveBeenCalled();
    expect(await snapshot(b)).toEqual(beforeB);
  });
});

describe("sync upgrades", () => {
  it("upgrades the receiver's one-way and 1.x copies from exportable secrets", async () => {
    const a = await upgradedWallet();
    const { fx, hdA1 } = a;
    const b = await migratedWallet();
    const receiverGetMk = () => b.Keystore.unwrap(PASS);
    const beforeKeystore = (await b.db.getAll("keystore")).map((r: any) => r.id);

    const { sent, received } = await run(a, b, { receiverGetMk });
    const [s, r] = await Promise.all([sent, received]);
    expect(s).toEqual(r);
    expect(s.passwordProtected).toBe(true);
    expect(r.added).toBe(2);
    expect(r.upgraded).toBe(4);
    const skippedAddrs = r.skipped.map((x) => x.addr);
    for (const addr of [fx.hdA0.addr, fx.hdA2.addr, fx.hotAddr, fx.falconAddr])
      expect(skippedAddrs).not.toContain(addr);
    // Opaque on both sides: nothing to upgrade.
    expect(r.skipped).toContainEqual({
      addr: fx.hdB0.addr,
      reason: "Already in this wallet",
    });

    const mk = await b.Keystore.unwrap(PASS);
    expect(await b.Keystore.exportMnemonic(mk, "bip39:1")).toBe(HD_MN);
    expect(await b.Keystore.exportMnemonic(mk, `algo25:${fx.hotAddr}`)).toBe(HOT_MN);
    expect(
      await b.Keystore.exportMnemonic(mk, `falcon25:${fx.falconAddr}`)
    ).toBe(FALCON_MN);
    // The 1.x CryptoKey is superseded.
    expect(await b.db.keys("keys")).not.toContain(fx.hotAddr);
    // The new account joins the seed this wallet already had; no second copy.
    const accounts: any[] = await b.db.get("app", "accounts");
    expect(accounts.find((x) => x.addr === hdA1.addr).seedId).toBe(1);
    const ids = (await b.db.getAll("keystore")).map((r: any) => r.id);
    expect(ids.filter((id: string) => id.startsWith("bip39:")).sort()).toEqual(
      beforeKeystore.filter((id: string) => id.startsWith("bip39:")).sort()
    );
    expect(accounts.find((x) => x.addr === fx.falconAddr).falconPk).toBeTruthy();

    // An exportable copy is never replaced.
    const again = await run(a, b, { receiverGetMk });
    const [, r2] = await Promise.all([again.sent, again.received]);
    expect(r2.added).toBe(0);
    expect(r2.upgraded).toBe(0);
  });

  it("does not upgrade from a secret that derives other accounts", async () => {
    const a = await upgradedWallet();
    const { fx } = a;
    const b = await migratedWallet();
    const payload = await a.Transfer.buildPayload(await a.Keystore.unwrap(PASS), {
      from: "web",
      appVersion: "test",
    });
    const swap = (id: string, data: string) => {
      const s = payload.secrets.find((x) => x.id === id)!;
      s.data = data;
    };
    swap(
      "bip39:1",
      a.Keystore.plaintextFromMnemonic("bip39", HD_OTHER_MN).plaintext.toBase64()
    );
    swap(
      `algo25:${fx.hotAddr}`,
      a.Keystore.plaintextFromMnemonic("algo25", NEW_HOT).plaintext.toBase64()
    );
    const mk = await b.Keystore.unwrap(PASS);
    const before = await snapshot(b);
    const r = await b.Transfer.addPayload(mk, payload);
    expect(r.upgraded).toBe(1); // only the untouched Falcon secret
    for (const addr of [fx.hdA0.addr, fx.hotAddr])
      expect(r.skipped).toContainEqual({ addr, reason: "Already in this wallet" });
    const rec: any = await b.db.get("keystore", "bip39:1");
    expect(rec.form).toBe("seed");
    expect(await b.db.get("keystore", `algo25:${fx.hotAddr}`)).toBeUndefined();
    expect(await b.db.keys("keys")).toContain(fx.hotAddr);
    expect((await b.db.get("keystore", "bip39:1")) as any).toEqual(
      before.keystore.find((x: any) => x.id === "bip39:1")
    );
  });
});
