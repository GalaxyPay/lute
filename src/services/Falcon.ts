import Algo from "@/services/Algo";
import { ed25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha512 } from "@noble/hashes/sha2.js";
import algosdk from "algosdk";
import { generateKey } from "falcon-1024";

const lsigTealTMPL = `#pragma version 12
bytecblock 0xTMPL_COUNTER
txn TxID
arg 0
pushbytes 0xTMPL_FALCON_PUBLIC_KEY
falcon_verify`;

const dummyTeal = `#pragma version 3
txn RekeyTo
global ZeroAddress
==`;

const hkdfSalt = "bip39-falcon-seed-salt-v1";
const hkdfInfoString = "Falcon1024 seed v1";

const Falcon = {
  getLsigTeal(counter: number, falconPublic: Uint8Array) {
    return lsigTealTMPL
      .replace("TMPL_COUNTER", counter.toString(16).padStart(2, "0"))
      .replace("TMPL_FALCON_PUBLIC_KEY", falconPublic.toHex());
  },
  keyPair(seed: Uint8Array) {
    const enc = new TextEncoder();
    const derivedKey = hkdf(
      sha512,
      seed,
      enc.encode(hkdfSalt),
      enc.encode(hkdfInfoString),
      48
    );
    return generateKey(derivedKey);
  },
  async algoAccount(seed: Uint8Array) {
    const falconPair = this.keyPair(seed);
    const publicKey = falconPair.publicKey.toBase64();
    let counter: number;
    let logicSig: algosdk.LogicSigAccount | undefined = undefined;
    for (counter = 0; counter < 256; counter++) {
      const lsigTeal = this.getLsigTeal(counter, falconPair.publicKey);
      const compiledSig = await Algo.algod.compile(lsigTeal).do();
      logicSig = new algosdk.LogicSigAccount(
        Uint8Array.fromBase64(compiledSig.result)
      );
      try {
        ed25519.Point.fromBytes(logicSig.address().publicKey, true);
      } catch {
        break;
      }
    }
    if (!logicSig) throw Error("Invalid Lsig");
    return {
      counter,
      publicKey,
      addr: logicSig.address().toString(),
    };
  },
  async getDummy(suggestedParams: algosdk.SuggestedParams, count: number) {
    const enc = new TextEncoder();
    const dummyCompiled = await Algo.algod.compile(dummyTeal).do();
    const dummyBytes = Uint8Array.fromBase64(dummyCompiled.result);
    const dummyLsig = new algosdk.LogicSigAccount(dummyBytes);
    const dummyAddress = dummyLsig.address();
    const dummyTxns = [...Array(count).keys()].map((i) =>
      algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: dummyAddress,
        receiver: dummyAddress,
        amount: 0,
        suggestedParams: { ...suggestedParams, fee: 0, flatFee: true },
        note: i ? enc.encode(i.toString()) : undefined,
      })
    );
    return { dummyLsig, dummyTxns };
  },
};

export default Falcon;
