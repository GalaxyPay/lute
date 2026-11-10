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
  formatAddr: (a: string) => `${a.slice(0, 6)}…${a.slice(52)}`,
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
    accounts,
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
  signer: Uint8Array,
  referrer = DOMAIN,
  scheme?: string
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
      scheme,
    },
    { scope: 1, encoding: "base64" },
    referrer
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

describe("SIWA falcon-1024-det", () => {
  it("signs with the Falcon key the request names", async () => {
    const { LuteData, fx } = await setup();
    const { publicKey, addr } = falconKey();
    expect(addr).toBe(fx.falconAddr);
    const { ld, toSign } = await request(
      LuteData,
      addr,
      "falcon-1024-det",
      publicKey,
      DOMAIN,
      "falcon-1024-det"
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

  it("rejects a Falcon key the wallet does not hold before Sign", async () => {
    const { LuteData } = await setup();
    const { publicKey } = generateKey(new Uint8Array(48).fill(9));
    const addr = algosdk
      .addressFromPQKey(algosdk.FALCON_1024_SCHEME, publicKey)
      .address.toString();
    const { ld } = await request(
      LuteData,
      addr,
      "falcon-1024-det",
      publicKey,
      DOMAIN,
      "falcon-1024-det"
    );
    // Shown with the reason, not answered until the user closes it.
    expect(posted).toEqual([]);
    const message = `Account ${addr.slice(0, 6)}…${addr.slice(52)} is not in Lute`;
    expect(ld.signerError).toMatchObject({ code: 4603, message });
    ld.rejectUnsignable();
    ld.rejectUnsignable();
    expect(posted).toEqual([
      expect.objectContaining({ action: "error", code: 4603, message }),
    ]);
  });

  it("rejects falcon-1024-det for an ed25519 account", async () => {
    const { LuteData, fx } = await setup();
    // Not a Falcon public key, but the right size to pass validation.
    const signer = new Uint8Array(publicKeySize()).fill(1);
    const { ld } = await request(
      LuteData,
      fx.hotAddr,
      "falcon-1024-det",
      signer,
      DOMAIN,
      "falcon-1024-det"
    );
    expect(ld.signerError?.message).toMatch(/is not in Lute$/);
    await ld.sign(PASS);
    expect(posted[0]).toMatchObject({ action: "error", code: 4603 });
  });

  it("names a watch account before Sign", async () => {
    const { LuteData, env, fx } = await setup();
    const watch = (env.store as any).acctInfo.find(
      (a: any) => a.addr === fx.hotAddr
    );
    watch.canSign = false;
    const signer = algosdk.Address.fromString(fx.hotAddr).publicKey;
    const { ld } = await request(LuteData, fx.hotAddr, "ed25519", signer);
    expect(posted).toEqual([]);
    expect(ld.signerError?.message).toMatch(/has no signing key in Lute$/);
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

describe("SIWA validation gates signing", () => {
  it("does not sign a request whose domain is not the referrer", async () => {
    const { LuteData, fx } = await setup();
    const signer = algosdk.Address.fromString(fx.hotAddr).publicKey;
    // validate() parses the SIWA message before it compares domains, so the
    // request object looks complete even though validation failed.
    const { ld } = await request(
      LuteData,
      fx.hotAddr,
      "ed25519",
      signer,
      "evil.example"
    );
    expect(ld.siwa).toBeDefined();
    expect(posted).toEqual([
      expect.objectContaining({ action: "error", code: 4610 }),
    ]);
    posted.length = 0;
    await ld.sign(PASS);
    // Not signed, and one answer to the dapp, not a second error.
    expect(posted).toEqual([]);
  });

  it("does not sign a request that was never validated", async () => {
    const { LuteData, fx } = await setup();
    const signer = algosdk.Address.fromString(fx.hotAddr).publicKey;
    const { ld } = await request(LuteData, fx.hotAddr, "ed25519", signer);
    ld.validated = false;
    await ld.sign(PASS);
    expect(posted).toEqual([
      expect.objectContaining({ action: "error", code: 4300 }),
    ]);
  });
});

describe("StdSignData.scheme", () => {
  it.each(["ed25519", undefined])("signs with scheme %s", async (scheme) => {
    const { LuteData, fx } = await setup();
    const signer = algosdk.Address.fromString(fx.hotAddr).publicKey;
    const { ld } = await request(
      LuteData,
      fx.hotAddr,
      "ed25519",
      signer,
      DOMAIN,
      scheme
    );
    expect(posted).toEqual([]);
    expect(await ld.sign(PASS)).toBe(true);
    expect(posted[0].signerResponse.scheme).toBe(scheme);
  });

  it("rejects an omitted scheme for falcon-1024-det", async () => {
    const { LuteData, fx } = await setup();
    const { publicKey } = falconKey();
    await request(LuteData, fx.falconAddr, "falcon-1024-det", publicKey);
    expect(posted).toEqual([
      expect.objectContaining({ action: "error", code: 4601 }),
    ]);
  });

  it.each(["falcon-1024-det", "falcon1024"])(
    "rejects scheme %s that does not match siwa.type",
    async (scheme) => {
      const { LuteData, fx } = await setup();
      const signer = algosdk.Address.fromString(fx.hotAddr).publicKey;
      const { ld } = await request(
        LuteData,
        fx.hotAddr,
        "ed25519",
        signer,
        DOMAIN,
        scheme
      );
      expect(posted).toEqual([
        expect.objectContaining({ action: "error", code: 4601 }),
      ]);
      posted.length = 0;
      await ld.sign(PASS);
      // Already answered: not signed, and no second error.
      expect(posted).toEqual([]);
    }
  );
});

describe("legacy SIWA requests (LuteDataOld)", () => {
  async function legacy(data: string) {
    const LuteDataOld = (await import("@/classes/LuteData.old")).default;
    return new LuteDataOld(data, { scope: 1, encoding: "base64" }, DOMAIN);
  }

  it("signs a legacy request bound to the referrer", async () => {
    const { fx } = await setup();
    const siwa = {
      domain: DOMAIN,
      account_address: fx.hotAddr,
      uri: `https://${DOMAIN}`,
      version: "1",
      chain_id: "283",
      type: "ed25519",
    };
    const ld = await legacy(
      new TextEncoder().encode(canonify(siwa)!).toBase64()
    );
    await ld.validate();
    expect(await ld.sign(PASS)).toBe(true);
    expect(posted[0].action).toBe("signed");
  });

  it.each([
    ["not base64 JSON", "bm90IGpzb24="],
    ["a bad address", btoa(JSON.stringify({ account_address: "nope" }))],
  ])("reports Bad JSON for %s", async (_name, data) => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(legacy(data)).rejects.toMatchObject({ code: 4609 });
    } finally {
      err.mockRestore();
    }
    expect(posted).toEqual([
      expect.objectContaining({ action: "error", code: 4609 }),
    ]);
  });
});

describe("isSiwa", () => {
  const base = {
    domain: DOMAIN,
    account_address: "A",
    uri: `https://${DOMAIN}`,
    version: "1",
    chain_id: "283",
    type: "ed25519",
  };
  let isSiwa: (v: unknown) => boolean;
  beforeEach(async () => {
    isSiwa = (await import("@/classes/LuteData")).isSiwa;
  });

  it("accepts required fields with every optional one", () => {
    expect(isSiwa(base)).toBe(true);
    expect(
      isSiwa({
        ...base,
        type: "falcon-1024-det",
        statement: "s",
        nonce: "n",
        "issued-at": "i",
        "expiration-time": "e",
        "not-before": "b",
        "request-id": "r",
        resources: ["x", "y"],
      })
    ).toBe(true);
  });

  it.each([
    ["null", null],
    ["an array", [base]],
    ["a string", "{}"],
    ["a missing required field", { ...base, chain_id: undefined }],
    ["a non-string required field", { ...base, version: 1 }],
    ["a null optional field", { ...base, nonce: null }],
    ["non-string resources", { ...base, resources: ["x", 1] }],
    ["resources that is not an array", { ...base, resources: "x" }],
    ["an unknown type", { ...base, type: "falcon1024" }],
    ["an inherited type name", { ...base, type: "toString" }],
    ["an unknown key", { ...base, extra: "x" }],
    [
      "a __proto__ key",
      JSON.parse(`{"__proto__":{},${JSON.stringify(base).slice(1)}`),
    ],
  ])("rejects %s", (_, v) => {
    expect(isSiwa(v)).toBe(false);
  });
});
