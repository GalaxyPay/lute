// Large wallets hold thousands of ASAs: prices must go out in batches the API
// accepts, a few at a time, and a refresh must not ask again.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPriceCache,
  getAlgoPrices,
  getAlgoUsd,
  mapLimit,
} from "@/services/Prices";

let inFlight = 0;
let maxInFlight = 0;
const fetchMock = vi.fn(async (url: string) => {
  inFlight++;
  maxInFlight = Math.max(maxInFlight, inFlight);
  await new Promise((r) => setTimeout(r, 5));
  inFlight--;
  const u = new URL(url);
  const ids = u.searchParams.get("asset_ids")!.split(",").map(Number);
  if (u.searchParams.get("denominating_asset_id") === "31566704")
    return Response.json([{ asset_id: 0, price: 0.12 }]);
  // Even ids are priced; id 2 is low confidence; odd ids have no market.
  return Response.json(
    ids
      .filter((id) => id % 2 === 0)
      .map((id) => ({
        asset_id: id,
        price: id,
        confidence: id === 2 ? 0.1 : 0.99,
      }))
  );
});

beforeEach(() => {
  clearPriceCache();
  fetchMock.mockClear();
  inFlight = maxInFlight = 0;
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("getAlgoPrices", () => {
  it("batches by 100 with at most 3 in flight", async () => {
    const ids = Array.from({ length: 1050 }, (_, i) => BigInt(i + 1));
    const prices = await getAlgoPrices(ids);
    expect(fetchMock).toHaveBeenCalledTimes(11);
    for (const [url] of fetchMock.mock.calls)
      expect(
        new URL(url).searchParams.get("asset_ids")!.split(",").length
      ).toBeLessThanOrEqual(100);
    expect(maxInFlight).toBe(3);
    expect(prices.get(4n)).toBe(4);
    expect(prices.has(3n)).toBe(false);
    expect(prices.has(2n)).toBe(false);
  });

  it("caches priced and unpriced ids", async () => {
    await getAlgoPrices([3n, 4n]);
    const prices = await getAlgoPrices([3n, 4n]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(prices.get(4n)).toBe(4);
  });

  it("drops a failed batch without caching it", async () => {
    fetchMock.mockRejectedValueOnce(Error("down"));
    expect((await getAlgoPrices([4n])).size).toBe(0);
    expect((await getAlgoPrices([4n])).get(4n)).toBe(4);
  });

  it("never asks for ALGO itself", async () => {
    await getAlgoPrices([0n]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getAlgoUsd", () => {
  it("prices ALGO in USDC and caches it", async () => {
    expect(await getAlgoUsd()).toBe(0.12);
    expect(await getAlgoUsd()).toBe(0.12);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("mapLimit", () => {
  it("keeps input order", async () => {
    expect(await mapLimit([3, 1, 2], 2, async (n) => n * 2)).toEqual([6, 2, 4]);
  });
});
