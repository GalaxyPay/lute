// Large wallets hold thousands of ASAs: prices must go out in batches the API
// accepts, several at a time, and a refresh must not ask again.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPriceCache,
  getAlgoUsd,
  getUnitPrices,
  mapLimit,
} from "@/services/Prices";

let inFlight = 0;
let maxInFlight = 0;
const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
  inFlight++;
  maxInFlight = Math.max(maxInFlight, inFlight);
  await new Promise((r) => setTimeout(r, 5));
  inFlight--;
  const ids = new URL(url).searchParams.getAll("asset").map(Number);
  // ALGO (id 0) is $0.125. Even ids are priced at id ALGO per whole unit; id 2
  // is low confidence, id 8 is flagged, id 6 has 2 decimals; odd ids have no
  // market.
  return Response.json({
    assets: ids.map((id) =>
      id === 0
        ? { id, decimals: 6, price: { price: 1, usdPrice: 0.125 } }
        : {
            id,
            decimals: id === 6 ? 2 : 0,
            price: id % 2 === 0 ? { price: id, usdPrice: id / 8 } : undefined,
            priceConfidence: id === 2 ? 0.1 : 0.99,
            moderation: { flagged: id === 8 },
          }
    ),
  });
});

beforeEach(() => {
  clearPriceCache();
  fetchMock.mockClear();
  inFlight = maxInFlight = 0;
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("getUnitPrices", () => {
  it("batches by 10 with at most 8 in flight", async () => {
    const ids = Array.from({ length: 1050 }, (_, i) => BigInt(i + 1));
    const prices = await getUnitPrices(ids);
    expect(fetchMock).toHaveBeenCalledTimes(105);
    for (const [url, init] of fetchMock.mock.calls) {
      expect(
        new URL(url).searchParams.getAll("asset").length
      ).toBeLessThanOrEqual(10);
      expect(
        (init?.headers as Record<string, string>)["x-api-key"]
      ).toBeTruthy();
    }
    expect(maxInFlight).toBe(8);
    expect(prices.get(4n)).toBe(4);
    expect(prices.has(3n)).toBe(false);
    expect(prices.has(2n)).toBe(false);
    expect(prices.has(8n)).toBe(false);
  });

  it("prices per base unit", async () => {
    expect((await getUnitPrices([6n])).get(6n)).toBe(0.06);
  });

  it("caches priced and unpriced ids", async () => {
    await getUnitPrices([3n, 4n]);
    const prices = await getUnitPrices([3n, 4n]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(prices.get(4n)).toBe(4);
  });

  it("drops a failed batch without caching it", async () => {
    fetchMock.mockRejectedValueOnce(Error("down"));
    expect((await getUnitPrices([4n])).size).toBe(0);
    expect((await getUnitPrices([4n])).get(4n)).toBe(4);
  });

  it("never asks for ALGO itself", async () => {
    await getUnitPrices([0n]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getAlgoUsd", () => {
  it("reads ALGO's USD price and caches it", async () => {
    expect(await getAlgoUsd()).toBe(0.125);
    expect(await getAlgoUsd()).toBe(0.125);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("mapLimit", () => {
  it("keeps input order", async () => {
    expect(await mapLimit([3, 1, 2], 2, async (n) => n * 2)).toEqual([6, 2, 4]);
  });
});
