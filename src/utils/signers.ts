import LuteTxns from "@/classes/LuteTxns";
import { get } from "@/dbLute";
import Falcon25 from "@/services/Falcon25";
import HdWallet from "@/services/HdWallet";
import Seed from "@/services/Seed";
import type { LuteMsig, WalletTransaction } from "@/types";
import { selectDevice } from "@/utils";
import TransportWebHID from "@ledgerhq/hw-transport-webhid";
import TransportWebUSB from "@ledgerhq/hw-transport-webusb";
import { sha512_256 } from "@noble/hashes/sha2.js";
import algosdk, {
  Address,
  SignedTransaction,
  signTransactionWithSigner,
  Transaction,
  type Falcon1024SigningKey,
  type TransactionSigner,
} from "algosdk";
import { generateKey, signCompressed } from "falcon-1024";
import { AlgorandApp } from "ledger-algorand-js";

class SignTxnsError extends Error {
  code: number;
  data?: any;

  constructor(message: string, code: number, data?: any) {
    super(message);
    this.name = "SignTxnsError";
    this.code = code;
    this.data = data;
  }
}

export async function signer(
  txnGroup: Transaction[],
  indexesToSign?: number[],
  authAddrs?: (string | undefined)[],
  password?: string,
  msig?: LuteMsig
) {
  let transport;
  let algoApp;
  try {
    const store = useAppStore();
    const signedTxns: Uint8Array[] = [];
    const seeds: Uint8Array[] = [];
    // const falcon25Seeds: { addr: string; seed: Uint8Array }[] = [];
    const falcon25Signers: {
      address: Address;
      txnSigner: TransactionSigner;
    }[] = [];
    for (const [idx, txn] of txnGroup.entries()) {
      if (!indexesToSign || indexesToSign.includes(idx)) {
        const sender = txn.sender.toString();
        const addr =
          msig?.signerAddr ||
          authAddrs?.[idx] ||
          store.info.find((i) => i.address === sender)?.authAddr?.toString() ||
          sender;
        const acct = store.acctInfo.find((a) => a.addr === addr);
        if (!acct) throw Error("Account Not Found");
        let sig: Uint8Array;
        if (acct.seedId && acct.slot != null) {
          if (!seeds[acct.seedId]) {
            const seedData = store.seeds.find((s) => s.id === acct.seedId);
            if (!seedData) throw Error("Invalid Seed");
            if (seedData.credentialId) {
              seeds[acct.seedId] = (
                await Seed.getPasskeySeed(seedData.credentialId)
              ).seed;
            } else {
              if (!password) throw Error("Password Required");
              seeds[acct.seedId] = await Seed.decryptSeed(password, seedData);
            }
          }
          sig = await HdWallet.sign(
            Buffer.from(seeds[acct.seedId]!),
            acct.slot,
            txn.bytesToSign(),
            acct.info?.addrIdx
          );
        } else if (acct.isFalcon25) {
          if (
            !falcon25Signers.find((s) => s.address.toString() === acct.addr)
          ) {
            const kv = store.falcon25Seeds.find((kv) => kv.key === acct.addr);
            const seedData = kv?.value;
            if (!seedData) throw Error("Invalid Seed");
            if (!password) throw Error("Password Required");
            const seed = await Seed.decryptSeed(password, seedData);
            const { publicKey, privateKey } = generateKey(seed);
            const falconSigningKey: Falcon1024SigningKey = {
              falcon1024PublicKey: publicKey,
              falcon1024Signer: async (bytesToSign: Uint8Array) =>
                signCompressed(privateKey, bytesToSign),
            };
            const { address, txnSigner } =
              algosdk.addressWithSignersFromRawFalcon1024Signer(
                falconSigningKey
              );
            falcon25Signers.push({ address, txnSigner });
          }
          const { txnSigner } = falcon25Signers.find(
            (s) => s.address.toString() === acct.addr
          )!;
          const stxn = await signTransactionWithSigner(txn, txnSigner);
          signedTxns.push(stxn.blob);
          continue;
        } else if (acct.slot != null) {
          if (!transport) {
            await store.getDevices();
            const t = store.device.transport;
            if (!t) throw Error("This browser does not support Ledger");
            const hidOrUsb = t === "hid" ? TransportWebHID : TransportWebUSB;
            const firstDevice = store.device.list[0] as HIDDevice & USBDevice;
            if (firstDevice && !store.ledgerSelect) {
              transport = await hidOrUsb.open(firstDevice);
            } else {
              store.device.showSelector = true;
              const device = await selectDevice();
              store.device.showSelector = false;
              transport = await hidOrUsb.open(device);
            }
          }
          if (!algoApp) algoApp = new AlgorandApp(transport);
          sig = await ledgerSign(txn, algoApp, acct.slot);
        } else {
          sig = await hotSign(addr, txn.bytesToSign());
        }
        let signedTxn: Uint8Array;
        if (msig?.bypass) {
          signedTxn = attachMsigSig(msig, txn, sig);
        } else {
          signedTxn = txn.attachSignature(addr, sig);
        }
        signedTxns.push(signedTxn);
      }
    }
    seeds.forEach((s) => s.fill(0));
    await transport?.close();
    return signedTxns;
  } catch (err) {
    await transport?.close();
    throw err;
  }
}

