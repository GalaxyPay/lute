import { MsigAppFactory } from "@/clients/MsigApp.client";
import router from "@/router";
import Algo from "@/services/Algo";
import type { Arc55App, MsigGroup } from "@/types";
import { send } from "@/utils";
import { luteSigner } from "@/utils/signers";
import { AlgorandClient } from "@algorandfoundation/algokit-utils";
import algosdk from "algosdk";

const Msig = {
  async loadApp(appId: bigint, ignore404: boolean = false) {
    try {
      const appInfo = await Algo.algod.getApplicationByID(appId).do();
      const appAddr = algosdk.getApplicationAddress(appId);
      const acct = await Algo.algod.accountInformation(appAddr).do();
      const app: Arc55App = {
        info: appInfo,
        acct: acct,
        addrs: [],
        groups: [],
      };
      const gs = appInfo.params.globalState;
      const addrs: string[] = [];
      gs?.forEach((s) => {
        const k = s.key;
        if (k.length === 8) {
          addrs[algosdk.decodeUint64(k, "safe")] = algosdk.encodeAddress(
            s.value.bytes
          );
        } else {
          const key = Buffer.from(k).toString();
          if (key === "arc55_admin")
            app[key] = algosdk.encodeAddress(s.value.bytes);
          else if (key.startsWith("arc55_")) {
            app[key] = s.value.type == 1 ? s.value.bytes : s.value.uint;
          }
        }
      });
      app.addrs = addrs;

      const groups: MsigGroup[] = Array(Number(app.arc55_nonce))
        .fill(null)
        .map((_x, i) => ({
          nonce: BigInt(i + 1),
          txns: [],
          stxns: [],
          sigs: [],
        }));
      const { boxes } = await Algo.algod.getApplicationBoxes(appId).do();
      await Promise.all(
        boxes.map(async (box) => {
          const boxInfo = await Algo.algod
            .getApplicationBoxByName(appId, box.name)
            .do();
          if (box.name.length === 9) {
            const nonce = Number(Buffer.from(box.name).readBigInt64BE());
            const idx = Buffer.from(box.name).readUInt8(8);

            const test: any = algosdk.decodeObj(boxInfo.value);
            let txn: algosdk.Transaction;
            let stxn: string | null;
            if (test.txn) {
              stxn = Buffer.from(boxInfo.value).toString("base64");
              txn = algosdk.decodeSignedTransaction(boxInfo.value).txn;
            } else {
              stxn = null;
              txn = algosdk.decodeUnsignedTransaction(boxInfo.value);
            }

            groups[nonce - 1]!.txns[idx] = txn;
            groups[nonce - 1]!.stxns[idx] = stxn;
          } else if (box.name.length === 40) {
            const nonce = Buffer.from(box.name).readInt32BE(4);
            const addr = algosdk.encodeAddress(box.name.slice(8));
            const sigs: string[] = [];

            const abiType = algosdk.ABIType.from("byte[64][]");
            const abiData = abiType.decode(boxInfo.value) as Uint8Array[];
            abiData.forEach((sig) =>
              sigs.push(Buffer.from(sig).toString("base64"))
            );
            groups[nonce - 1]!.sigs.push({
              addr,
              sigs,
            });
          }
        })
      );
      app.groups = groups;
      return app;
    } catch (err: any) {
      if (err.status == 404) {
        if (ignore404) return;
        else {
          const store = useAppStore();
          await store.removeMsigAccount(appId);
        }
      } else {
        throw err;
      }
    }
  },

  async buildGroup(app: Arc55App | undefined, nonce: bigint) {
    const store = useAppStore();
    try {
      if (!app) throw Error("Invalid App");
      const grp = app.groups[Number(nonce) - 1];
      if (!grp) throw Error("Invalid Group");
      const mparams = {
        version: 1,
        threshold: Number(app.arc55_threshold),
        addrs: app.addrs,
      };

      const txns = grp.txns.map((txn, idx) =>
        grp.stxns[idx]
          ? Buffer.from(grp.stxns[idx]!, "base64")
          : algosdk.createMultisigTransaction(txn, mparams)
      );
      const txnsSigs = txns.map((txn, idx) =>
        grp.stxns[idx]
          ? [txn]
          : grp.sigs.map(
              (s) =>
                algosdk.appendSignRawMultisigSignature(
                  txn,
                  mparams,
                  s.addr,
                  Buffer.from(s.sigs[idx]!, "base64")
                ).blob
            )
      );
      const signedTxns = txnsSigs.map((arr: Uint8Array[]) => {
        return arr.length > 1
          ? algosdk.mergeMultisigTransactions(arr)
          : arr[0]!;
      });
      return signedTxns;
    } catch (err: any) {
      console.error(err);
      store.setSnackbar(err.message, "error");
      return [];
    }
  },

  async submitGroup(app: Arc55App | undefined, nonce: bigint) {
    const store = useAppStore();
    try {
      const signedTxns = await this.buildGroup(app, nonce);
      await send(signedTxns, "Transaction Group Approved");
    } catch (err: any) {
      console.error(err);
      store.setSnackbar(err.message, "error");
    }
  },

  getAppClient(appID: bigint, addr: string) {
    const algorand = AlgorandClient.fromClients({ algod: Algo.algod });
    algorand.setDefaultSigner(luteSigner);
    algorand.setDefaultValidityWindow(1000);
    const factory = new MsigAppFactory({
      defaultSender: addr,
      algorand,
    });
    return factory.getAppClientById({ appId: BigInt(appID) });
  },

  async clearSigs(appID: bigint, nonce: bigint, addr: string) {
    const store = useAppStore();
    try {
      const suggestedParams = await Algo.algod.getTransactionParams().do();
      const appClient = this.getAppClient(appID, addr);
      const fee = Number(suggestedParams.minFee * 2n).microAlgos();
      await appClient.send.arc55ClearSignatures({
        args: { transactionGroup: nonce, address: addr },
        staticFee: fee,
        populateAppCallResources: true,
      });
      store.setSnackbar("Signature(s) Removed", "success");
    } catch (err: any) {
      console.error(err);
      store.setSnackbar(err.message, "error");
    }
    store.overlay = false;
  },

  async deleteGroup(appID: bigint, grp: MsigGroup, addr: string) {
    const store = useAppStore();
    try {
      const suggestedParams = await Algo.algod.getTransactionParams().do();
      const appClient = this.getAppClient(appID, addr);
      const composer = appClient.newGroup();
      const fee = Number(suggestedParams.minFee * 2n).microAlgos();
      grp.sigs.forEach((s) => {
        composer.arc55ClearSignatures({
          args: {
            transactionGroup: grp.nonce,
            address: s.addr,
          },
          staticFee: fee,
        });
      });
      grp.txns.forEach((_t: algosdk.Transaction, idx: number) => {
        composer.arc55RemoveTransaction({
          args: { transactionGroup: grp.nonce, index: idx },
          staticFee: fee,
        });
      });
      await composer.send({ populateAppCallResources: true });
      store.setSnackbar("Group Removed", "success");
    } catch (err: any) {
      console.error(err);
      store.setSnackbar(err.message, "error");
    }
    store.overlay = false;
  },

  async destroyApp(app: Arc55App | undefined, addr: string) {
    const store = useAppStore();
    try {
      if (!app) throw Error("Invalid App");
      if (app.groups.filter((g) => g.txns.length || g.sigs.length).length) {
        alert("You will need to delete all groups first.");
        return;
      }
      const suggestedParams = await Algo.algod.getTransactionParams().do();
      const appClient = this.getAppClient(app.info.id, addr);
      const fee = Number(suggestedParams.minFee * 2n).microAlgos();
      await appClient.send.delete.destroy({ args: {}, staticFee: fee });
      store.setSnackbar("Multi-Sig Destroyed", "success");
      router.replace("/");
    } catch (err: any) {
      console.error(err);
      store.setSnackbar(err.message, "error");
    }
    store.overlay = false;
  },
};

export default Msig;
