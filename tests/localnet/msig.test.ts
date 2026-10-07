// ARC-55 multisig against a real app on localnet: Lute reads the app's boxes,
// assembles the members' signatures and the result executes on chain.
import { microAlgo } from "@algorandfoundation/algokit-utils";
import type algosdk from "algosdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WalletTransaction } from "@/types";
import {
  balance,
  type Deployed,
  deploy,
  payFrom,
  propose,
  sign,
} from "./arc55";
import { algorand, funded, submit, useLocalNet } from "./helpers";

const posted = vi.hoisted(() => [] as any[]);
// The keys the wallet holds, by address. Stands in for the keystore, which
// signer.test.ts covers; everything else here is the real code. The wallet is
// a locked password wallet: signing needs the password the user typed.
const held = vi.hoisted(() => new Map<string, Uint8Array>());
const PASSWORD = vi.hoisted(() => "pw");

vi.mock("@/utils", async (orig) => ({
  ...(await orig<typeof import("@/utils")>()),
  sendOrPostMessage: (m: any) => posted.push(m),
}));
vi.mock("@/utils/signers", () => ({
  signer: async (
    group: algosdk.Transaction[],
    idxs: number[],
    _authAddrs?: unknown,
    password?: string
  ) => {
    if (password !== PASSWORD) throw Error("Password Required");
    return idxs.map((i) => {
      const sk = held.get(group[i]!.sender.toString());
      if (!sk) throw Error(`No key for ${group[i]!.sender}`);
      return group[i]!.signTxn(sk);
    });
  },
  luteSigner: vi.fn(),
}));
vi.mock("@/router", () => ({ default: { replace: vi.fn() } }));

(globalThis as any).window ??= {};
(globalThis as any).window.close = () => {};

const { default: Msig } = await import("@/services/Msig");
const { default: LuteTxns } = await import("@/classes/LuteTxns");

let store: any;
beforeEach(() => {
  posted.length = 0;
  held.clear();
  store = useLocalNet({ removeMsigAccount: vi.fn() });
});

describe("reading an ARC-55 app", () => {
  it("loads its members and threshold from global state", async () => {
    const d = await deploy();
    expect(await Msig.loadParams(d.appId)).toEqual({
      version: 1,
      threshold: 2,
      addrs: d.mparams.addrs,
    });
  });

  it("decodes stored groups, txns and member signatures from boxes", async () => {
    const d = await deploy();
    const sink = (await funded(0.1)).toString();
    const txns = [
      await payFrom(d.msigAddr, sink, 1),
      await payFrom(d.msigAddr, sink, 2),
    ];
    const nonce = await propose(d, d.members[0]!, txns);
    await sign(d, d.members[1]!, nonce, txns);

    const app = (await Msig.loadApp(d.appId))!;

    expect(app.arc55_threshold).toBe(2n);
    expect(app.arc55_nonce).toBe(nonce);
    expect(app.addrs).toEqual(d.mparams.addrs);
    const grp = app.groups[Number(nonce) - 1]!;
    expect(grp.txns.map((t) => t.txID())).toEqual(txns.map((t) => t.txID()));
    expect(grp.stxns).toEqual([null, null]);
    expect(grp.sigs).toEqual([
      {
        addr: d.members[1]!.toString(),
        sigs: txns.map((t) =>
          t.rawSignTxn(d.members[1]!.account.sk).toBase64()
        ),
      },
    ]);
  });

  it("ignores or forgets an app that no longer exists", async () => {
    const missing = 2n ** 40n;
    expect(await Msig.loadApp(missing, true)).toBeUndefined();
    expect(store.removeMsigAccount).not.toHaveBeenCalled();
    await Msig.loadApp(missing);
    expect(store.removeMsigAccount).toHaveBeenCalledWith(missing);
  });
});

describe("approving a group", () => {
  it("builds a multisig group that executes once the threshold signs", async () => {
    const d = await deploy();
    await algorand.send.payment({
      sender: d.members[0]!,
      receiver: d.msigAddr,
      amount: microAlgo(1_000_000),
    });
    const sink = (await funded(0.1)).toString();
    const txns = [await payFrom(d.msigAddr, sink, 123)];
    const nonce = await propose(d, d.members[0]!, txns);
    await sign(d, d.members[0]!, nonce, txns);
    await sign(d, d.members[2]!, nonce, txns);
    const before = await balance(sink);

    const signed = await Msig.buildGroup(await Msig.loadApp(d.appId), nonce);
    await submit(signed);

    expect((await balance(sink)) - before).toBe(123n);
  });

  it("refuses to submit below the threshold", async () => {
    const d = await deploy();
    await algorand.send.payment({
      sender: d.members[0]!,
      receiver: d.msigAddr,
      amount: microAlgo(1_000_000),
    });
    const txns = [await payFrom(d.msigAddr, d.members[0]!.toString(), 1)];
    const nonce = await propose(d, d.members[0]!, txns);
    await sign(d, d.members[0]!, nonce, txns);

    const signed = await Msig.buildGroup(await Msig.loadApp(d.appId), nonce);
    await expect(submit(signed)).rejects.toThrow();
  });
});