function attachMsigSig(msig: LuteMsig, txn: Transaction, sig: Uint8Array) {
  const mparams = {
    version: 1,
    threshold: Number(msig.app.arc55_threshold),
    addrs: msig.app.addrs,
  };
  const msigTxn = algosdk.createMultisigTransaction(txn, mparams);
  return algosdk.appendSignRawMultisigSignature(
    msigTxn,
    mparams,
    msig.signerAddr,
    sig
  ).blob;
}

export async function hotSign(addr: string, bytes: Uint8Array) {
  const privateKey: CryptoKey | undefined = await get("keys", addr);
  if (!privateKey) throw Error("Account Not Found", { cause: 4300 });
  const sig = await crypto.subtle.sign(
    { name: "Ed25519" },
    privateKey,
    Buffer.from(bytes)
  );
  return new Uint8Array(sig);
}

async function ledgerSign(
  txn: Transaction,
  algoApp: AlgorandApp,
  slot: number
) {
  const store = useAppStore();
  store.setSnackbar("Review on Ledger...", "info", -1);
  let signature: Buffer;
  try {
    ({ signature } = await algoApp.sign(slot, Buffer.from(txn.toByte())));
  } catch (err: any) {
    if (err.message.includes("rejected")) {
      throw Error("User Rejected Request", { cause: 4001 });
    } else throw err;
  }
  const sig = new Uint8Array(signature);
  return sig;
}

export async function luteSigner(
  txnGroup: Transaction[],
  indexesToSign?: number[]
) {
  const walletTxns: WalletTransaction[] = txnGroup.map((tx, idx) => {
    const txn = tx.toByte().toBase64();
    if (!indexesToSign || indexesToSign.includes(idx)) return { txn };
    else return { txn, signers: [] };
  });
  return luteSignerWT(walletTxns);
}

export async function luteSignerWT(walletTxns: WalletTransaction[]) {
  const store = useAppStore();
  store.setSnackbar("Awaiting Signatures...", "info", -1);
  const signedTxns = await new Promise<Uint8Array[]>((resolve, reject) => {
    store.luteTxns = new LuteTxns(walletTxns);
    window.addEventListener("modal-signer", listener);
    function listener(message: any) {
      if (message.detail.debug) console.log("[Lute Debug]", message.detail);
      switch (message.detail.action) {
        case "signed": {
          window.removeEventListener("modal-signer", listener);
          resolve(message.detail.txns);
          break;
        }
        case "error": {
          window.removeEventListener("modal-signer", listener);
          reject(
            new SignTxnsError(
              message.detail.message,
              message.detail.code || 4300
            )
          );
          break;
        }
        case "close":
          window.removeEventListener("modal-signer", listener);
          reject(new SignTxnsError("User Rejected Request", 4100));
          break;
      }
      return undefined;
    }
  });
  store.overlay = true;
  store.setSnackbar("Processing...", "info", -1);
  return signedTxns;
}
