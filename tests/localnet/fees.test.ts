// Fee pricing against algod's own simulate: what the wallet sets must be what
// the network accepts.
import { microAlgo } from "@algorandfoundation/algokit-utils";
import algosdk from "algosdk";
import { beforeEach, describe, expect, it } from "vitest";
import { priceTxns, probeFee, simulateFees } from "@/utils/simulateFees";
import { algorand, funded, submit, useLocalNet } from "./helpers";

beforeEach(() => {
  useLocalNet();
});

const minFee = async () =>
  (await algorand.client.algod.getTransactionParams().do()).minFee;

async function pay(sender: string, receiver: string, fee = 0) {
  const txn = await algorand.createTransaction.payment({
    sender,
    receiver,
    amount: microAlgo(1),
    staticFee: microAlgo(fee),
  });
  return txn;
}

describe("fee pricing", () => {
  it("prices a plain ed25519 txn at the min fee", async () => {
    const a = await funded(1);
    expect(await probeFee({ addr: a.toString() })).toBe(await minFee());
  });

  it("prices a Falcon signature above an ed25519 one", async () => {
    const a = await funded(1);
    const ed = await probeFee({ addr: a.toString() });
    const falcon = await probeFee({ addr: a.toString(), isFalcon25: true });
    expect(falcon).toBeGreaterThan(ed);
  });

  it("lets one txn pay for its group, and the group executes", async () => {
    const a = await funded(1);
    const b = await funded(1);
    const txns = [
      await pay(a.toString(), b.toString()),
      await pay(b.toString(), a.toString()),
    ];

    // Only a's txn may be raised; b's stays at zero.
    await priceTxns(txns, {}, [0]);

    expect(txns[0]!.fee).toBe(2n * (await minFee()));
    expect(txns[1]!.fee).toBe(0n);
    expect(txns[0]!.group).toEqual(txns[1]!.group);
    expect(algosdk.computeGroupID(txns.map(ungrouped))).toEqual(
      txns[0]!.group
    );
    await submit([
      txns[0]!.signTxn(a.account.sk),
      txns[1]!.signTxn(b.account.sk),
    ]);
  });

  it("leaves a txn that already pays enough alone", async () => {
    const a = await funded(1);
    const txn = await pay(a.toString(), a.toString(), 5000);
    await priceTxns([txn], {});
    expect(txn.fee).toBe(5000n);
  });

  it("refuses when the caps cannot cover the group", async () => {
    const a = await funded(1);
    const txn = await pay(a.toString(), a.toString());
    // algod refuses to simulate a group short on fees, so this surfaces as
    // its error before simulateFees' own cap check.
    await expect(simulateFees([{ txn, maxFee: 10n }])).rejects.toThrow(
      /Simulate failed: .*fees is less than/
    );
  });

  it("reports what algod rejects", async () => {
    const a = await funded(1);
    const overspend = await algorand.createTransaction.payment({
      sender: a,
      receiver: a,
      amount: microAlgo(100_000_000),
    });
    await expect(priceTxns([overspend], {})).rejects.toThrow(
      "Simulate failed"
    );
  });
});

function ungrouped(t: algosdk.Transaction) {
  const c = algosdk.decodeUnsignedTransaction(t.toByte());
  c.group = undefined;
  return c;
}
