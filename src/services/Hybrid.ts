import Algo, { getAuthAccts } from "@/services/Algo";
import { expand, extract } from "@noble/hashes/hkdf.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import algosdk, {
  Address,
  type SuggestedParams,
  type Transaction,
} from "algosdk";
import {
  FALCON_DET1024_SIG_COMPRESSED_MAXSIZE,
  generateKey,
} from "falcon-1024";
import HdWallet from "./HdWallet";
import type { AccountSubs } from "@/types";
import type { FeeSimTxn } from "@/utils";

export const DOM_SEP = "HybridED25519Falcon1024-v1:";
const FALCON_SEED_LEN = 48;
const FEE_HEADROOM = 3n;

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
  dummyTxn(address: Address, sp: SuggestedParams, i: number, fee = 0n) {
    return algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: address,
      receiver: address,
      amount: 0,
      suggestedParams: { ...sp, fee, flatFee: true },
      note: i ? new TextEncoder().encode(i.toString()) : undefined,
    });
  },
  async getDummy(suggestedParams: SuggestedParams, count: number) {
    const dummyCompiled = await Algo.algod.compile(dummyTeal).do();
    const dummyBytes = Uint8Array.fromBase64(dummyCompiled.result);
    const dummyLsig = new algosdk.LogicSigAccount(dummyBytes);
    const dummyAddress = dummyLsig.address();
    const dummyTxns = [...Array(count).keys()].map((i) =>
      this.dummyTxn(dummyAddress, suggestedParams, i)
    );
    return { dummyLsig, dummyTxns };
  },
  /**
   * Only the first txn a hybrid account sends in a group carries signatures.
   * The lsig approves later ones on seeing that earlier txn, unless it rekeyed
   * or closed the account.
   */
  needsSigs(txns: Transaction[], idx: number) {
    const txn = txns[idx]!;
    const prev = txns
      .slice(0, idx)
      .reverse()
      .find((t) => t.sender.equals(txn.sender));
    return !prev || !!prev.rekeyTo || !!prev.payment?.closeRemainderTo;
  },
  /**
   * Lengthen a compiled program by `extra` bytes without changing what it
   * does: `pushbytes <zeros>; pop` right after the version byte.
   */
  padProgram(program: Uint8Array, extra: number) {
    if (!extra) return program;
    // 1 opcode + varuint length + zeros + 1 pop
    const len = extra >= 132 ? extra - 4 : extra - 3;
    if (len < 0 || len >= 128 !== extra >= 132)
      throw Error(`Cannot pad program by ${extra} bytes`);
    const varuint: number[] = [];
    let n = len;
    do {
      let b = n & 0x7f;
      n >>>= 7;
      if (n) b |= 0x80;
      varuint.push(b);
    } while (n);
    return new Uint8Array([
      program[0]!,
      0x80,
      ...varuint,
      ...new Uint8Array(len),
      0x48,
      ...program.slice(1),
    ]);
  },
  /** Shortest program that approves, padded to `length` bytes. */
  standInProgram(version: number, length: number) {
    // pushint 1
    return this.padProgram(new Uint8Array([version, 0x81, 0x01]), length - 3);
  },
  /**
   * Describe a group signed by a hybrid account for simulateFees.
   *
   * Simulate executes escrow lsig programs, and the hybrid program only
   * approves on real ed25519 + Falcon signatures over the final group id,
   * which do not exist before signing. So:
   * - Signature-bearing txns (see needsSigs) are simulated unsigned; algod
   *   stands in a signer. Their lsig bytes move onto a carrier: program bytes
   *   are priced on the group total against a per-group allowance, so where
   *   they sit does not matter. The args are placeholders at their maximum
   *   size, unpriced today.
   * - Later txns from the sender carry the real program with no args, exactly
   *   as when signed, and approve on seeing the earlier txn.
   * - With a dummy, its copy is the carrier: a self-payment from the padded
   *   program's own address, since an escrow lsig must hash to its
   *   authorizer. Without one, the last hybrid txn carries a stand-in program
   *   that approves, and the hybrid txn before it rekeys the account to that
   *   stand-in in simulation only.
   */
  feeSimTxns(
    txns: Transaction[],
    toSign: (idx: number) => boolean,
    program: Uint8Array,
    sp: SuggestedParams,
    dummy?: { lsig: algosdk.LogicSigAccount; count: number }
  ): FeeSimTxn[] {
    const headroom = BigInt(sp.minFee) * FEE_HEADROOM;
    const firstDummy = txns.length - (dummy?.count ?? 0);
    const hybrid = [...txns.keys()].filter(
      (idx) => idx < firstDummy && toSign(idx)
    );
    const bearing = hybrid.filter((idx) => this.needsSigs(txns, idx));
    const lsigSigner = algosdk.makeLogicSigAccountTransactionSigner(
      new algosdk.LogicSigAccount(program)
    );
    const plan: FeeSimTxn[] = txns.map((txn) => ({ txn }));
    for (const idx of hybrid) {
      plan[idx] = {
        txn: txns[idx]!,
        maxFee: txns[idx]!.fee + headroom,
        simSigner: bearing.includes(idx) ? undefined : lsigSigner,
      };
    }
    const args = bearing.flatMap(() => [
      new Uint8Array(64),
      new Uint8Array(FALCON_DET1024_SIG_COMPRESSED_MAXSIZE),
    ]);
    if (dummy) {
      const padded = new algosdk.LogicSigAccount(
        this.padProgram(dummy.lsig.lsig.logic, program.length * bearing.length),
        args
      );
      plan[firstDummy] = {
        txn: txns[firstDummy]!,
        simTxn: (t) => this.dummyTxn(padded.address(), sp, 0, t.fee),
        simSigner: algosdk.makeLogicSigAccountTransactionSigner(padded),
      };
      const dummySigner = algosdk.makeLogicSigAccountTransactionSigner(
        dummy.lsig
      );
      for (let idx = firstDummy + 1; idx < txns.length; idx++) {
        plan[idx] = { txn: txns[idx]!, simSigner: dummySigner };
      }
      return plan;
    }
    const carrier = hybrid.at(-1);
    const rekeyer = hybrid.at(-2);
    if (carrier === undefined || rekeyer === undefined)
      throw Error("Hybrid group needs a dummy txn");
    const moved = bearing.filter((idx) => idx !== carrier).length + 1;
    const standIn = new algosdk.LogicSigAccount(
      this.standInProgram(program[0]!, program.length * moved),
      args
    );
    plan[carrier]!.simSigner =
      algosdk.makeLogicSigAccountTransactionSigner(standIn);
    plan[rekeyer]!.simTxn = (t) => {
      const data = t.toEncodingData();
      data.set("rekey", standIn.address());
      return algosdk.Transaction.fromEncodingData(data);
    };
    return plan;
  },
};

export default Hybrid;
