import { bytesEqual } from "@/utils/keys";
import algosdk, { type Transaction } from "algosdk";

/**
 * A peer-to-peer swap link: `tx1` is the offer, signed by its maker; `tx2` is
 * what the taker is asked to sign. The link comes from another person, so
 * everything the taker signs is checked here before it is shown.
 */
export function parseSwap(tx1: string, tx2: string) {
  const stxn1 = Uint8Array.fromBase64(tx1, { alphabet: "base64url" });
  const txn1 = algosdk.decodeSignedTransaction(stxn1).txn;
  const txn2 = algosdk.decodeUnsignedTransaction(
    Uint8Array.fromBase64(tx2, { alphabet: "base64url" })
  );
  validateSwap(txn1, txn2);
  return { stxn1, txn1, txn2 };
}

/** Throws unless the two txns are exactly a plain two-way swap. */
export function validateSwap(txn1: Transaction, txn2: Transaction) {
  // The group must be these two txns and nothing else.
  if (!txn1.group || !txn2.group) throw Error("Invalid Group");
  const strip = (t: Transaction) => {
    const c = algosdk.decodeUnsignedTransaction(t.toByte());
    c.group = undefined;
    return c;
  };
  const gid = algosdk.computeGroupID([strip(txn1), strip(txn2)]);
  if (!bytesEqual(gid, txn1.group) || !bytesEqual(gid, txn2.group))
    throw Error("Invalid Group");

  for (const t of [txn1, txn2]) {
    if (t.type !== "pay" && t.type !== "axfer") throw Error("Invalid Swap");
    if (t.rekeyTo) throw Error("Invalid Swap: rekey");
    if (t.payment?.closeRemainderTo || t.assetTransfer?.closeRemainderTo)
      throw Error("Invalid Swap: close");
    if (t.assetTransfer?.assetSender) throw Error("Invalid Swap: clawback");
  }

  const receiver1 = txn1.payment?.receiver ?? txn1.assetTransfer?.receiver;
  const receiver2 = txn2.payment?.receiver ?? txn2.assetTransfer?.receiver;
  if (
    !receiver1 ||
    !receiver2 ||
    txn1.sender.toString() !== receiver2.toString() ||
    txn2.sender.toString() !== receiver1.toString()
  )
    throw Error("Invalid Swap");

  if (!txn1.genesisHash || !txn2.genesisHash)
    throw Error("Missing Genesis Hash");
  if (
    !bytesEqual(txn1.genesisHash, txn2.genesisHash) ||
    txn1.genesisID !== txn2.genesisID
  )
    throw Error("Network Mismatch");
}

