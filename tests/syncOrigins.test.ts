import { describe, expect, it } from "vitest";
import { syncOrigins, syncWebOrigin } from "@/ext/syncOrigins";

// These origins are trusted with the sync relay; widening them is a security
// change and should fail this test first.
describe("sync origins", () => {
  it("allows only lute.app in production", () => {
    expect(syncOrigins(false)).toEqual(["https://lute.app"]);
    expect(syncWebOrigin(false)).toBe("https://lute.app");
  });

  it("adds only the local dev server in development", () => {
    expect(syncOrigins(true)).toEqual([
      "https://lute.app",
      "http://localhost:3031",
    ]);
    expect(syncWebOrigin(true)).toBe("http://localhost:3031");
  });
});
