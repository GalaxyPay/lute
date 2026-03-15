import { msigAbiContract } from "@/data";
import Algo from "@/services/Algo";
import Falcon from "@/services/Falcon";
import Msig from "@/services/Msig";
import type { Base64, LuteMsig, WalletTransaction } from "@/types";
import { decodeField, send, sendOrPostMessage } from "@/utils";
import { signer } from "@/utils/signers";
import algosdk from "algosdk";

const INVALID = { cause: 4300 };

export default class LuteTxns {
  txns: WalletTransaction[];
  dtxns: algosdk.Transaction[];
  store = useAppStore();
  msig?: LuteMsig;
  falcon?: { count: number; adjusted?: boolean };
  atc = new algosdk.AtomicTransactionComposer();
  nonce?: bigint;
  groupWarn: boolean = false;
  tabId?: number;
  constructor(txns: WalletTransaction[], tabId?: number) {
    this.txns = txns;
    this.dtxns = this.decode();
    this.tabId = tabId;
  }

  private decode() {
    return this.txns.map((t) =>
      algosdk.decodeUnsignedTransaction(Buffer.from(t.txn, "base64"))
    );
  }

  private sendAndClose(message: any) {
    if (this.store.luteTxns) {
      window.dispatchEvent(
        new CustomEvent("modal-signer", { detail: message })
      );
      this.store.luteTxns = undefined;
    } else {
      if (message.action === "signed" && this.falcon?.adjusted) {
        this.handleFalcon(message);
        return;
      }
      sendOrPostMessage(message, this.tabId);
      window.close();
    }
  }

  private async handleFalcon(message: any) {
    try {
      // submit to chain and return error to app
      this.store.overlay = true;
      this.store.setSnackbar("Processing...", "info", -1);
      const txns = this.store.isWeb
        ? message.txns
        : message.txns.map((txn: string) => Buffer.from(txn, "base64"));
      await send(txns);
      const errMessage = {
        action: "error",
        code: 4000,
        message: "Transaction(s) sent by wallet",
        debug: this.store.debug,
      };
      this.sendAndClose(errMessage);
    } catch (err: any) {
      this.handleError(err);
    }
  }

  async handleError(err: any) {
    const message = {
      action: "error",
      code: err.cause,
      message: err.message,
      debug: this.store.debug,
    };
    this.sendAndClose(message);
  }

  async validateNetwork() {
    try {
      const firstHash: Base64 = decodeField(
        this.dtxns[0]!.genesisHash!,
        "base64"
      );
      const sameNetwork = this.dtxns.filter(
        (t) =>
          decodeField(t.genesisHash!, "base64") === firstHash &&
          t.genesisID === this.dtxns[0]?.genesisID
      ).length;
      if (this.txns.length !== sameNetwork)
        throw Error("Mixed Networks", INVALID);
      const network = this.store.allNetworks.find(
        (n) =>
          n.genesisID ===
            (this.dtxns[0]?.genesisID === "sandnet-v1"
              ? "dockernet-v1"
              : this.dtxns[0]?.genesisID) &&
          (n.genesisHash === firstHash || !n.genesisHash)
      )?.name;
      if (!network) throw Error("Unknown Network", INVALID);
      this.store.networkName = network;
      this.store.refresh++;
    } catch (err: any) {
      this.handleError(err);
    }
  }

  async validateGroup() {
    try {
      if (!this.txns.length) throw Error("Empty Transaction Array", INVALID);
      if (this.txns.length > 512)
        throw Error("Too Many Transactions", { cause: 4201 });
      const gidMap = this.dtxns.map((t) =>
        t.group ? decodeField(t.group, "base64") : ""
      );
      if (this.txns.length > 1 || gidMap[0]) {
        const cleanTxns = this.decode().map((t) => {
          delete t.group;
          return t;
        });
        // break txns into groups
        const groups: any[] = [];
        let tempGroup: algosdk.Transaction[] = [];
        gidMap.forEach((gid, idx) => {
          tempGroup.push(cleanTxns[idx]!);
          if (idx + 1 === gidMap.length || !gid || gid !== gidMap[idx + 1]) {
            groups.push({ gid, txns: tempGroup });
            tempGroup = [];
          }
        });
        if (groups.length > 1 || gidMap.filter((gid) => !gid).length > 1) {
          this.groupWarn = true;
        }
        // validate groupIDs
        groups.forEach((grp) => {
          if (grp.gid) {
            const groupID = decodeField(
              algosdk.computeGroupID(grp.txns),
              "base64"
            );
            if (groupID !== grp.gid) throw Error("Invalid Group", INVALID);
          }
        });
      }
    } catch (err: any) {
      this.handleError(err);
    }
  }

