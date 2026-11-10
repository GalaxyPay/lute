import * as node from "node:crypto";
import { describe, expect, it } from "vitest";
import * as shim from "@/shims/crypto";

// The browser builds alias `crypto` to src/shims/crypto.ts; xhd-wallet-api's
// BIP32-Ed25519 derivation runs on it, so it must match node:crypto exactly.
describe("crypto shim", () => {
  const data = new Uint8Array(Array.from({ length: 77 }, (_, i) => i * 7));
  const key = new Uint8Array(Array.from({ length: 32 }, (_, i) => 255 - i));

  it.each(["sha256", "sha512"])("createHash %s", (alg) => {
    const want = node.createHash(alg).update(data).update("x").digest();
    const got = shim.createHash(alg).update(data).update("x").digest();
    expect(Buffer.isBuffer(got)).toBe(true);
    expect(got.equals(want)).toBe(true);
    expect(shim.createHash(alg).update(data).digest("hex")).toBe(
      node.createHash(alg).update(data).digest("hex")
    );
  });

  it("createHmac sha512", () => {
    const want = node.createHmac("sha512", key).update(data).digest();
    const got = shim.createHmac("sha512", key).update(data).digest();
    expect(got.equals(want)).toBe(true);
  });

  it("rejects unsupported algorithms", () => {
    expect(() => shim.createHash("md5")).toThrow(/unsupported/);
  });
});
