// HD signing keeps transactions and data apart: a txn signature needs the
// "TX" tag, data is signed exactly as given.
import HdWallet from "@/services/HdWallet";
import {
  fromSeed,
  KeyContext,
  XHDWalletAPI,
} from "@algorandfoundation/xhd-wallet-api";
import { Address, makePaymentTxnWithSuggestedParamsFromObject } from "algosdk";
import { describe, expect, it } from "vitest";

// Any 64 bytes will do as a BIP39 seed here.
const seed = () => new Uint8Array(64).fill(7);

async function publicKey() {
  return await new XHDWalletAPI().keyGen(
    fromSeed(seed()),
    KeyContext.Address,
    0,
    0
  );
}

async function verify(pk: Uint8Array, sig: Uint8Array, msg: Uint8Array) {
  // Copies, as WebCrypto's types want ArrayBuffer-backed views.
  const key = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(pk),
    "Ed25519",
    false,
    ["verify"]
  );
  return await crypto.subtle.verify(
    "Ed25519",
    key,
    new Uint8Array(sig),
    new Uint8Array(msg)
  );
}

function txn(pk: Uint8Array) {
  const sender = new Address(pk);
  return makePaymentTxnWithSuggestedParamsFromObject({
    sender,
    receiver: sender,
    amount: 0,
    suggestedParams: {
      fee: 1000n,
      minFee: 1000n,
      firstValid: 1n,
      lastValid: 1000n,
      genesisID: "localnet-v1",
      genesisHash: new Uint8Array(32).fill(1),
      flatFee: true,
    },
  });
}

describe("HdWallet", () => {
  it("signs a txn's bytesToSign with the account's key", async () => {
    const pk = await publicKey();
    const t = txn(pk);
    const sig = await HdWallet.signTxn(seed(), 0, t.bytesToSign());
    expect(await verify(pk, sig, t.bytesToSign())).toBe(true);
  });

  it("refuses a txn without its TX tag", async () => {
    const t = txn(await publicKey());
    await expect(HdWallet.signTxn(seed(), 0, t.toByte())).rejects.toThrow();
  });

  it("signs data exactly as given", async () => {
    const pk = await publicKey();
    const data = new TextEncoder().encode("hello");
    const sig = await HdWallet.sign(seed(), 0, data);
    expect(await verify(pk, sig, data)).toBe(true);
  });

  it("zeroes the seed it is given", async () => {
    const s = seed();
    await HdWallet.signTxn(s, 0, txn(await publicKey()).bytesToSign());
    expect(s.every((b) => b === 0)).toBe(true);
  });
});
