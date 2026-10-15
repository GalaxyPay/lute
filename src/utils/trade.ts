import { bytesEqual } from "@/utils/keys";
import algosdk, { type Transaction } from "algosdk";

/** Most ALGO the user's txns in a trade may pay in fees: 0.2 ALGO. */
export const MAX_TRADE_FEE = 200_000n;

export interface TradeExpect {
  /** The trading account; it signs every txn it sends. */
  address: string;
  fromASAID: bigint;
  /** Largest amount of the from-asset the group may move out. */
  amount: bigint;
  genesisHash: Uint8Array;
  maxFee?: bigint;
}

/** Indexes of the txns the trading account sends, and so signs. */
export function userIndexes(group: Transaction[], address: string) {
  return group.flatMap((t, idx) => (t.sender.toString() === address ? [idx] : []));
}

/** Lowest output a fixed-input quote may fill at, `slippage` in percent. */
export function minReceived(quote: bigint, slippage: number) {
  const bps = BigInt(Math.round(slippage * 100));
  return (quote * (10_000n - bps)) / 10_000n;
}

/** ALGO kept back from a max trade for the router's txn fees: 0.05 ALGO. */
export const TRADE_FEE_RESERVE = 50_000n;

/**
 * Most of `assetId` the account can trade away. ALGO keeps the min balance,
 * `reserve` (e.g. the MBR of an opt-in the trade adds) and fee headroom.
 */
export function spendable(
  info: { amount: bigint; minBalance: bigint; assets?: { assetId: bigint; amount: bigint }[] },
  assetId: bigint,
  reserve = 0n
) {
  if (assetId) return info.assets?.find((a) => a.assetId === assetId)?.amount ?? 0n;
  const max = info.amount - info.minBalance - reserve - TRADE_FEE_RESERVE;
  return max > 0n ? max : 0n;
}

/**
 * The router's API writes the group, so what the user signs is checked before
 * the sign dialog opens: only plain sends of the from-asset (up to `amount`),
 * opt-ins and app calls, nothing that rekeys, closes or claws back.
 */
export function validateTradeGroup(
  group: Transaction[],
  indexesToSign: number[],
  exp: TradeExpect
) {
  const mine = userIndexes(group, exp.address);
  if (
    indexesToSign.length !== mine.length ||
    indexesToSign.some((idx) => !mine.includes(idx))
  )
    throw Error("Invalid Trade: signers");

  let spent = 0n;
  let fees = 0n;
  for (const idx of mine) {
    const t = group[idx]!;
    if (!t.genesisHash || !bytesEqual(t.genesisHash, exp.genesisHash))
      throw Error("Network Mismatch");
    if (t.rekeyTo) throw Error("Invalid Trade: rekey");
    fees += t.fee;
    switch (t.type) {
      case algosdk.TransactionType.pay: {
        if (t.payment!.closeRemainderTo) throw Error("Invalid Trade: close");
        const amt = t.payment!.amount;
        if (amt && exp.fromASAID !== 0n) throw Error("Invalid Trade: payment");
        spent += amt;
        break;
      }
      case algosdk.TransactionType.axfer: {
        const x = t.assetTransfer!;
        if (x.closeRemainderTo) throw Error("Invalid Trade: close");
        if (x.assetSender) throw Error("Invalid Trade: clawback");
        if (!x.amount) break; // opt-in, or a no-op
        if (x.assetIndex !== exp.fromASAID)
          throw Error("Invalid Trade: transfer");
        spent += x.amount;
        break;
      }
      case algosdk.TransactionType.appl: {
        const oc = t.applicationCall!.onComplete;
        if (
          oc !== algosdk.OnApplicationComplete.NoOpOC &&
          oc !== algosdk.OnApplicationComplete.OptInOC
        )
          throw Error("Invalid Trade: app call");
        break;
      }
      default:
        throw Error(`Invalid Trade: ${t.type}`);
    }
  }
  if (spent > exp.amount) throw Error("Invalid Trade: amount");
  if (fees > (exp.maxFee ?? MAX_TRADE_FEE)) throw Error("Invalid Trade: fee");
}
