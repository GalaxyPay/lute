import { bytesEqual } from "@/utils/keys";
import algosdk, { type Transaction } from "algosdk";

/**
 * Most ALGO a swap may cost beyond its input and router fee: txn fees plus
 * any ALGO the router asks for to cover its inner txns. 0.2 ALGO.
 */
export const MAX_SWAP_FEE = 200_000n;

export interface SwapExpect {
  /** The swapping account; it signs every txn it sends. */
  address: string;
  fromASAID: bigint;
  /** The quoted input, in base units of the from-asset. */
  amount: bigint;
  /** Router fee in basis points, which may be charged on top of `amount`. */
  feeBps?: number;
  genesisHash: Uint8Array;
  maxFee?: bigint;
}

/** Indexes of the txns the swapping account sends, and so signs. */
export function userIndexes(group: Transaction[], address: string) {
  return group.flatMap((t, idx) => (t.sender.toString() === address ? [idx] : []));
}

/** Lowest output a fixed-input quote may fill at, `slippage` in percent. */
export function minReceived(quote: bigint, slippage: number) {
  const bps = BigInt(Math.round(slippage * 100));
  return (quote * (10_000n - bps)) / 10_000n;
}

/** ALGO kept back from a max swap for the router's txn fees: 0.05 ALGO. */
export const SWAP_FEE_RESERVE = 50_000n;

/**
 * Most of `assetId` the account can swap away. ALGO keeps the min balance,
 * `reserve` (e.g. the MBR of an opt-in the swap adds) and fee headroom.
 */
export function spendable(
  info: { amount: bigint; minBalance: bigint; assets?: { assetId: bigint; amount: bigint }[] },
  assetId: bigint,
  reserve = 0n
) {
  if (assetId) return info.assets?.find((a) => a.assetId === assetId)?.amount ?? 0n;
  const max = info.amount - info.minBalance - reserve - SWAP_FEE_RESERVE;
  return max > 0n ? max : 0n;
}

/**
 * The router's API writes the group, so what the user signs is checked before
 * the sign dialog opens: only plain sends, opt-ins and app calls, nothing that
 * rekeys, closes or claws back. The from-asset sent is capped at `amount` plus
 * the router fee, and the ALGO spent on anything else, fees included, at
 * `maxFee`.
 */
export function validateSwapGroup(
  group: Transaction[],
  indexesToSign: number[],
  exp: SwapExpect
) {
  const mine = userIndexes(group, exp.address);
  if (
    indexesToSign.length !== mine.length ||
    indexesToSign.some((idx) => !mine.includes(idx))
  )
    throw Error("Invalid Swap: signers");

  let input = 0n; // from-asset sent
  let cost = 0n; // ALGO spent on anything else, fees included
  for (const idx of mine) {
    const t = group[idx]!;
    if (!t.genesisHash || !bytesEqual(t.genesisHash, exp.genesisHash))
      throw Error("Network Mismatch");
    if (t.rekeyTo) throw Error("Invalid Swap: rekey");
    cost += t.fee;
    switch (t.type) {
      case algosdk.TransactionType.pay: {
        if (t.payment!.closeRemainderTo) throw Error("Invalid Swap: close");
        if (exp.fromASAID === 0n) input += t.payment!.amount;
        else cost += t.payment!.amount;
        break;
      }
      case algosdk.TransactionType.axfer: {
        const x = t.assetTransfer!;
        if (x.closeRemainderTo) throw Error("Invalid Swap: close");
        if (x.assetSender) throw Error("Invalid Swap: clawback");
        if (!x.amount) break; // opt-in, or a no-op
        if (x.assetIndex !== exp.fromASAID)
          throw Error("Invalid Swap: transfer");
        input += x.amount;
        break;
      }
      case algosdk.TransactionType.appl: {
        const oc = t.applicationCall!.onComplete;
        if (
          oc !== algosdk.OnApplicationComplete.NoOpOC &&
          oc !== algosdk.OnApplicationComplete.OptInOC
        )
          throw Error("Invalid Swap: app call");
        break;
      }
      default:
        throw Error(`Invalid Swap: ${t.type}`);
    }
  }
  const bps = BigInt(exp.feeBps ?? 0);
  const maxInput = exp.amount + (exp.amount * bps + 9_999n) / 10_000n;
  const maxCost = exp.maxFee ?? MAX_SWAP_FEE;
  // ALGO in excess of the input may be the router's ALGO top-up: one budget.
  if (exp.fromASAID === 0n && input > maxInput) {
    cost += input - maxInput;
    input = maxInput;
  }
  if (input > maxInput)
    throw Error(`Invalid Swap: amount (sends ${input}, quoted ${exp.amount})`);
  if (cost > maxCost)
    throw Error(`Invalid Swap: fee (costs ${cost} microALGO, max ${maxCost})`);
}
