// ARC-60 sign-in (SIWA) requests through LuteData, signed by the real Signer
// over the v3 fixture wallet. Ledger and the UI helpers are stubbed out.
import algosdk from "algosdk";
import { canonify } from "canonify";
import { generateKey, verifyCompressed } from "falcon-1024";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildV3, FALCON_MN, PASS } from "./fixtures/v3db";
import { fresh, loadCaches } from "./helpers";

const posted = vi.hoisted(() => [] as any[]);

vi.mock("@/utils", () => ({
  isBadPassword: () => false,
  needsPassword: () => false,
  signDataResponseSafe: (x: any) => x,
  selectDevice: async () => undefined,
  sendOrPostMessage: (m: any) => posted.push(m),
}));
vi.mock("@ledgerhq/hw-transport-webhid", () => ({ default: {} }));
vi.mock("@ledgerhq/hw-transport-webusb", () => ({ default: {} }));
vi.mock("ledger-algorand-js", () => ({ AlgorandApp: class {} }));

(globalThis as any).window ??= { close() {} };

const DOMAIN = "dapp.example";

async function sha256(data: Uint8Array<ArrayBuffer>) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}

function falconKey() {
  const keySeed = algosdk.pq25WordMnemonicToSeed(
    FALCON_MN,
    algosdk.FALCON_1024_SCHEME
  );
  const { publicKey } = generateKey(keySeed);
  const { address } = algosdk.addressFromPQKey(
    algosdk.FALCON_1024_SCHEME,
    publicKey
  );
  return { publicKey, addr: address.toString() };
}

async function setup() {
  let fx!: Awaited<ReturnType<typeof buildV3>>;
  const env = await fresh(async () => {
    fx = await buildV3("current");
  });
  await loadCaches(env);
  const accounts: any[] = await env.db.get("app", "accounts");
  Object.assign(env.store, {
    debug: false,
    device: { transport: undefined, list: [] },
    acctInfo: accounts.map((a) => ({
      ...a,
      canSign: true,
      isFalcon25: a.addr === fx.falconAddr,
    })),
  });
  const LuteData = (await import("@/classes/LuteData")).default;
  return { env, fx, LuteData };
}

async function request(
  LuteData: any,
  account_address: string,
  type: string,
  signer: Uint8Array
) {
  const siwa = {
    domain: DOMAIN,
    account_address,
    uri: `https://${DOMAIN}`,
    version: "1",
    chain_id: "283",
    type,
  };
  const json = canonify(siwa)!;
  const authenticatorData = await sha256(new TextEncoder().encode(DOMAIN));
  const ld = new LuteData(
    {
      data: new TextEncoder().encode(json).toBase64(),
      signer,
      domain: DOMAIN,
      authenticatorData,
    },
    { scope: 1, encoding: "base64" },
    DOMAIN
  );
  await ld.validate();
  const toSign = new Uint8Array([
    ...(await sha256(new TextEncoder().encode(json))),
    ...(await sha256(authenticatorData)),
  ]);
  return { ld, toSign };
}

beforeEach(() => {
  posted.length = 0;
});

describe("SIWA falcon1024", () => {
  it("signs with the Falcon key the request names", async () => {
    const { LuteData, fx } = await setup();
    const { publicKey, addr } = falconKey();
    expect(addr).toBe(fx.falconAddr);
    const { ld, toSign } = await request(
      LuteData,
      addr,
      "falcon1024",
      publicKey
    );
    expect(posted).toEqual([]);
    expect(await ld.sign(PASS)).toBe(true);
    expect(posted).toHaveLength(1);
    const resp = posted[0].signerResponse;
    expect(posted[0].action).toBe("signed");
    expect(resp.signer).toEqual(publicKey);
    expect(verifyCompressed(publicKey, resp.signature, toSign)).toBe(true);
  });

  it("rejects a signer whose length does not match the type", async () => {
    const { LuteData, fx } = await setup();
    const { publicKey } = falconKey();
    await request(LuteData, fx.falconAddr, "ed25519", publicKey);
    expect(posted[0]).toMatchObject({ action: "error", code: 4603 });
  });

  it("rejects a Falcon key the wallet does not hold", async () => {
    const { LuteData } = await setup();
    const { publicKey } = generateKey(new Uint8Array(48).fill(9));
    const addr = algosdk
      .addressFromPQKey(algosdk.FALCON_1024_SCHEME, publicKey)
      .address.toString();
    const { ld } = await request(LuteData, addr, "falcon1024", publicKey);
    expect(posted).toEqual([]);
    await ld.sign(PASS);
    expect(posted[0]).toMatchObject({ action: "error", code: 4603 });
  });

  it("rejects falcon1024 for an ed25519 account", async () => {
    const { LuteData, fx } = await setup();
    // Not a Falcon public key, but the right size to pass validation.
    const signer = new Uint8Array(publicKeySize()).fill(1);
    const { ld } = await request(LuteData, fx.hotAddr, "falcon1024", signer);
    await ld.sign(PASS);
    expect(posted[0]).toMatchObject({ action: "error", code: 4603 });
  });

  it("still signs ed25519 requests", async () => {
    const { LuteData, fx } = await setup();
    const signer = algosdk.Address.fromString(fx.hotAddr).publicKey;
    const { ld, toSign } = await request(
      LuteData,
      fx.hotAddr,
      "ed25519",
      signer
    );
    expect(await ld.sign(PASS)).toBe(true);
    const resp = posted[0].signerResponse;
    const key = await crypto.subtle.importKey(
      "raw",
      new Uint8Array(signer),
      "Ed25519",
      false,
      ["verify"]
    );
    expect(
      await crypto.subtle.verify("Ed25519", key, resp.signature, toSign)
    ).toBe(true);
  });
});

function publicKeySize() {
  return falconKey().publicKey.length;
}
