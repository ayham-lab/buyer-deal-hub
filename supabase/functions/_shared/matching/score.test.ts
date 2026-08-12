// @vitest-environment node
import { describe, expect, it } from "vitest";
import { normalizePropertyTypes } from "./propertyTypes.ts";
import { archiveBuyerToFacts, rolodexBuyerToFacts, scoreBuyer } from "./score.ts";
import type { PropertyQuery } from "./types.ts";

const query = (over: Partial<PropertyQuery> = {}): PropertyQuery => ({
  city: "Philadelphia",
  stateAbbr: "PA",
  stateFull: "Pennsylvania",
  zip: "19143",
  propertyType: "SFH",
  price: 250000,
  metroCities: ["camden", "trenton"],
  ...over,
});

describe("normalizePropertyTypes", () => {
  it("passes canonical UI tokens through", () => {
    const s = normalizePropertyTypes(["SFH", "MFH 2-4", "Land"]);
    expect([...s].sort()).toEqual(["Land", "MFH 2-4", "SFH"].sort());
  });

  it("maps free-text aliases onto canonical tokens", () => {
    expect(normalizePropertyTypes(["Single Family"]).has("SFH")).toBe(true);
    expect(normalizePropertyTypes(["sfr"]).has("SFH")).toBe(true);
    expect(normalizePropertyTypes(["townhouse"]).has("SFH")).toBe(true);
    expect(normalizePropertyTypes(["Duplex"]).has("MFH 2-4")).toBe(true);
    expect(normalizePropertyTypes(["apartments 5+"]).has("MFH 5+")).toBe(true);
    expect(normalizePropertyTypes(["vacant lot"]).has("Land")).toBe(true);
    expect(normalizePropertyTypes(["mobile home"]).has("Mobile")).toBe(true);
    expect(normalizePropertyTypes(["mixed use retail"]).has("Commercial")).toBe(true);
  });

  it("maps generic multifamily to both MFH buckets, unit-counted to one", () => {
    const generic = normalizePropertyTypes(["Multi Family"]);
    expect(generic.has("MFH 2-4")).toBe(true);
    expect(generic.has("MFH 5+")).toBe(true);
    const counted = normalizePropertyTypes(["multi family 2-4"]);
    expect(counted.has("MFH 2-4")).toBe(true);
    expect(counted.has("MFH 5+")).toBe(false);
  });

  it("ignores unmappable strings", () => {
    expect(normalizePropertyTypes(["castles", ""]).size).toBe(0);
  });
});

describe("scoreBuyer composition", () => {
  it("scores a tier-1 buyer with perfect fit in the high 90s", () => {
    const facts = archiveBuyerToFacts({
      full_name: "Jane Investor",
      email: "jane@x.com",
      phone: "5551234567",
      preferred_markets: ["philadelphia, pa"],
      preferred_zips: ["19143"],
      property_types: ["SFH"],
      price_min: 100000,
      price_max: 300000,
      city: "Philadelphia",
      state: "Pennsylvania",
      status: "vetted_and_closed",
      completed_transaction: true,
      system_deals_purchased: 4,
    });
    const res = scoreBuyer(query(), facts);
    expect(res.tier).toBe(1);
    expect(res.score).toBeGreaterThanOrEqual(90);
    expect(res.reason).toContain("zip match 19143");
    expect(res.reason).toContain("price fits budget");
    expect(res.reason).toContain("buys SFH");
    expect(res.reason).toContain("proven closer");
    expect(res.reason).toContain("complete profile");
  });

  it("floors a national inactive buyer near zero", () => {
    const facts = archiveBuyerToFacts({
      preferred_markets: ["nationwide"],
      property_types: ["Land"],
      price_min: 500000,
      price_max: 900000,
      national: true,
      buyer_activity: "inactive",
    });
    const res = scoreBuyer(query(), facts);
    expect(res.tier).toBe(4);
    expect(res.score).toBeLessThanOrEqual(10);
    expect(res.reason).toContain("not currently buying");
  });

  it("drops buyers with incompatible declared markets", () => {
    const facts = archiveBuyerToFacts({ preferred_markets: ["miami, fl"] });
    expect(scoreBuyer(query(), facts).dropped).toBe(true);
  });

  it("lets a well-fitting metro buyer outrank a mismatched city buyer", () => {
    const cityMismatch = scoreBuyer(query(), archiveBuyerToFacts({
      preferred_markets: ["philadelphia, pa"],
      property_types: ["Land"],
      price_min: 500000,
      price_max: 900000,
    }));
    const metroFit = scoreBuyer(query(), archiveBuyerToFacts({
      preferred_markets: ["camden, pa"],
      property_types: ["SFH"],
      price_min: 100000,
      price_max: 300000,
      status: "vetted_and_closed",
    }));
    expect(cityMismatch.tier).toBe(1);
    expect(metroFit.tier).toBe(2);
    expect(metroFit.score).toBeGreaterThan(cityMismatch.score);
  });

  it("is neutral on price/type when the query omits them", () => {
    const facts = archiveBuyerToFacts({ preferred_markets: ["philadelphia, pa"] });
    const res = scoreBuyer(query({ propertyType: "", price: null, zip: "" }), facts);
    expect(res.tier).toBe(1);
    expect(res.reason).not.toContain("price");
    expect(res.reason).not.toContain("property");
  });
});

describe("adapters", () => {
  it("archiveBuyerToFacts reads archive-specific columns", () => {
    const f = archiveBuyerToFacts({
      preferred_markets: ["pa"],
      status: "vetted",
      buyer_activity: "uncertain",
      completed_transaction: true,
      system_deals_purchased: 2,
      price_min: 1,
      price_max: 2,
    });
    expect(f.status).toBe("vetted");
    expect(f.activity).toBe("uncertain");
    expect(f.completedTransaction).toBe(true);
    expect(f.dealsPurchased).toBe(2);
  });

  it("rolodexBuyerToFacts reads rolodex-specific columns", () => {
    const f = rolodexBuyerToFacts({
      markets: ["City:Chicago, IL"],
      property_types: [],
      other_property_type: "duplexes",
      buyer_status: "repeat",
      buyer_activity: "currently_buying",
      deals_purchased: 5,
    });
    expect(f.geo.cityStates.has("chicago|il")).toBe(true);
    expect(f.propertyTypes.has("MFH 2-4")).toBe(true);
    expect(f.status).toBe("repeat");
    expect(f.dealsPurchased).toBe(5);
    expect(f.completedTransaction).toBe(true);
  });
});
