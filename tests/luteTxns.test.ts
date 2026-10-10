// ARC-1 sign requests through LuteTxns: what it refuses before anything is
// signed. The signer itself is stubbed; it is covered by signer.test.ts.
import algosdk from "algosdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WalletTransaction } from "@/types";

const posted = vi.hoisted(() => [] as any[]);
const signer = vi.hoisted(() => vi.fn());

vi.mock("@/utils", async (orig) => ({
  ...(await orig<typeof import("@/utils")>()),
  sendOrPostMessage: (m: any) => posted.push(m),
}));
vi.mock("@/utils/signers", () => ({ signer }));
vi.mock("@/router", () => ({ default: {} }));

(globalThis as any).window ??= {};
(globalThis as any).window.close = () => {};

const { default: LuteTxns } = await import("@/classes/LuteTxns");
// The stub models only what the keystore tests read; LuteTxns reads more.
const testStore = (await import("./stubs/store")).testStore as any;

const LOCAL_HASH = new Uint8Array(32).fill(1);
const TEST_HASH = new Uint8Array(32).fill(2);
const alice = algosdk.generateAccount().addr.toString();
const bob = algosdk.generateAccount().addr.toString();

function pay(opts: {
  sender?: string;
  amount?: number;
  genesisID?: string;
  genesisHash?: Uint8Array;
} = {}) {
  return algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: opts.sender ?? alice,
    receiver: bob,
    amount: opts.amount ?? 1,
    suggestedParams: {
      fee: 1000n,
      minFee: 1000n,
      firstValid: 1n,
      lastValid: 1000n,
      genesisID: opts.genesisID ?? "localnet-v1",
      genesisHash: opts.genesisHash ?? LOCAL_HASH,
      flatFee: true,
    },
  });
}

const wtxn = (t: algosdk.Transaction, extra: Partial<WalletTransaction> = {}) =>
  ({ txn: t.toByte().toBase64(), ...extra }) as WalletTransaction;

function grouped(...txns: algosdk.Transaction[]) {
  return algosdk.assignGroupID(txns);
}

beforeEach(() => {
  posted.length = 0;
  signer.mockReset();
  // One stand-in signature per index signed.
  signer.mockImplementation(async (_dtxns, idxs: number[]) =>
    idxs.map((i) => new Uint8Array([i]))
  );
  Object.assign(testStore, {
    isWeb: false,
    debug: false,
    luteTxns: undefined,
    networkName: "MainNet",
    refresh: 0,
    accounts: [],
    device: { transport: undefined },
    allNetworks: [
      { name: "LocalNet", genesisID: "localnet-v1", genesisHash: LOCAL_HASH.toBase64() },
      { name: "TestNet", genesisID: "testnet-v1.0", genesisHash: TEST_HASH.toBase64() },
      { name: "Dockernet", genesisID: "dockernet-v1" },
    ],
  });
});

/** A request that passed both validators, as SignView leaves it. */
async function validated(txns: WalletTransaction[]) {
  const lt = new LuteTxns(txns, 1);
  expect(await lt.validateNetwork()).toBe(true);
  await lt.validateGroup();
  expect(posted).toEqual([]);
  return lt;
}

const lastError = () => posted.at(-1);

describe("validateNetwork", () => {
  it("selects the request's network", async () => {
    const lt = new LuteTxns([wtxn(pay({ genesisID: "testnet-v1.0", genesisHash: TEST_HASH }))]);
    expect(await lt.validateNetwork()).toBe(true);
    expect(testStore.networkName).toBe("TestNet");
  });

  it("maps sandnet to the dockernet entry", async () => {
    const lt = new LuteTxns([wtxn(pay({ genesisID: "sandnet-v1" }))]);
    expect(await lt.validateNetwork()).toBe(true);
    expect(testStore.networkName).toBe("Dockernet");
  });

  it.each([
    [
      "Mixed Networks",
      [pay(), pay({ genesisID: "testnet-v1.0", genesisHash: TEST_HASH })],
    ],
    ["Mixed Networks", [pay(), pay({ genesisHash: TEST_HASH })]],
    ["Unknown Network", [pay({ genesisID: "mainnet-v1.0" })]],
    ["Unknown Network", [pay({ genesisHash: TEST_HASH })]],
  ])("refuses %s", async (message, txns) => {
    const lt = new LuteTxns(txns.map((t) => wtxn(t)));
    expect(await lt.validateNetwork()).toBe(false);
    expect(lastError()).toMatchObject({ action: "error", code: 4300, message });
  });

  it("keeps the in-app signer on the network the app is on", async () => {
    const lt = new LuteTxns([wtxn(pay())]);
    testStore.luteTxns = lt as any;
    const events: any[] = [];
    (globalThis as any).window.dispatchEvent = (e: any) => events.push(e.detail);
    (globalThis as any).CustomEvent ??= class {
      constructor(public type: string, public init: any) {}
      get detail() {
        return this.init.detail;
      }
    };
    expect(await lt.validateNetwork()).toBe(false);
    expect(events[0]).toMatchObject({ action: "error", message: "Network Mismatch" });
    expect(testStore.networkName).toBe("MainNet");
  });
});

