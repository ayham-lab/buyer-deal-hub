// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parsePrice, scorePriceFit } from "./price.ts";

describe("parsePrice", () => {
  it("parses plain, formatted, and shorthand values", () => {
    expect(parsePrice("250000")).toBe(250000);
    expect(parsePrice("$250,000")).toBe(250000);
    expect(parsePrice("250k")).toBe(250000);
    expect(parsePrice("1.2m")).toBe(1200000);
    expect(parsePrice(300000)).toBe(300000);
  });

  it("returns null for junk, empty, and non-positive input", () => {
    expect(parsePrice("call me")).toBeNull();
    expect(parsePrice("")).toBeNull();
    expect(parsePrice(null)).toBeNull();
    expect(parsePrice(undefined)).toBeNull();
    expect(parsePrice(0)).toBeNull();
    expect(parsePrice(-5)).toBeNull();
  });
});

describe("scorePriceFit", () => {
  it("is neutral when either side lacks data", () => {
    expect(scorePriceFit(null, 100000, 200000)).toEqual({ points: 0, label: null });
    expect(scorePriceFit(250000, null, null)).toEqual({ points: 0, label: null });
  });

  it("awards full points inside the band, including exact bounds", () => {
    expect(scorePriceFit(150000, 100000, 200000).points).toBe(12);
    expect(scorePriceFit(100000, 100000, 200000).points).toBe(12);
    expect(scorePriceFit(200000, 100000, 200000).points).toBe(12);
  });

  it("handles open-ended bands", () => {
    expect(scorePriceFit(950000, 100000, null).points).toBe(12);
    expect(scorePriceFit(50000, null, 200000).points).toBe(12);
  });

  it("gives partial credit within 15% of a bound, penalty beyond", () => {
    // 200k max: 15% over = 230k
    expect(scorePriceFit(229000, 100000, 200000)).toEqual({ points: 5, label: "near price range" });
    expect(scorePriceFit(231000, 100000, 200000)).toEqual({ points: -8, label: "outside price range" });
    // 100k min: 15% under = 85k
    expect(scorePriceFit(86000, 100000, 200000).points).toBe(5);
    expect(scorePriceFit(84000, 100000, 200000).points).toBe(-8);
  });
});
