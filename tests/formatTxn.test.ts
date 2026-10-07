// The review screen is what the user approves: anything that moves funds or
// control away from the signer must show up in it.
import algosdk from "algosdk";
import { describe, expect, it } from "vitest";
import { formatTxn } from "@/utils/formatTxn";

const [me, them, thief] = [0, 1, 2].map(() => algosdk.generateAccount().addr);
const short = (a: algosdk.Address) =>
  `${a.toString().slice(0, 6)}...${a.toString().slice(52)}`;
const suggestedParams = {
  fee: 2000n,
  minFee: 1000n,
  firstValid: 1n,
  lastValid: 10n,
  genesisID: "localnet-v1",
  genesisHash: new Uint8Array(32),
  flatFee: true,
};
const asset = { index: 7n, params: { unitName: "TOK", decimals: 2 } } as any;

describe("formatTxn", () => {
  it("summarises a payment", () => {
    const t = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: me!,
      receiver: them!,
      amount: 1_500_000,
      note: new TextEncoder().encode("hi"),
      suggestedParams,
    });
    expect(formatTxn(t, undefined, "Algo")).toMatchObject({
      type: "Payment",
      from: short(me!),
      to: short(them!),
      amount: (1.5).toLocaleString(),
      fee: "0.002 Algo",
      note: "hi",
      rekeyTo: undefined,
      closeRemainderTo: "",
      clawbackFrom: "",
    });
  });

  it("shows a rekey and a close", () => {
    const t = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: me!,
      receiver: them!,
      amount: 0,
      rekeyTo: thief!,
      closeRemainderTo: thief!,
      suggestedParams,
    });
    const f = formatTxn(t, undefined, "Algo");
    expect(f.rekeyTo).toBe(thief!.toString());
    expect(f.closeRemainderTo).toBe(short(thief!));
  });

  it("shows whose asset a clawback takes", () => {
    const t = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: me!,
      receiver: them!,
      assetSender: thief!,
      assetIndex: 7,
      amount: 150,
      suggestedParams,
    });
    expect(formatTxn(t, asset, "Algo")).toMatchObject({
      type: "Asset Transfer",
      clawbackFrom: short(thief!),
      asset: "TOK",
      amount: (1.5).toLocaleString(),
    });
  });

  it("shows an asset close", () => {
    const t = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: me!,
      receiver: them!,
      closeRemainderTo: thief!,
      assetIndex: 7,
      amount: 0,
      suggestedParams,
    });
    expect(formatTxn(t, asset, "Voi").closeRemainderTo).toBe(short(thief!));
  });

  it("names every txn type", () => {
    const freeze = algosdk.makeAssetFreezeTxnWithSuggestedParamsFromObject({
      sender: me!,
      freezeTarget: them!,
      assetIndex: 7,
      frozen: true,
      suggestedParams,
    });
    expect(formatTxn(freeze, undefined, "Algo").type).toBe("Asset Freeze");
    const call = algosdk.makeApplicationNoOpTxnFromObject({
      sender: me!,
      appIndex: 5,
      suggestedParams,
    });
    expect(formatTxn(call, undefined, "Algo")).toMatchObject({
      type: "Application",
      appId: 5n,
    });
  });
});
