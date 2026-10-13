// Asset prices from Vestige (MainNet only). Prices are per whole unit; a
// wallet can hold thousands of ASAs, so ids go out in batches of 100 (the API
// maximum) with a few in flight, and results — including "no price" — are
// cached so a refresh only asks for what has gone stale.

import { shallowRef } from "vue";

const API = "https://api.vestigelabs.org/assets/price";
const USDC = 31566704n;
const BATCH = 100;
const CONCURRENCY = 3;
const TTL = 5 * 60_000;
// Below this Vestige is guessing from thin pools, which is where spam tokens
// get absurd prices.
const MIN_CONFIDENCE = 0.5;

interface VestigePrice {
  asset_id: number;
  price: number;
  confidence?: number;
}

const cache = new Map<bigint, { price?: number; ts: number }>();
let usd: { price?: number; ts: number } | undefined;

async function fetchBatch(ids: bigint[], denom: bigint) {
  const url = `${API}?network_id=0&denominating_asset_id=${denom}&asset_ids=${ids.join(",")}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!resp.ok) throw Error(`Vestige ${resp.status}`);
  return (await resp.json()) as VestigePrice[];
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

/** ALGO price per whole unit for each id that has one. A failed batch is left
 * out (and not cached) rather than failing the rest. */
export async function getAlgoPrices(ids: bigint[]) {
  const now = Date.now();
  const stale = [...new Set(ids)].filter(
    (id) => id !== 0n && !(now - (cache.get(id)?.ts ?? 0) < TTL)
  );
  const batches: bigint[][] = [];
  for (let i = 0; i < stale.length; i += BATCH)
    batches.push(stale.slice(i, i + BATCH));
  await mapLimit(batches, CONCURRENCY, async (batch) => {
    try {
      const prices = await fetchBatch(batch, 0n);
      const ts = Date.now();
      for (const id of batch) cache.set(id, { ts });
      for (const p of prices)
        if (p.price > 0 && (p.confidence ?? 1) >= MIN_CONFIDENCE)
          cache.set(BigInt(p.asset_id), { price: p.price, ts });
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

/** USD per ALGO, priced against USDC. */
export async function getAlgoUsd() {
  if (usd && Date.now() - usd.ts < TTL) return usd.price;
  try {
    const [p] = await fetchBatch([0n], USDC);
    usd = { price: p?.price, ts: Date.now() };
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
