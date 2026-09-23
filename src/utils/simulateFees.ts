import Algo from "@/services/Algo";
import { prepareGroupForSending } from "@algorandfoundation/algokit-utils";
import type { TransactionComposer } from "@algorandfoundation/algokit-utils/types/composer";
import algosdk, {
  SignedTransaction,
  Transaction,
  type Algodv2,
  type SuggestedParams,
  type TransactionSigner,
} from "algosdk";

/** Simulate reports usage in millionths of one base transaction fee. */
const USAGE_SCALE = 1_000_000n;

/** Protocol FeeForUsage: the fee owed for `usage` at the current min fee. */
export function feeForUsage(usage: bigint, minFee: bigint) {
  return (usage * minFee + USAGE_SCALE - 1n) / USAGE_SCALE;
}

/**
 * Simulation signer for a Falcon-1024 account: a scheme-only placeholder,
 * which algod accepts under allowEmptySignatures and prices as a full
 * signature. Needs no key material.
 */
export const falconPlaceholderSigner: TransactionSigner = async (group, idxs) =>
  idxs.map((idx) =>
    algosdk.encodeMsgpack(
      new SignedTransaction({
        txn: group[idx]!,
        pqsig: {
          sch: algosdk.FALCON_1024_SCHEME,
          slt: 0,
          pk: new Uint8Array(),
          sig: new Uint8Array(),
        },
      })
    )
  );

/** Extra min fees a txn may be raised by when the wallet prices a group. */
const PRICE_HEADROOM = 10n;

/**
 * Price a group the wallet composed and will sign with `acct`: simulate it
 * and raise the fees of the txns at `indexes` (default all) to what algod
 * requires. A Falcon account is simulated with a placeholder signature so
 * its surcharge is included. A hybrid lsig account's extra bytes and dummy
 * are priced later, in LuteTxns.modifyGroup. Mutates and returns the txns.
 */
export async function priceTxns(
  txns: Transaction[],
  acct: { isFalcon25?: boolean },
  indexes?: number[]
) {
  const sp = await Algo.algod.getTransactionParams().do();
  const headroom = BigInt(sp.minFee) * PRICE_HEADROOM;
  const simSigner = acct.isFalcon25 ? falconPlaceholderSigner : undefined;
  return simulateFees(
    txns.map((txn, idx) =>
      !indexes || indexes.includes(idx)
        ? { txn, maxFee: txn.fee + headroom, simSigner }
        : { txn }
    ),
    { suggestedParams: sp }
  );
}

/**
 * Fee the network requires for one plain txn signed by `acct`, measured on a
 * self-payment probe. For txns that cannot be simulated in their real group
 * yet, such as a swap proposal whose counterparty may still need to opt in.
 */
export async function probeFee(acct: { addr: string; isFalcon25?: boolean }) {
  const sp = await Algo.algod.getTransactionParams().do();
  const probe = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: acct.addr,
    receiver: acct.addr,
    amount: 0,
    suggestedParams: sp,
  });
  await priceTxns([probe], acct);
  return probe.fee;
}

/**
 * Build an algokit composer's group, with app call resources populated, as
 * plain txns for priceTxns. The fees a composer sets are only a starting
 * point; the group is signed and sent by the wallet, not the composer.
 */
export async function composerTxns(composer: TransactionComposer) {
  const { atc } = await composer.build();
  const prepared = await prepareGroupForSending(atc, Algo.algod, {
    populateAppCallResources: true,
  });
  return prepared.buildGroup().map((t) => t.txn);
}

export interface FeeSimTxn {
  txn: Transaction;
  /**
   * Highest fee this txn may be raised to. Omit for txns whose fee must not
   * change: already signed elsewhere, or paid for by another txn.
   */
  maxFee?: bigint;
  /**
   * Stand-in to simulate instead of `txn` when its real signed form cannot be
   * produced yet. Receives a clone with the fee already raised to `maxFee`.
   */
  simTxn?: (txn: Transaction) => Transaction;
  /**
   * Placeholder signer for simulation, e.g. a Falcon account's emptyTxnSigner
   * (algod prices the missing signature by scheme) or a LogicSigAccount
   * signer. Without one the txn is simulated unsigned and algod fixes the
   * signer.
   */
  simSigner?: TransactionSigner;
}

/**
 * Simulate a group with every fee raised to its cap, read the usage algod
 * reports, then raise the real fees by only what the group is short.
 *
 * Pitfalls handled: algod rejects a simulation that is short on fees, so the
 * caps go on first and are backed out of the fees-paid figure; the group id
 * must be recomputed whenever a fee changes; fees paid by inner txns count
 * toward the group. The shortfall lands on the first capped txns.
 *
 * Mutates the txns (fee, group) and returns them.
 */
export async function simulateFees(
  txns: FeeSimTxn[],
  opts: { suggestedParams?: SuggestedParams; algod?: Algodv2 } = {}
) {
  const algod = opts.algod ?? Algo.algod;
  const sp = opts.suggestedParams ?? (await algod.getTransactionParams().do());
  const minFee = BigInt(sp.minFee);
  const grouped = txns.length > 1 || txns.some((t) => t.txn.group);

  let addedFees = 0n;
  const simTxns = txns.map(({ txn, maxFee, simTxn }) => {
    const copy = algosdk.decodeUnsignedTransaction(txn.toByte());
    if (maxFee && maxFee > copy.fee) {
      addedFees += maxFee - copy.fee;
      copy.fee = maxFee;
    }
    return simTxn ? simTxn(copy) : copy;
  });
  regroup(simTxns, grouped);
  const stxns = await Promise.all(
    simTxns.map(async (txn, idx) => {
      const signer = txns[idx]!.simSigner;
      if (!signer) return new SignedTransaction({ txn });
      const [blob] = await signer(simTxns, [idx]);
      return algosdk.decodeSignedTransaction(blob!);
    })
  );

  const { txnGroups } = await algod
    .simulateTransactions(
      new algosdk.modelsv2.SimulateRequest({
        allowEmptySignatures: true,
        fixSigners: true,
        txnGroups: [
          new algosdk.modelsv2.SimulateRequestTransactionGroup({ txns: stxns }),
        ],
      })
    )
    .do();
  const result = txnGroups[0];
  if (!result) throw Error("Simulate returned no result");
  if (result.failureMessage)
    throw Error(`Simulate failed: ${result.failureMessage}`);
  if (result.groupUsage == null) throw Error("Node does not report fee usage");

  const required = feeForUsage(BigInt(result.groupUsage), minFee);
  const paid = BigInt(result.groupFeesPaid ?? 0) - addedFees;
  let needed = required > paid ? required - paid : 0n;

  for (const { txn, maxFee } of txns) {
    if (!needed) break;
    if (!maxFee || maxFee <= txn.fee) continue;
    const room = maxFee - txn.fee;
    const add = needed < room ? needed : room;
    txn.fee += add;
    needed -= add;
  }
  if (needed) throw Error("Fee caps too low to cover the group");

  const out = txns.map((t) => t.txn);
  regroup(out, grouped);
  return out;
}

function regroup(txns: Transaction[], grouped: boolean) {
  for (const txn of txns) txn.group = undefined;
  if (grouped) algosdk.assignGroupID(txns);
}
