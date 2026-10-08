import { afterEach, describe, expect, it } from "vitest";
import {
  buildV3,
  type Fixture,
  LEDGER_ADDR,
  PASSKEY_ADDR,
  PASS,
  WATCH_ADDR,
} from "./fixtures/v3db";
import { type Env, fakeBrowser, fresh, loadCaches } from "./helpers";

async function upgraded(format: "current" | "none") {
  let fx!: Fixture;
  const env = await fresh(async () => {
    fx = await buildV3(format);
  });
  await loadCaches(env);
  return { ...env, fx };
}

/** AccountInfo rows the way the store getter builds them. */
async function rows(env: Env) {
  await loadCaches(env);
  const accounts: any[] = await env.db.get("app", "accounts");
  const byAddr = (addr: string) => {
    const a = accounts.find((x) => x.addr === addr);
    return {
      ...a,
      isFalcon25: env.store.falcon25Seeds.some((s: any) => s.id === addr),
      secret: env.accountSecret.secretStatus(a, env.store),
    };
  };
  return byAddr;
}

describe("sign gate", () => {
  it("never prompts for accounts with no local secret", async () => {
    const env = await upgraded("current");
    const row = await rows(env);
    const { Signer } = env;
    expect(await Signer.gate([])).toBe("none");
    expect(await Signer.gate([row(WATCH_ADDR)])).toBe("none");
    expect(await Signer.gate([row(LEDGER_ADDR), row(PASSKEY_ADDR)])).toBe(
      "none"
    );
  });

  it("prompts in a 1.x password wallet, before and after its keystore exists", async () => {
    const env = await upgraded("current");
    const { Signer, Keystore, fx } = env;
    let row = await rows(env);
    expect(await Signer.gate([row(fx.hotAddr)])).toBe("password");
    expect(await Signer.gate([row(fx.hdA0.addr)])).toBe("password");
    await Keystore.unlockWithPassword(PASS);
    row = await rows(env);
    // The web build has no session unlock, so every request prompts.
    expect(await Signer.gate([row(fx.hotAddr)])).toBe("password");
    expect(await Signer.gate([row(fx.falconAddr)])).toBe("password");
    // A seed under its own password always needs that password.
    expect(await Signer.gate([row(fx.hdOther0.addr)])).toBe("password");
  });

  it("never prompts in device mode", async () => {
    const env = await upgraded("none");
    const row = await rows(env);
    expect(await env.Signer.gate([row(env.fx.hotAddr)])).toBe("none");
  });
});

describe("sign context", () => {
  it("zeroes a Falcon signer's private key on dispose", async () => {
    const env = await fresh();
    const { FALCON_MN, falconAddress } = await import("./fixtures/v3db");
    const addr = falconAddress(FALCON_MN).addr;
    await env.Keystore.storeMnemonic(
      await env.Keystore.getMk(),
      "falcon25",
      FALCON_MN,
      { id: `falcon25:${addr}`, accounts: (cur) => [...cur, { addr }] }
    );
    const { SignContext } = await import("@/services/Signer");
    const ctx = new SignContext();
    await env.Signer.falconSigner({ addr, isFalcon25: true } as any, ctx);
    const sk: Uint8Array = (ctx as any).falcon.get(addr).privateKey;
    expect(sk.some((b) => b !== 0)).toBe(true);
    ctx.dispose();
    expect(sk.every((b) => b === 0)).toBe(true);
  });
});

describe("sign-in data", () => {
  it("refuses an ed25519 signature from a Falcon account", async () => {
    const env = await upgraded("current");
    const row = await rows(env);
    await expect(
      env.Signer.signBytes(
        row(env.fx.falconAddr),
        new Uint8Array(64),
        new env.SignContext(PASS)
      )
    ).rejects.toThrow("Falcon accounts cannot");
  });
});

describe("extension session unlock", () => {
  afterEach(() => {
    delete (globalThis as any).browser;
  });

  it("signs without the password while unlocked, and prompts once locked", async () => {
    const env = await upgraded("current");
    const { Signer, SignContext, Keystore, Unlock, store, fx } = env;
    (globalThis as any).browser = fakeBrowser();
    Object.assign(store, { isWeb: false, autoLockMinutes: 5 });
    const msg = new Uint8Array(32).fill(3);

    await Keystore.unlockWithPassword(PASS);
    let row = await rows(env);
    const acct = row(fx.hdA0.addr);
    expect(await Signer.gate([acct])).toBe("unlocked");
    const typed = await Signer.signBytes(acct, msg, new SignContext(PASS));
    const cached = await Signer.signBytes(acct, msg, new SignContext());
    expect(cached).toEqual(typed);

    await Unlock.clear();
    row = await rows(env);
    expect(await Signer.gate([row(fx.hdA0.addr)])).toBe("password");
    await expect(
      Signer.signBytes(row(fx.hdA0.addr), msg, new SignContext())
    ).rejects.toThrow();
  });
});