  private toSign(ix: number): boolean {
    return !this.txns[ix]?.signers || !!this.txns[ix]?.signers?.length;
  }

  async msigCheck() {
    try {
      const hasAuthAddr = this.txns.filter((t) => !!t.authAddr).length;
      if (hasAuthAddr) return;
      const toBeSigned = this.dtxns.filter((_txn, idx) => this.toSign(idx));
      const firstSender = toBeSigned[0]!.sender.toString();
      const sameSender = toBeSigned.filter(
        (t) => t.sender.toString() === firstSender
      ).length;
      if (toBeSigned.length === sameSender) {
        let acct = this.store.accounts.find((a) => a.addr === firstSender);
        if (!acct) {
          const acctInfo = await Algo.algod
            .accountInformation(firstSender)
            .do();
          if (acctInfo.authAddr) {
            acct = this.store.accounts.find(
              (a) => a.addr === acctInfo.authAddr!.toString()
            );
          }
        }
        if (acct?.falcon) {
          this.falcon = { count: sameSender };
        } else if (acct?.appId) {
          const app = await Msig.loadApp(acct.appId);
          if (!app) throw Error("Invalid Application");
          const signerAddr = this.store.msigSigner(app);
          // If signer voting power meets threshold, bypass
          this.msig = {
            app,
            signerAddr,
            bypass:
              app.addrs.filter((a) => a === signerAddr).length >=
              app.arc55_threshold,
          };
        }
      }
    } catch (err: any) {
      this.handleError(err);
    }
  }