/**
 * A dapp's sign request for a multisig account, through LuteTxns as SignView
 * runs it: the wallet stores the request in the app, waits for the other
 * members, then returns the signed group to the dapp.
 */
async function dappRequest(d: Deployed, request: WalletTransaction[]) {
  const proposer = d.members[0]!;
  held.set(proposer.toString(), proposer.account.sk);
  store.accounts = [{ addr: d.msigAddr, appId: d.appId }];
  // The member this wallet signs for (the store's choice is covered by the
  // store itself; here it is the proposer).
  store.msigSigner = () => proposer.toString();
  const waiting = vi.fn();
  store.setSnackbar = (msg: string) => {
    if (msg.startsWith("Awaiting Multi-Sig")) waiting();
  };

  const lt = new LuteTxns(request);
  expect(await lt.validateNetwork()).toBe(true);
  await lt.validateGroup();
  await lt.msigCheck();
  expect(posted).toEqual([]);
  expect(lt.msig).toMatchObject({
    signerAddr: proposer.toString(),
    bypass: false,
  });
  await lt.addToMsig();
  // SignView's first try, before the prompt: the password is needed.
  expect(await lt.sign()).toBe(false);
  // Then with what was typed into the prompt.
  const signing = lt.sign(PASSWORD);

  // Sign only once the wallet is watching the chain, as other members would.
  await vi.waitFor(() => expect(waiting).toHaveBeenCalled(), {
    timeout: 30_000,
  });
  await new Promise((r) => setTimeout(r, 1000));
  const app = (await Msig.loadApp(d.appId))!;
  const nonce = app.arc55_nonce as bigint;
  const stored = app.groups[Number(nonce) - 1]!.txns;
  await sign(d, d.members[1]!, nonce, stored);
  await sign(d, d.members[2]!, nonce, stored);

  expect(await signing).toBe(true);
  expect(posted).toHaveLength(1);
  expect(posted[0]).toMatchObject({ action: "signed" });
  return posted[0].txns as Uint8Array[];
}

describe("a dapp request for a multisig account", () => {
  it("is stored in the app and returned signed once the members approve", async () => {
    const d = await deploy();
    await algorand.send.payment({
      sender: d.members[0]!,
      receiver: d.msigAddr,
      amount: microAlgo(1_000_000),
    });
    const sink = (await funded(0.1)).toString();
    const txn = await payFrom(d.msigAddr, sink, 456);
    const before = await balance(sink);

    const signed = await dappRequest(d, [{ txn: txn.toByte().toBase64() }]);
    await submit(signed);

    expect((await balance(sink)) - before).toBe(456n);
  });

  it("works for an account rekeyed to the multisig", async () => {
    const d = await deploy();
    const rekeyed = await funded(2);
    await algorand.send.payment({
      sender: rekeyed,
      receiver: rekeyed,
      amount: microAlgo(0),
      rekeyTo: d.msigAddr,
    });
    const sink = (await funded(0.1)).toString();
    const txn = await payFrom(rekeyed.toString(), sink, 789);
    const before = await balance(sink);

    const signed = await dappRequest(d, [{ txn: txn.toByte().toBase64() }]);
    await submit(signed);

    expect((await balance(sink)) - before).toBe(789n);
  });
});

describe("an in-app request for a multisig account", () => {
  it("is stored in the app and hands back without waiting for members", async () => {
    const d = await deploy();
    const proposer = d.members[0]!;
    held.set(proposer.toString(), proposer.account.sk);
    store.accounts = [{ addr: d.msigAddr, appId: d.appId }];
    store.msigSigner = () => proposer.toString();
    store.setSnackbar = vi.fn();
    const sink = (await funded(0.1)).toString();
    const txn = await payFrom(d.msigAddr, sink, 1);
    const replies: any[] = [];
    (globalThis as any).window.dispatchEvent = (e: any) =>
      replies.push(e.detail);

    const lt = new LuteTxns([{ txn: txn.toByte().toBase64() }]);
    store.luteTxns = lt;
    expect(await lt.validateNetwork()).toBe(true);
    expect(await lt.prepare()).toBe(true);
    await lt.addToMsig();
    expect(await lt.sign(PASSWORD)).toBe(true);

    expect(posted).toEqual([]);
    expect(replies).toEqual([
      expect.objectContaining({ action: "stored", nonce: 1n }),
    ]);
    expect(store.luteTxns).toBeUndefined();
    const app = (await Msig.loadApp(d.appId))!;
    expect(app.groups[0]!.txns.map((t) => t.txID())).toEqual([txn.txID()]);
    expect(app.groups[0]!.sigs).toEqual([]);
  });
});
