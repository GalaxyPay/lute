// Asset prices from Haystack (MainNet only). Haystack prices are per whole
// unit and come with decimals, so they are cached per base unit. A wallet can
// hold thousands of ASAs and the API takes at most 100 ids per call, so ids go
// out in batches with a few in flight, and results — including "no price" —
// are cached so a refresh only asks for what has gone stale.

import { shallowRef } from "vue";

const API = "https://api.hay.app/api/assets/prices";
const KEY = "hay_pk_pknm6ujwuphntck4jt6qronh2u";
const BATCH = 100;
const CONCURRENCY = 4;
const TTL = 5 * 60_000;
// Below this the price comes from thin pools, which is where spam tokens get
// absurd prices.
const MIN_CONFIDENCE = 0.5;

interface HayPrice {
  id: string | number;
  decimals: number;
  price?: number;
  usdPrice?: number;
  priceConfidence?: number;
  moderation?: { flagged?: boolean };
}

const cache = new Map<bigint, { price?: number; ts: number }>();
let usd: { price?: number; ts: number } | undefined;

async function fetchBatch(ids: bigint[]) {
  const q = new URLSearchParams();
  for (const id of ids) q.append("asset", String(id));
  const resp = await fetch(`${API}?${q}`, {
    headers: { "x-api-key": KEY },
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) throw Error(`Haystack ${resp.status}`);
  return ((await resp.json()) as { prices?: HayPrice[] }).prices ?? [];
}

/** Runs `fn` over `items` with at most `limit` calls in flight. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
) {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return out;
}

/** ALGO per base unit for each id that has a price. A failed batch is left
 * out (and not cached) rather than failing the rest. */
export async function getUnitPrices(ids: bigint[]) {
  const now = Date.now();
  const stale = [...new Set(ids)].filter(
    (id) => id !== 0n && !(now - (cache.get(id)?.ts ?? 0) < TTL)
  );
  const batches: bigint[][] = [];
  for (let i = 0; i < stale.length; i += BATCH)
    batches.push(stale.slice(i, i + BATCH));
  await mapLimit(batches, CONCURRENCY, async (batch) => {
    try {
      const prices = await fetchBatch(batch);
      const ts = Date.now();
      for (const id of batch) cache.set(id, { ts });
      for (const a of prices) {
        const price = a.price ?? 0;
        if (
          price > 0 &&
          (a.priceConfidence ?? 1) >= MIN_CONFIDENCE &&
          !a.moderation?.flagged
        )
          cache.set(BigInt(a.id), { price: price / 10 ** a.decimals, ts });
      }
    } catch (err) {
      console.error(err);
    }
  });
  const result = new Map<bigint, number>();
  for (const id of ids) {
    const price = cache.get(id)?.price;
    if (price !== undefined) result.set(id, price);
  }
  return result;
}

/** USD per ALGO; Haystack lists ALGO itself as asset 0. */
export async function getAlgoUsd() {
  if (usd && Date.now() - usd.ts < TTL) return usd.price;
  try {
    const [a] = await fetchBatch([0n]);
    usd = { price: a?.usdPrice, ts: Date.now() };
    return usd.price;
  } catch (err) {
    console.error(err);
  }
}

export function clearPriceCache() {
  cache.clear();
  usd = undefined;
  unitPrices.value = new Map();
}

/** ALGO per base unit of each priced MainNet asset. The Accounts overview
 * publishes this once it has resolved decimals, so other views can value
 * holdings without fetching; until it has run, they show nothing. */
export const unitPrices = shallowRef(new Map<bigint, number>());

/** ALGO value of a holding, if its price is already known. */
export function algoValue(assetId: bigint, amount: bigint) {
  if (useAppStore().networkName !== "MainNet") return;
  const unit = unitPrices.value.get(assetId);
  return unit === undefined ? undefined : Number(amount) * unit;
}

export function formatAlgoValue(n: number) {
  if (n > 0 && n < 0.01) return "<0.01";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
