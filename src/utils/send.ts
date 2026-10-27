import Algo from "@/services/Algo";
import algosdk from "algosdk";

export async function send(
  signedTxn: Uint8Array | Uint8Array[],
  success: string = "Success"
) {
  const store = useAppStore();
  try {
    const { txid } = await Algo.algod.sendRawTransaction(signedTxn).do();
    const res = await algosdk.waitForConfirmation(Algo.algod, txid, 10);
    store.refresh++;
    store.setSnackbar(success, "success");
    store.overlay = false;
    return res;
  } catch (err) {
    store.overlay = false;
    throw err;
  }
}

/** A Falcon-1024 signature costs this many min fees; ed25519 costs one. */
const FALCON_FEES = 3n;

/**
 * Most microAlgos `acct` can send in one plain payment: its balance less its
 * min balance and the fee for its signature type.
 */
export async function maxAlgoSend(acct: {
  isFalcon25?: boolean;
  info?: { amount: bigint; minBalance: bigint };
}) {
  const { minFee } = await Algo.algod.getTransactionParams().do();
  const fee = acct.isFalcon25 ? minFee * FALCON_FEES : minFee;
  const max = (acct.info?.amount ?? 0n) - (acct.info?.minBalance ?? 0n) - fee;
  return max > 0n ? max : 0n;
}