  async addToMsig() {
    try {
      if (!this.msig) throw Error("Invalid Multi-Sig");
      let method = msigAbiContract.methods.find(
        (m) => m.name === "arc55_newTransactionGroup"
      );
      if (!method) throw Error("Method Not Found");
      const suggestedParams = await Algo.algod.getTransactionParams().do();
      const appID = this.msig.app.info.id;
      const sender = this.msig.signerAddr;
      if (!sender) throw Error("Invalid Sender");
      this.atc.addMethodCall({
        appID,
        method,
        sender,
        suggestedParams,
        signer,
      });
      this.nonce = this.msig.app.arc55_nonce + 1n;

      this.dtxns.forEach((dtxn, idx) => {
        if (!this.atc) throw Error("Invalid ATC");
        if (!this.nonce) throw Error("Invalid Nonce");
        if (!this.msig) throw Error("Invalid Multi-Sig");

        let txn: Uint8Array;
        if (this.txns[idx]?.stxn && !this.toSign(idx)) {
          txn = Buffer.from(this.txns[idx].stxn, "base64");
        } else {
          txn = dtxn.toByte();
        }
        const mbrIncrease =
          (!idx && !this.msig.app.acct.amount ? 100000 : 0) +
          2500 +
          400 * (9 + txn.length);
        const mbrPayment = {
          txn: algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            sender: sender,
            suggestedParams,
            receiver: this.msig.app.acct.address,
            amount: mbrIncrease,
          }),
          signer,
        };
        const boxName = Buffer.allocUnsafe(9);
        boxName.writeBigInt64BE(this.nonce);
        boxName.writeInt8(idx, 8);
        const br: algosdk.BoxReference = {
          appIndex: 0,
          name: new Uint8Array(boxName),
        };
        method = msigAbiContract.methods.find(
          (m) => m.name === "arc55_addTransaction"
        );
        if (!method) throw Error("Method Not Found");
        this.atc.addMethodCall({
          appID,
          method,
          methodArgs: [mbrPayment, this.nonce, idx, txn],
          sender,
          suggestedParams,
          boxes: [br],
          signer,
        });
      });
      this.atc.buildGroup();
    } catch (err: any) {
      this.handleError(err);
    }
  }

  async addDummyTxns() {
    if (!this.falcon) throw Error("Invalid Falcon Transaction");
    const dummyCount = this.falcon.count * 2 + 1;
    const sp = await Algo.algod.getTransactionParams().do();
    let j = 0;
    // remove groups and adjust fees
    const newTxns = this.decode().map((t, i) => {
      delete t.group;
      if (this.toSign(i)) {
        t.fee += sp.minFee * (j === 0 ? 3n : 2n);
        j++;
      }
      return t;
    });
    // add dummy txns, calc group, add dummy lsigs
    const { dummyLsig, dummyTxns } = await Falcon.getDummy(sp, dummyCount);
    newTxns.push(...dummyTxns);
    algosdk.assignGroupID(newTxns);

    // alter txns and dtxns
    newTxns.map((t, i) => {
      if (i < this.txns.length) {
        this.txns[i]!.txn = Buffer.from(t.toByte()).toString("base64");
      } else {
        const wt: WalletTransaction = {
          txn: Buffer.from(t.toByte()).toString("base64"),
          signers: [],
          stxn: Buffer.from(
            algosdk.signLogicSigTransactionObject(t, dummyLsig).blob
          ).toString("base64"),
        };
        this.txns.push(wt);
      }
    });
    this.dtxns = this.decode();
    this.falcon.adjusted = true;
  }

  private async listenForSigs() {
    if (!this.nonce) throw Error("Invalid Nonce");
    if (!this.msig) throw Error("Invalid Multi-Sig");
    this.store.setSnackbar("Awaiting Multi-Sig Signatures...", "info", -1);
    const appId = this.msig.app.info.id;
    let app = await Msig.loadApp(appId);
    if (!app) throw Error("Invalid App");
    const status = await Algo.algod.status().do();
    let round = status.lastRound;
    let tracking = true;

    while (tracking) {
      try {
        const status = await Algo.algod.statusAfterBlock(round).do();
        round = status.lastRound;
        const { block } = await Algo.algod.block(round).do();
        if (block.payset) {
          await Promise.all(
            block.payset.map(async (txn) => {
              if (
                txn.signedTxn.signedTxn.txn.applicationCall?.appIndex === appId
              ) {
                app = await Msig.loadApp(appId);
                if (!app) throw Error("Invalid App");
              }
            })
          );
        }
        if (
          app.addrs.filter((a) =>
            app!.groups[Number(this.nonce) - 1]?.sigs.some((s) => s.addr === a)
          ).length >= app.arc55_threshold
        ) {
          tracking = false;
          const signedTxns = await Msig.buildGroup(app, this.nonce);
          const signedTxns64 = signedTxns.map((txn) =>
            Buffer.from(txn).toString("base64")
          );
          const message = {
            action: "signed",
            txns: this.store.isWeb ? signedTxns : signedTxns64,
            debug: this.store.debug,
          };
          this.sendAndClose(message);
        }
      } catch (err) {
        tracking = false;
        throw err;
      }
    }
  }

  async sign(password?: string) {
    try {
      if (this.atc.getStatus()) {
        await this.atc.gatherSignatures();
        this.store.setSnackbar("Processing...", "info", -1);
        await this.atc.execute(Algo.algod, 10);
        await this.listenForSigs();
      } else {
        const signedTxns: (Uint8Array | null)[] = [];
        const indexesToSign: number[] = [];
        for (const [idx, txn] of this.txns.entries()) {
          // msig
          if (txn.msig) throw Error("Msig not supported", { cause: 4200 });
          // stxn
          if (txn.stxn && this.toSign(idx))
            throw Error("Transaction already signed", INVALID);
          const sender = this.dtxns[idx]?.sender.toString();
          // signers
          if (txn.signers) {
            if (!txn.signers.length) {
              if (txn.stxn) {
                const dstxn = algosdk.decodeSignedTransaction(
                  Buffer.from(txn.stxn, "base64")
                );
                if (
                  txn.txn === Buffer.from(dstxn.txn.toByte()).toString("base64")
                ) {
                  signedTxns[idx] = Buffer.from(txn.stxn, "base64");
                  continue;
                } else throw Error("Signed Transaction Mismatch", INVALID);
              } else {
                signedTxns[idx] = null;
                continue;
              }
            } else if (txn.signers.length === 1) {
              if (txn.authAddr) {
                if (txn.signers[0] !== txn.authAddr)
                  throw Error("Signer/AuthAddr Mismatch", INVALID);
              } else {
                if (txn.signers[0] !== sender)
                  throw Error("Signer/From Mismatch", INVALID);
              }
            } else if (txn.signers.length > 1) {
              if (!txn.msig) throw Error("Msig missing", INVALID);
            }
          }
          indexesToSign.push(idx);
        }
        const signerResponse = await signer(
          this.dtxns,
          indexesToSign,
          this.txns.map((txn) => txn.authAddr),
          password,
          this.msig
        );
        signerResponse.forEach((arr, ix) => {
          signedTxns[indexesToSign[ix]!] = arr;
        });
        const signedTxns64 = signedTxns.map((txn) =>
          txn ? Buffer.from(txn).toString("base64") : null
        );
        const message = {
          action: "signed",
          txns: this.store.isWeb ? signedTxns : signedTxns64,
          debug: this.store.debug,
        };
        this.sendAndClose(message);
      }
    } catch (err: any) {
      const t = this.store.device.transport;
      if (t) {
        const devices = await navigator[t].getDevices();
        const openDevices = devices.filter((d: any) => d.opened);
        if (openDevices.length) await openDevices[0]?.close();
      }
      if (["Locked", "open"].some((x) => err.message.includes(x))) {
        this.store.setSnackbar(err.message, "error");
      } else {
        this.handleError(err);
      }
    }
  }
}
