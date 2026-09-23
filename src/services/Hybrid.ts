import Algo, { getAuthAccts } from "@/services/Algo";
import { expand, extract } from "@noble/hashes/hkdf.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import algosdk, { Address } from "algosdk";
import { generateKey } from "falcon-1024";
import HdWallet from "./HdWallet";
import type { AccountSubs } from "@/types";

export const DOM_SEP = "HybridED25519Falcon1024-v1:";
const FALCON_SEED_LEN = 48;

const lsigTealTMPL = `#pragma version 12
#pragma typetrack false
#pragma autosalt true
main:
    intcblock 1 0
    bytecblock "DOM_SEP" 0xTMPL_ED_PK 0xTMPL_FL_PK
    intc_1
    dup
    txn GroupIndex
label2:
    dup
    bz label1
    dup
    intc_0
    -
    dup
    bury 2
    gtxns Sender
    txn Sender
    ==
    bz label2
    dup
    gtxns RekeyTo
    global ZeroAddress
    !=
    bnz label3
    dup
    gtxns CloseRemainderTo
    global ZeroAddress
    !=
    bz label4
label3:
    intc_0
label7:
    bnz label5
    intc_0
    return
label5:
    global GroupID
    dup
    bury 4
    bytec_0
    txn TxID
    concat
    bury 3
    global ZeroAddress
    !=
    bz label6
    bytec_0
    dig 3
    concat
    bury 2
label6:
    arg_0
    dup
    len
    pushint 64
    ==
    assert
    dig 2
    dup
    uncover 2
    bytec_1
    ed25519verify_bare
    assert
    arg_1
    bytec_2
    falcon_verify
    assert
    intc_0
    return
label4:
    intc_1
    b label7
label1:
    intc_0
    b label7`;

const dummyTeal = `#pragma version 3
txn RekeyTo
global ZeroAddress
==`;

const Hybrid = {
  getLsigTeal(edPublic: Uint8Array, falconPublic: Uint8Array) {
    return lsigTealTMPL
      .replace("DOM_SEP", DOM_SEP)
      .replace("TMPL_ED_PK", edPublic.toHex())
      .replace("TMPL_FL_PK", falconPublic.toHex());
  },
  keyPair(seed: Buffer, edPublic: Uint8Array) {
    if (seed.length !== 64) throw new Error("expected 64-byte BIP-39 seed");
    const prk = extract(sha512, seed);
    const falconSeed = expand(
      sha512,
      prk,
      concatBytes(utf8ToBytes(DOM_SEP), edPublic),
      FALCON_SEED_LEN
    );
    prk.fill(0);
    if (falconSeed.length !== FALCON_SEED_LEN)
      throw new Error("bad falcon seed");
    try {
      return generateKey(falconSeed);
    } finally {
      falconSeed.fill(0);
    }
  },
  async deriveAccts(seed: Buffer, startIndex: number = 0) {
    const edAddrs = await HdWallet.deriveAddrs(seed, startIndex);
    return await Promise.all(
      edAddrs.map(async (edAddr) => {
        const edPublic = Address.fromString(edAddr.value).publicKey;
        const falconPair = this.keyPair(seed, edPublic);
        let lsigTeal;
        try {
          lsigTeal = this.getLsigTeal(edPublic, falconPair.publicKey);
        } finally {
          falconPair.privateKey.fill(0);
        }
        const compiledSig = await Algo.algod.compile(lsigTeal).do();
        const logicSig = new algosdk.LogicSigAccount(
          Uint8Array.fromBase64(compiledSig.result)
        );
        const addr = logicSig.address().toString();
        const ai: AccountSubs = await Algo.algod.accountInformation(addr).do();
        const aa = await getAuthAccts(addr);
        ai.subs = aa;
        ai.hybrid = { edAddr: edAddr.value, lsig: compiledSig.result };
        return ai;
      })
    );
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

export default Hybrid;