describe("validateGroup", () => {
  it("accepts a single ungrouped txn and a correctly grouped pair", async () => {
    const one = new LuteTxns([wtxn(pay())]);
    await one.validateGroup();
    expect(one.groupValid).toBe(true);
    expect(one.groupWarn).toBe(false);

    const pair = new LuteTxns(grouped(pay(), pay({ amount: 2 })).map((t) => wtxn(t)));
    await pair.validateGroup();
    expect(pair.groupValid).toBe(true);
    expect(pair.groupWarn).toBe(false);
    expect(posted).toEqual([]);
  });

  it("refuses a group id that does not cover the txns sent", async () => {
    // Grouped with a third txn the request leaves out.
    const [a, b] = grouped(pay(), pay({ amount: 2 }), pay({ amount: 3 }));
    const lt = new LuteTxns([wtxn(a!), wtxn(b!)]);
    await lt.validateGroup();
    expect(lt.groupValid).toBe(false);
    expect(lastError()).toMatchObject({ code: 4300, message: "Invalid Group" });
  });

  it("refuses a txn whose contents changed after grouping", async () => {
    const [a, b] = grouped(pay(), pay({ amount: 2 }));
    const swapped = pay({ amount: 999 });
    swapped.group = b!.group;
    const lt = new LuteTxns([wtxn(a!), wtxn(swapped)]);
    await lt.validateGroup();
    expect(lastError()).toMatchObject({ message: "Invalid Group" });
  });

  it("warns about more than one group in a request", async () => {
    const g1 = grouped(pay(), pay({ amount: 2 }));
    const g2 = grouped(pay({ amount: 3 }), pay({ amount: 4 }));
    const lt = new LuteTxns([...g1, ...g2].map((t) => wtxn(t)));
    await lt.validateGroup();
    expect(lt.groupValid).toBe(true);
    expect(lt.groupWarn).toBe(true);
  });

  it("refuses an empty or oversized request", async () => {
    const empty = new LuteTxns([]);
    await empty.validateGroup();
    expect(lastError()).toMatchObject({ code: 4300, message: "Empty Transaction Array" });

    const t = wtxn(pay());
    const big = new LuteTxns(Array(513).fill(t));
    await big.validateGroup();
    expect(lastError()).toMatchObject({ code: 4201, message: "Too Many Transactions" });
  });
});

