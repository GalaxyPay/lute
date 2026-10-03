import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Env, fresh } from "./helpers";

const MIN = 60_000;

/** A stand-in for the extension's storage.session and alarms APIs. */
function fakeBrowser() {
  const data: Record<string, any> = {};
  return {
    data,
    storage: {
      session: {
        async get(key: string) {
          return key in data ? { [key]: structuredClone(data[key]) } : {};
        },
        async set(obj: Record<string, any>) {
          Object.assign(data, structuredClone(obj));
        },
        async remove(key: string) {
          delete data[key];
        },
      },
      onChanged: { addListener() {} },
    },
    alarms: { create: vi.fn(), clear: vi.fn() },
  };
}

let env: Env;
let browser: ReturnType<typeof fakeBrowser>;

beforeEach(async () => {
  env = await fresh();
  browser = fakeBrowser();
  (globalThis as any).browser = browser;
  Object.assign(env.store, {
    isWeb: false,
    autoLockMinutes: 5,
    keystoreMode: "password",
  });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as any).browser;
});

describe("session unlock", () => {
  it("caches one master key for its own header id only", async () => {
    const { Unlock, kdf } = env;
    const raw = crypto.getRandomValues(new Uint8Array(32));
    await Unlock.unlock(raw, "id1");
    expect(await Unlock.isUnlocked()).toBe(true);
    const cached = (await Unlock.get("id1"))!;
    expect(cached.key.extractable).toBe(false);
    const iv = new Uint8Array(12);
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await kdf.importMk(raw),
      new Uint8Array([1, 2, 3])
    );
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      cached.key,
      ct
    );
    expect(new Uint8Array(pt)).toEqual(new Uint8Array([1, 2, 3]));
    expect(await Unlock.get("id2")).toBeUndefined();
  });

  it("locks after the idle window and clears the state", async () => {
    const { Unlock } = env;
    await Unlock.unlock(new Uint8Array(32), "id1");
    vi.setSystemTime(Date.now() + 6 * MIN);
    expect(await Unlock.isUnlocked()).toBe(false);
    expect(browser.data.unlock).toBeUndefined();
  });

  it("slides on use but never past the hard cap", async () => {
    const { Unlock } = env;
    await Unlock.unlock(new Uint8Array(32), "id1");
    vi.setSystemTime(Date.now() + 4 * MIN);
    await Unlock.touch();
    vi.setSystemTime(Date.now() + 4 * MIN);
    expect(await Unlock.isUnlocked()).toBe(true);
    browser.data.unlock.hardExpiresAt = Date.now() + MIN;
    await Unlock.touch();
    expect(browser.data.unlock.expiresAt).toBe(browser.data.unlock.hardExpiresAt);
  });

  it("treats a 1.x per-seed unlock as locked", async () => {
    const { Unlock } = env;
    browser.data.unlock = {
      keys: { 1: "AAAA" },
      expiresAt: Date.now() + MIN,
      hardExpiresAt: Date.now() + MIN,
    };
    expect(await Unlock.isUnlocked()).toBe(false);
  });

  it("is off in device mode and in the web build", async () => {
    const { Unlock, store } = env;
    store.keystoreMode = "device";
    await Unlock.unlock(new Uint8Array(32), "id1");
    expect(browser.data.unlock).toBeUndefined();
    store.keystoreMode = "password";
    store.isWeb = true;
    await Unlock.unlock(new Uint8Array(32), "id1");
    expect(browser.data.unlock).toBeUndefined();
  });

  it("lets the keystore skip the prompt until a password change", async () => {
    const { Keystore } = env;
    const mk = await Keystore.newPassword("pw");
    await expect(Keystore.getMk()).rejects.toThrow("Password Required");
    await Keystore.getMk("pw");
    expect((await Keystore.getMk()).id).toBe(mk.id);
    expect(await Keystore.rotate("pw", "pw2")).toBe(true);
    await expect(Keystore.getMk()).rejects.toThrow("Password Required");
  });
});
