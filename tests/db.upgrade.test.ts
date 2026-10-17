import { describe, expect, it } from "vitest";
import { buildV3, type Fixture } from "./fixtures/v3db";
import { fresh } from "./helpers";

describe("IndexedDB v4 upgrade", () => {
  it("adds the keystore store, stamps accounts and continues seed ids", async () => {
    let fx!: Fixture;
    const { db } = await fresh(async () => {
      fx = await buildV3("current");
    });
    const accounts: any[] = await db.get("app", "accounts");
    expect(accounts.length).toBe(10);
    expect(accounts.every((a) => a.v === 2)).toBe(true);
    // Seeds 1-4 exist, so new seed ids start after them.
    expect(await db.get("app", "nextSeedId")).toBe(5);
    expect(await db.getAll("keystore")).toEqual([]);
    // Nothing secret is touched until a password is entered.
    expect(((await db.getAll("seeds")) as any[]).map((s) => s.id)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(await db.keys("falcon25-seeds")).toEqual([fx.falconAddr]);
    expect(await db.keys("keys")).toEqual([fx.hotAddr]);
    expect(await db.get("app", "password")).toBeTruthy();
    expect(accounts.find((a) => a.appId)?.appId).toBe(123n);
  });

  it("starts seed ids at 1 on a fresh install", async () => {
    const { db } = await fresh();
    expect(await db.get("app", "nextSeedId")).toBe(1);
    expect(await db.get("app", "accounts")).toBeUndefined();
  });

  it("stamps the format version on accounts written later", async () => {
    const { db } = await fresh();
    await db.set("app", "accounts", [{ addr: "A" }, { addr: "B", v: 2 }]);
    expect(await db.get("app", "accounts")).toEqual([
      { addr: "A", v: 2 },
      { addr: "B", v: 2 },
    ]);
  });
});
