// Swap links come from another person; the taker signs txn2.
import algosdk from "algosdk";
import { describe, expect, it } from "vitest";
import { parseSwap, validateSwap } from "@/utils/swap";

const maker = algosdk.generateAccount();
const taker = algosdk.generateAccount().addr;
const thief = algosdk.generateAccount().addr;

const params = (genesisHash = new Uint8Array(32).fill(1)) => ({
  fee: 1000n,
  minFee: 1000n,
  firstValid: 1n,
  lastValid: 1000n,
  genesisID: "localnet-v1",
  genesisHash,
  flatFee: true,
});

const offer = () =>
  algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: maker.addr,
    receiver: taker,
    amount: 5,
    suggestedParams: params(),
  });

const ask = (extra: Record<string, unknown> = {}) =>
  algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    sender: taker,
    receiver: maker.addr,
    assetIndex: 7,
    amount: 1,
    suggestedParams: params(),
    ...extra,
  });

/** A link the way Swap.vue builds it. */
function link(txn1: algosdk.Transaction, txn2: algosdk.Transaction) {
  const b64url = (b: Uint8Array) => b.toBase64({ alphabet: "base64url" });
  return {
    tx1: b64url(algosdk.signTransaction(txn1, maker.sk).blob),
    tx2: b64url(txn2.toByte()),
  };
}

function grouped(...txns: algosdk.Transaction[]) {
  return algosdk.assignGroupID(txns);
}

describe("swap links", () => {
  it("accepts the swap Swap.vue builds", () => {
    const [t1, t2] = grouped(offer(), ask());
    const { tx1, tx2 } = link(t1!, t2!);
    const { txn1, txn2 } = parseSwap(tx1, tx2);
    expect(txn1.txID()).toBe(t1!.txID());
    expect(txn2.txID()).toBe(t2!.txID());
  });

  it.each([
    ["close the taker's account", { closeRemainderTo: thief }, "close"],
    ["rekey the taker's account", { rekeyTo: thief }, "rekey"],
  ])("refuses a txn2 that would %s", (_what, extra, msg) => {
    const [t1, t2] = grouped(offer(), ask(extra));
    expect(() => validateSwap(t1!, t2!)).toThrow(msg);
  });

  it("refuses a clawback as txn2", () => {
    const [t1, t2] = grouped(offer(), ask({ assetSender: thief }));
    expect(() => validateSwap(t1!, t2!)).toThrow("clawback");
  });

  it("refuses a close on the taker's Algo payment", () => {
    const pay = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: taker,
      receiver: maker.addr,
      amount: 1,
      closeRemainderTo: thief,
      suggestedParams: params(),
    });
    const [t1, t2] = grouped(offer(), pay);
    expect(() => validateSwap(t1!, t2!)).toThrow("close");
  });

  it("refuses a group that holds a third, hidden txn", () => {
    const hidden = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: maker.addr,
      receiver: maker.addr,
      amount: 0,
      suggestedParams: params(),
    });
    const [t1, t2] = grouped(offer(), ask(), hidden);
    expect(() => validateSwap(t1!, t2!)).toThrow("Invalid Group");
  });

  it("refuses txns from different groups or none", () => {
    const [a1] = grouped(offer(), ask());
    const [, b2] = grouped(offer(), ask({ amount: 2 }));
    expect(() => validateSwap(a1!, b2!)).toThrow("Invalid Group");
    expect(() => validateSwap(offer(), ask())).toThrow("Invalid Group");
  });

  it("refuses a swap that does not pay each side", () => {
    const [t1, t2] = grouped(offer(), ask({ receiver: thief }));
    expect(() => validateSwap(t1!, t2!)).toThrow("Invalid Swap");
  });

  it("refuses anything but payments and asset transfers", () => {
    const optIn = algosdk.makeApplicationOptInTxnFromObject({
      sender: taker,
      appIndex: 1,
      suggestedParams: params(),
    });
    const [t1, t2] = grouped(offer(), optIn);
    expect(() => validateSwap(t1!, t2!)).toThrow("Invalid Swap");
  });

  it("refuses txns for different networks", () => {
    const other = ask({ suggestedParams: params(new Uint8Array(32).fill(2)) });
    const [t1, t2] = grouped(offer(), other);
    expect(() => validateSwap(t1!, t2!)).toThrow("Network Mismatch");
  });
});