describe("sign", () => {
  it("signs what the request asks for and passes the rest through", async () => {
    const [a, b, c] = grouped(pay(), pay({ amount: 2 }), pay({ amount: 3 }));
    const presigned = algosdk.signTransaction(b!, algosdk.generateAccount().sk).blob;
    const lt = await validated([
      wtxn(a!),
      wtxn(b!, { signers: [], stxn: presigned.toBase64() }),
      wtxn(c!, { signers: [] }),
    ]);

    expect(await lt.sign("pw")).toBe(true);

    expect(signer).toHaveBeenCalledOnce();
    const [, idxs, authAddrs, pass] = signer.mock.calls[0]!;
    expect(idxs).toEqual([0]);
    expect(authAddrs).toEqual([undefined, undefined, undefined]);
    expect(pass).toBe("pw");
    const msg = posted[0];
    expect(msg.action).toBe("signed");
    expect(msg.txns[1]).toBe(presigned.toBase64());
    expect(msg.txns[2]).toBeNull();
    expect(typeof msg.txns[0]).toBe("string");
  });

  it("returns bytes, not base64, to the web app", async () => {
    testStore.isWeb = true;
    const lt = await validated([wtxn(pay())]);
    await lt.sign();
    expect(posted[0].txns[0]).toBeInstanceOf(Uint8Array);
  });

  it.each([
    [
      "Signed Transaction Mismatch",
      () => {
        const other = algosdk.signTransaction(pay({ amount: 7 }), algosdk.generateAccount().sk);
        return [wtxn(pay(), { signers: [], stxn: other.blob.toBase64() })];
      },
    ],
    [
      "Transaction already signed",
      () => {
        const t = pay();
        const st = algosdk.signTransaction(t, algosdk.generateAccount().sk);
        return [wtxn(t, { stxn: st.blob.toBase64() })];
      },
    ],
    ["Signer/From Mismatch", () => [wtxn(pay(), { signers: [bob] })]],
    [
      "Signer/AuthAddr Mismatch",
      () => [wtxn(pay(), { signers: [alice], authAddr: bob })],
    ],
    ["Msig missing", () => [wtxn(pay(), { signers: [alice, bob] })]],
  ])("refuses: %s", async (message, build) => {
    const lt = await validated(build());
    await lt.sign();
    expect(signer).not.toHaveBeenCalled();
    expect(lastError()).toMatchObject({ action: "error", code: 4300, message });
  });

  it("refuses multisig requests", async () => {
    const lt = await validated([
      wtxn(pay(), { msig: { version: 1, threshold: 1, addrs: [alice] } }),
    ]);
    await lt.sign();
    expect(signer).not.toHaveBeenCalled();
    expect(lastError()).toMatchObject({ code: 4200 });
  });

  it("names the auth address the request gives", async () => {
    const lt = await validated([wtxn(pay(), { signers: [bob], authAddr: bob })]);
    await lt.sign();
    expect(signer.mock.calls[0]![2]).toEqual([bob]);
  });

  describe("after a failed check", () => {
    it("does not sign a request whose group failed validation", async () => {
      const [a, b] = grouped(pay(), pay({ amount: 2 }), pay({ amount: 3 }));
      const lt = new LuteTxns([wtxn(a!), wtxn(b!)], 1);
      await lt.validateNetwork();
      await lt.validateGroup();
      expect(posted).toHaveLength(1);
      await lt.sign();
      expect(signer).not.toHaveBeenCalled();
      // One answer to the dapp, not a second error.
      expect(posted).toHaveLength(1);
    });

    it("does not sign a request on an unknown network", async () => {
      const lt = new LuteTxns([wtxn(pay({ genesisID: "mainnet-v1.0" }))], 1);
      await lt.validateNetwork();
      await lt.validateGroup();
      await lt.sign();
      expect(signer).not.toHaveBeenCalled();
      expect(posted).toHaveLength(1);
    });

    it("does not sign a request that was never validated", async () => {
      const lt = new LuteTxns([wtxn(pay())], 1);
      await lt.sign();
      expect(signer).not.toHaveBeenCalled();
      expect(lastError()).toMatchObject({ message: "Invalid Request" });
    });

    it("does not sign twice", async () => {
      const lt = await validated([wtxn(pay())]);
      await lt.sign();
      await lt.sign();
      expect(signer).toHaveBeenCalledOnce();
      expect(posted).toHaveLength(1);
    });
  });
});

describe("msigCheck", () => {
  it("accepts a request with nothing to sign", async () => {
    const t = pay();
    const st = algosdk.signTransaction(t, algosdk.generateAccount().sk);
    const lt = await validated([wtxn(t, { signers: [], stxn: st.blob.toBase64() })]);
    await lt.msigCheck();
    expect(posted).toEqual([]);
    expect(lt.msig).toBeUndefined();
  });

  it("leaves rekeyed requests alone", async () => {
    const lt = await validated([wtxn(pay(), { authAddr: bob })]);
    await lt.msigCheck();
    expect(lt.msig).toBeUndefined();
    expect(posted).toEqual([]);
  });
});

describe("prepare", () => {
  it("is ready once the network and group pass", async () => {
    // A wallet account, so msigCheck needs no algod lookup.
    testStore.accounts = [{ addr: alice }];
    const lt = new LuteTxns([wtxn(pay())], 1);
    await lt.validateNetwork();
    expect(await lt.prepare()).toBe(true);
    expect(posted).toEqual([]);
  });

  it("does nothing more after the network failed", async () => {
    const lt = new LuteTxns([wtxn(pay({ genesisID: "mainnet-v1.0" }))], 1);
    await lt.validateNetwork();
    expect(await lt.prepare()).toBe(false);
    // Only the network error: the group was never checked.
    expect(posted).toHaveLength(1);
    expect(lt.groupValid).toBe(false);
  });

  it("is not ready when the group fails", async () => {
    const [a, b] = grouped(pay(), pay({ amount: 2 }), pay({ amount: 3 }));
    const lt = new LuteTxns([wtxn(a!), wtxn(b!)], 1);
    await lt.validateNetwork();
    expect(await lt.prepare()).toBe(false);
    expect(lastError()).toMatchObject({ message: "Invalid Group" });
  });

  it("is not ready before the network was checked", async () => {
    const lt = new LuteTxns([wtxn(pay())], 1);
    expect(await lt.prepare()).toBe(false);
  });
});
