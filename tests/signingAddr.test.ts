import algosdk from "algosdk";
import { describe, expect, it } from "vitest";
import { signingAddr } from "@/utils/signingAddr";

const [sender, dappAuth, chainAuth, member] = [0, 1, 2, 3].map(() =>
  algosdk.generateAccount().addr
);
const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
  sender: sender!,
  receiver: sender!,
  amount: 0,
  suggestedParams: {
    fee: 1000n,
    minFee: 1000n,
    firstValid: 1n,
    lastValid: 10n,
    genesisID: "localnet-v1",
    genesisHash: new Uint8Array(32),
    flatFee: true,
  },
});
// The store keeps addresses as strings in some places and Address in others.
const info = [{ address: sender!.toString(), authAddr: chainAuth }];
const msig = { signerAddr: member!.toString() };

describe("signingAddr", () => {
  it("prefers the multisig member, then the dapp, then the chain, then the sender", () => {
    expect(signingAddr(txn, dappAuth!.toString(), msig, info)).toBe(
      member!.toString()
    );
    expect(signingAddr(txn, dappAuth!.toString(), undefined, info)).toBe(
      dappAuth!.toString()
    );
    expect(signingAddr(txn, undefined, undefined, info)).toBe(
      chainAuth!.toString()
    );
    expect(signingAddr(txn, undefined, undefined, [])).toBe(sender!.toString());
  });

  it("ignores on-chain data for other accounts", () => {
    const other = [{ address: dappAuth!.toString(), authAddr: chainAuth }];
    expect(signingAddr(txn, undefined, undefined, other)).toBe(
      sender!.toString()
    );
  });

  it("returns a string whatever form the address came in", () => {
    const asAddress = { signerAddr: member };
    expect(signingAddr(txn, undefined, asAddress, [])).toBe(member!.toString());
  });
});
