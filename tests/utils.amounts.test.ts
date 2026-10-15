import { describe, expect, it } from "vitest";
import { bigintToString, stringToBigint } from "@/utils";

const sep = (1.1).toLocaleString().substring(1, 2);

describe("stringToBigint", () => {
  it.each([
    ["1", 6, 1_000_000n],
    ["1.5", 6, 1_500_000n],
    ["0.000001", 6, 1n],
    [".5", 6, 500_000n],
    ["5.", 6, 5_000_000n],
    [" 2.25 ", 2, 225n],
    ["0", 6, 0n],
    ["42", 0, 42n],
    ["18446744073709551615", 0, 18446744073709551615n],
    ["1.0000000000000000001", 19, 10000000000000000001n],
  ])("parses %j with %i decimals", (amt, dec, want) => {
    expect(stringToBigint(amt, dec)).toBe(want);
  });

  it("accepts numbers from number fields", () => {
    expect(stringToBigint(0, 6)).toBe(0n);
    expect(stringToBigint(1.25, 6)).toBe(1_250_000n);
  });

  it.each(["-0.5", "-1", "+1", "1.2.3", "1e5", "1,5", "abc", "", ".", " "])(
    "rejects %j",
    (amt) => {
      expect(() => stringToBigint(amt, 6)).toThrow("Invalid Amount");
    }
  );

  it("rejects exponent notation that String(number) produces", () => {
    expect(() => stringToBigint(1e-7, 6)).toThrow("Invalid Amount");
  });

  it("rejects digits past the asset's decimals instead of truncating", () => {
    expect(() => stringToBigint("1.0000001", 6)).toThrow("more than 6");
    expect(() => stringToBigint("1.5", 0)).toThrow("more than 0");
  });

  it("rejects invalid decimals", () => {
    expect(() => stringToBigint("1", 20)).toThrow("Invalid Decimals");
  });
});

describe("bigintToString", () => {
  it.each([
    [1_000_000n, 6, "1"],
    [1_500_000n, 6, `1${sep}5`],
    [1n, 6, `0${sep}000001`],
    [0n, 6, "0"],
    [42n, 0, "42"],
    [10000000000000000001n, 19, `1${sep}0000000000000000001`],
  ])("formats %s with %i decimals", (amt, dec, want) => {
    expect(bigintToString(amt, dec, true)).toBe(want);
  });

  it("uses locale grouping unless plain", () => {
    expect(bigintToString(1_234_567_000_000n, 6)).toBe(
      (1_234_567).toLocaleString()
    );
    expect(bigintToString(1_234_567_000_000n, 6, true)).toBe("1234567");
  });

  it("rounds half up", () => {
    expect(bigintToString(1_234_999n, 6, true, 2)).toBe(`1${sep}23`);
    expect(bigintToString(1_235_000n, 6, true, 2)).toBe(`1${sep}24`);
    expect(bigintToString(1_995_000n, 6, true, 2)).toBe("2");
    expect(bigintToString(1_400_000n, 6, true, 0)).toBe("1");
    expect(bigintToString(1_500_000n, 6, true, 0)).toBe("2");
  });

  it("rounds without losing precision on large decimals", () => {
    // 0.1234567890123456789 with 19 decimals, rounded to 18: Number() would
    // round this to 0.12345678901234568.
    expect(bigintToString(1234567890123456789n, 19, true, 18)).toBe(
      `0${sep}123456789012345679`
    );
  });

  it("formats negative amounts", () => {
    expect(bigintToString(-1_500_000n, 6, true)).toBe(`-1${sep}5`);
    expect(bigintToString(-1n, 6, true)).toBe(`-0${sep}000001`);
    expect(bigintToString(-1n, 6, true, 2)).toBe("0");
  });

  it("round-trips through stringToBigint", () => {
    for (const amt of [0n, 1n, 999_999n, 1_000_000n, 123_456_789n]) {
      const s = bigintToString(amt, 6, true).replace(sep, ".");
      expect(stringToBigint(s, 6)).toBe(amt);
    }
  });

  it("rejects invalid decimals", () => {
    expect(() => bigintToString(1n, 20)).toThrow("Invalid Decimals");
  });
});
