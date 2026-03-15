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
