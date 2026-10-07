import { bigintToString, formatAddr } from "@/utils";
import type { modelsv2, Transaction } from "algosdk";

const TXN_TYPES: Record<string, string> = {
  pay: "Payment",
  axfer: "Asset Transfer",
  afrz: "Asset Freeze",
  acfg: "Asset Config",
  keyreg: "Key Registration",
  appl: "Application",
  stpf: "State Proof",
  hb: "Heartbeat",
};

/**
 * What the review screen shows for a txn. Everything that moves funds or
 * control away from the signer (rekey, close, clawback) must appear here.
 */
export function formatTxn(
  txn: Transaction,
  asset: modelsv2.Asset | undefined,
  unit: string
) {
  return {
    type: TXN_TYPES[txn.type] ?? txn.type,
    from: formatAddr(txn.sender.toString()),
    to: formatAddr(
      txn.payment?.receiver.toString() ||
        txn.assetTransfer?.receiver.toString()
    ),
    // A clawback moves the asset out of this account, not the sender's.
    clawbackFrom: formatAddr(txn.assetTransfer?.assetSender?.toString()),
    appId: txn.applicationCall?.appIndex,
    asset: asset?.params?.unitName,
    amount:
      txn.payment || txn.assetTransfer
        ? bigintToString(
            txn.payment?.amount || txn.assetTransfer?.amount || 0n,
            asset?.params?.decimals ?? 6
          )
        : undefined,
    fee: Number(txn.fee || 0) / 10 ** 6 + ` ${unit}`,
    voteFirst: txn.keyreg?.voteFirst,
    voteLast: txn.keyreg?.voteLast,
    voteKeyDilution: txn.keyreg?.voteKeyDilution,
    selectionKey: txn.keyreg?.selectionKey?.toBase64(),
    voteKey: txn.keyreg?.voteKey?.toBase64(),
    stateProofKey: txn.keyreg?.stateProofKey?.toBase64(),
    rekeyTo: txn.rekeyTo?.toString(),
    closeRemainderTo: formatAddr(
      txn.payment?.closeRemainderTo?.toString() ||
        txn.assetTransfer?.closeRemainderTo?.toString()
    ),
    note: new TextDecoder().decode(txn.note),
  };
}
