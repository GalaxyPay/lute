// The Send form's Max button for ALGO: the amount it fills in, sent the way
// Xfer.vue's submit sends it, must execute and leave the sender at exactly
// its min balance, for every kind of signer and min balance.
import { microAlgo } from "@algorandfoundation/algokit-utils";
import algosdk from "algosdk";
import { beforeEach, describe, expect, it } from "vitest";
import {
  bigintToString,
  maxAlgoSend,
  priceTxns,
  stringToBigint,
} from "@/utils";
import {
  algorand,
  type Auth,
  ed25519,
  falcon,
  funded,
  multisig,
  submit,
  useLocalNet,
} from "./helpers";

beforeEach(() => {
  useLocalNet();
});

const algod = algorand.client.algod;

async function fund(addr: string, micro: bigint) {
  await algorand.send.payment({
    sender: await algorand.account.localNetDispenser(),
    receiver: addr,
    amount: microAlgo(micro),
  });
}

/** Sign and submit a plain payment from `auth`'s account. */
async function payFrom(
  auth: Auth,
  fields: { receiver: string; amount?: bigint; rekeyTo?: string },
  sender = auth.addr
) {
  const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender,
    amount: 0,
    suggestedParams: await algod.getTransactionParams().do(),
    ...fields,
  });
  await priceTxns([txn], { addr: sender, isFalcon25: auth.isFalcon25 });
  await submit([await auth.sign(txn)]);
}

async function rekey(from: Auth, to: Auth) {
  await payFrom(from, { receiver: from.addr, rekeyTo: to.addr });
}

/** A new ASA, created by the dispenser, that `holder` opts into. */
async function optIn(holder: Auth, amount = 0n, sender = holder.addr) {
  const dispenser = await algorand.account.localNetDispenser();
  const { assetId } = await algorand.send.assetCreate({
    sender: dispenser,
    total: 1_000_000n,
    decimals: 0,
    // Distinct, or two creates in one round are the same txn.
    note: crypto.getRandomValues(new Uint8Array(8)),
  });
  const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    sender,
    receiver: sender,
    assetIndex: assetId,
    amount: 0,
    suggestedParams: await algod.getTransactionParams().do(),
  });
  await priceTxns([txn], { addr: sender, isFalcon25: holder.isFalcon25 });
  await submit([await holder.sign(txn)]);
  if (amount)
    await algorand.send.assetTransfer({
      sender: dispenser,
      receiver: sender,
      assetId,
      amount,
    });
  return assetId;
}

/**
 * Press Max for `sender`, signed for by `auth`, then send that amount as
 * Xfer.vue does: through the form's string field, priced, signed, submitted.
 */
async function sendMax(auth: Auth, sender = auth.addr) {
  const info = await algod.accountInformation(sender).do();
  // The wallet row for a rekeyed account takes the auth account's flags.
  const acct = { addr: sender, isFalcon25: auth.isFalcon25 ?? false, info };
  const field = bigintToString(await maxAlgoSend(acct), 6, true);
  const amount = stringToBigint(field, 6);
  expect(amount).toBeGreaterThan(0n);

  const sink = (await funded(0.1)).toString();
  const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender,
    receiver: sink,
    amount,
    suggestedParams: await algod.getTransactionParams().do(),
  });
  await priceTxns([txn], acct);
  await submit([await auth.sign(txn)]);

  const after = await algod.accountInformation(sender).do();
  expect(after.amount).toBe(after.minBalance);
  return { amount, fee: txn.fee };
}

describe("Max ALGO send", () => {
  describe("by signer", () => {
    it("ed25519", async () => {
      const a = ed25519(await funded(5));
      await sendMax(a);
    });

    it("Falcon-1024", async () => {
      const f = falcon();
      await fund(f.addr, 5_000_000n);
      const { fee } = await sendMax(f);
      expect(fee).toBeGreaterThan(1000n);
    });

    it("native multisig", async () => {
      const m = multisig();
      await fund(m.addr, 5_000_000n);
      await sendMax(m);
    });
  });

  describe("with a raised min balance", () => {
    it("holding an ASA", async () => {
      const a = ed25519(await funded(5));
      await optIn(a, 10n);
      await sendMax(a);
    });

    it("opted into an ASA with none of it", async () => {
      const a = ed25519(await funded(5));
      await optIn(a);
      await sendMax(a);
    });

    it("holding several ASAs", async () => {
      const a = ed25519(await funded(5));
      for (const amt of [1n, 0n, 5n]) await optIn(a, amt);
      await sendMax(a);
    });

    it("having created an ASA", async () => {
      const acct = await funded(5);
      await algorand.send.assetCreate({ sender: acct, total: 10n });
      await sendMax(ed25519(acct));
    });

    it("having created an app with state", async () => {
      const acct = await funded(5);
      const prog = "#pragma version 10\nint 1";
      await algorand.send.appCreate({
        sender: acct,
        approvalProgram: prog,
        clearStateProgram: prog,
        schema: {
          globalInts: 2,
          globalByteSlices: 2,
          localInts: 0,
          localByteSlices: 0,
        },
      });
      await sendMax(ed25519(acct));
    });

    it("Falcon-1024 holding an ASA", async () => {
      const f = falcon();
      await fund(f.addr, 5_000_000n);
      await optIn(f, 3n);
      await sendMax(f);
    });
  });

  describe("rekeyed", () => {
    it("ed25519 to ed25519", async () => {
      const a = ed25519(await funded(5));
      const b = ed25519(await funded(1));
      await rekey(a, b);
      await sendMax(b, a.addr);
    });

    it("ed25519 to Falcon-1024", async () => {
      const a = ed25519(await funded(5));
      const f = falcon();
      await fund(f.addr, 1_000_000n);
      await rekey(a, f);
      const { fee } = await sendMax(f, a.addr);
      expect(fee).toBeGreaterThan(1000n);
    });

    it("Falcon-1024 to ed25519", async () => {
      const f = falcon();
      await fund(f.addr, 5_000_000n);
      const b = ed25519(await funded(1));
      await rekey(f, b);
      await sendMax(b, f.addr);
    });

    it("ed25519 to multisig", async () => {
      const a = ed25519(await funded(5));
      const m = multisig();
      await rekey(a, m);
      await sendMax(m, a.addr);
    });

    it("ed25519 to ed25519, holding an ASA", async () => {
      const a = ed25519(await funded(5));
      await optIn(a, 7n);
      const b = ed25519(await funded(1));
      await rekey(a, b);
      await sendMax(b, a.addr);
    });

    it("ed25519 to Falcon-1024, holding an ASA", async () => {
      const a = ed25519(await funded(5));
      await optIn(a, 7n);
      const f = falcon();
      await fund(f.addr, 1_000_000n);
      await rekey(a, f);
      await sendMax(f, a.addr);
    });
  });

  describe("balances", () => {
    it("sends a balance with odd microAlgos", async () => {
      const a = ed25519(await funded(0.1));
      await fund(a.addr, 1_234_567n);
      await sendMax(a);
    });

    it("sends a large balance", async () => {
      const a = ed25519(await funded(250_000));
      await sendMax(a);
    });

    it("offers zero when the fee eats the spendable balance", async () => {
      const a = ed25519(await funded(0.1));
      await fund(a.addr, 500n);
      const info = await algod.accountInformation(a.addr).do();
      expect(await maxAlgoSend({ info })).toBe(0n);
    });
  });
});
