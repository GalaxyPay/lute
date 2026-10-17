// Swap groups are written by the router's API; the wallet checks what the
// user signs before the sign dialog opens.
import algosdk from "algosdk";
import { describe, expect, it } from "vitest";
import {
  MAX_SWAP_FEE,
  minReceived,
  spendable,
  SWAP_FEE_RESERVE,
  userIndexes,
  validateSwapGroup,
} from "@/utils/swap";

const user = algosdk.generateAccount().addr.toString();
const pool = algosdk.generateAccount().addr.toString();
const thief = algosdk.generateAccount().addr.toString();
const genesisHash = new Uint8Array(32).fill(1);

const sp = (fee = 1000n, hash = genesisHash) => ({
  fee,
  minFee: 1000n,
  firstValid: 1n,
  lastValid: 1000n,
  genesisID: "mainnet-v1.0",
  genesisHash: hash,
  flatFee: true,
});

const pay = (extra: Record<string, unknown> = {}, fee?: bigint) =>
  algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: user,
    receiver: pool,
    amount: 1_000_000,
    suggestedParams: sp(fee),
    ...extra,
  });
const call = (onComplete = algosdk.OnApplicationComplete.NoOpOC) =>
  algosdk.makeApplicationCallTxnFromObject({
    sender: user,
    appIndex: 42,
    onComplete,
    suggestedParams: sp(),
  });
const optIn = (assetIndex = 31566704) =>
  algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    sender: user,
    receiver: user,
    assetIndex,
    amount: 0,
    suggestedParams: sp(),
  });
const send = (assetIndex: number, amount: number) =>
  algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    sender: user,
    receiver: pool,
    assetIndex,
    amount,
    suggestedParams: sp(),
  });
// Router escrow txn, signed by its lsig, not the user.
const routerTxn = () =>
  algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    sender: pool,
    receiver: user,
    assetIndex: 31566704,
    amount: 5,
    suggestedParams: sp(),
  });

const expect0 = { address: user, fromASAID: 0n, amount: 1_000_000n, genesisHash };
const check = (group: algosdk.Transaction[], exp = expect0) =>
  validateSwapGroup(group, userIndexes(group, user), exp);

describe("validateSwapGroup", () => {
  it("accepts opt-ins, app calls and the input payment", () => {
    expect(() => check([optIn(), call(algosdk.OnApplicationComplete.OptInOC), pay(), call(), routerTxn()])).not.toThrow();
  });

  it("signs exactly the user's txns", () => {
    const group = [pay(), routerTxn()];
    expect(() => validateSwapGroup(group, [0, 1], expect0)).toThrow("signers");
    expect(() => validateSwapGroup(group, [], expect0)).toThrow("signers");
  });

  it("rejects rekey, close and clawback", () => {
    expect(() => check([pay({ rekeyTo: thief })])).toThrow("rekey");
    expect(() => check([pay({ closeRemainderTo: thief })])).toThrow("close");
    const claw = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: user,
      receiver: thief,
      assetSender: pool,
      assetIndex: 7,
      amount: 1,
      suggestedParams: sp(),
    });
    expect(() => check([claw], { ...expect0, fromASAID: 7n })).toThrow("clawback");
  });

  it("allows the router fee on top of the input and a small ALGO top-up", () => {
    const withFee = { ...expect0, feeBps: 15 };
    expect(() => check([pay({ amount: 1_001_500 }), pay({ amount: 100_000 })], withFee)).not.toThrow();
    const asa = { ...withFee, fromASAID: 7n, amount: 10_000n };
    expect(() => check([send(7, 10_015), pay({ amount: 100_000 })], asa)).not.toThrow();
  });

  it("rejects moving more than the input, router fee and cost budget", () => {
    // ALGO input: anything past the fee comes out of the same budget as fees.
    expect(() => check([pay({ amount: 1_000_000 + Number(MAX_SWAP_FEE) })])).toThrow("fee");
    expect(() => check([pay(), pay({ amount: Number(MAX_SWAP_FEE) })])).toThrow("fee");
    // ASA input: the asset itself is capped, ALGO goes to the budget.
    const asa = { ...expect0, fromASAID: 7n, amount: 10_000n, feeBps: 15 };
    expect(() => check([send(7, 10_016)], asa)).toThrow("amount");
    expect(() => check([send(7, 10_000), pay({ amount: Number(MAX_SWAP_FEE) })], asa)).toThrow("fee");
    expect(() => check([pay(), send(99, 1)])).toThrow("transfer");
  });

  it("rejects app updates, deletes and other txn types", () => {
    expect(() => check([call(algosdk.OnApplicationComplete.DeleteApplicationOC)])).toThrow("app call");
    expect(() => check([call(algosdk.OnApplicationComplete.UpdateApplicationOC)])).toThrow("app call");
    const keyreg = algosdk.makeKeyRegistrationTxnWithSuggestedParamsFromObject({
      sender: user,
      suggestedParams: sp(),
    });
    expect(() => check([keyreg])).toThrow("keyreg");
  });

  it("rejects excessive fees and other networks", () => {
    expect(() => check([pay({}, MAX_SWAP_FEE + 1n)])).toThrow("fee");
    const foreign = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: user,
      receiver: pool,
      amount: 1,
      suggestedParams: sp(1000n, new Uint8Array(32).fill(2)),
    });
    expect(() => check([foreign])).toThrow("Network Mismatch");
  });
});

describe("swap amounts", () => {
  it("minReceived applies slippage in basis points", () => {
    expect(minReceived(1_000_000n, 1)).toBe(990_000n);
    expect(minReceived(1_000_000n, 0.5)).toBe(995_000n);
    expect(minReceived(3n, 1)).toBe(2n);
  });

  it("spendable keeps ALGO's min balance, reserve and fee headroom", () => {
    const info = {
      amount: 2_000_000n,
      minBalance: 200_000n,
      assets: [{ assetId: 7n, amount: 55n }],
    };
    expect(spendable(info, 0n)).toBe(1_800_000n - SWAP_FEE_RESERVE);
    expect(spendable(info, 0n, 100_000n)).toBe(1_700_000n - SWAP_FEE_RESERVE);
    expect(spendable(info, 7n)).toBe(55n);
    expect(spendable(info, 8n)).toBe(0n);
    expect(spendable({ amount: 1n, minBalance: 100_000n }, 0n)).toBe(0n);
  });
});
