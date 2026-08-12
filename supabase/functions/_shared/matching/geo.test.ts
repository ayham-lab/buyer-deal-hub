// @vitest-environment node
import { describe, expect, it } from "vitest";
import { geoTier, normalizeState, parseGeoPrefs } from "./geo.ts";
import type { PropertyQuery } from "./types.ts";

const query = (over: Partial<PropertyQuery> = {}): PropertyQuery => ({
  city: "Philadelphia",
  stateAbbr: "PA",
  stateFull: "Pennsylvania",
  zip: "19143",
  propertyType: "",
  price: null,
  metroCities: ["camden", "trenton", "wilmington", "norristown", "cherry hill"],
  ...over,
});

describe("normalizeState", () => {
  it("resolves abbrevs, full names, and junk", () => {
    expect(normalizeState("pa")).toEqual({ abbr: "PA", full: "Pennsylvania" });
    expect(normalizeState("Pennsylvania")).toEqual({ abbr: "PA", full: "Pennsylvania" });
    expect(normalizeState("Narnia")).toEqual({ abbr: "", full: "" });
    expect(normalizeState("")).toEqual({ abbr: "", full: "" });
  });
});

describe("parseGeoPrefs", () => {
  it("parses SQL-normalizer token soup", () => {
    const g = parseGeoPrefs({
      markets: ["city:philadelphia, pa", "philadelphia", "pa", "pennsylvania", "philadelphia, pa"],
    });
    expect(g.cityStates.has("philadelphia|pa")).toBe(true);
    expect(g.cities.has("philadelphia")).toBe(true);
    expect(g.states.has("pa")).toBe(true);
    expect(g.empty).toBe(false);
  });

  it("parses MarketsInput prefixed format", () => {
    const g = parseGeoPrefs({
      markets: ["State:TX", "City:Chicago, IL", "Zip:75001", "County:Dallas, TX"],
    });
    expect(g.states.has("tx")).toBe(true);
    expect(g.cityStates.has("chicago|il")).toBe(true);
    expect(g.zips.has("75001")).toBe(true);
    expect(g.counties.has("dallas|tx")).toBe(true);
  });

  it("parses bare 'City, ST' and shredded ['City','ST'] formats", () => {
    const bare = parseGeoPrefs({ markets: ["Atlanta, GA"] });
    expect(bare.cityStates.has("atlanta|ga")).toBe(true);
    expect(bare.states.has("ga")).toBe(true);

    const shredded = parseGeoPrefs({ markets: ["Atlanta", "GA"] });
    expect(shredded.cities.has("atlanta")).toBe(true);
    expect(shredded.states.has("ga")).toBe(true);
  });

  it("detects national and statewide keywords without polluting cities", () => {
    const nat = parseGeoPrefs({ markets: ["nationwide"] });
    expect(nat.national).toBe(true);
    expect(nat.cities.size).toBe(0);

    const sw = parseGeoPrefs({ markets: ["any in the state", "pa"] });
    expect(sw.statewide).toBe(true);
    expect(sw.states.has("pa")).toBe(true);
    expect(sw.cities.size).toBe(0);

    expect(parseGeoPrefs({ markets: [], national: true }).national).toBe(true);
  });

  it("merges preferred_zips and buyer home base", () => {
    const g = parseGeoPrefs({
      markets: [],
      preferredZips: ["19143", 8618, "junk"],
      rowCity: "Philadelphia",
      rowState: "Pennsylvania",
    });
    expect(g.zips.has("19143")).toBe(true);
    expect(g.zips.has("08618")).toBe(true);
    expect(g.zips.size).toBe(2);
    expect(g.cityStates.has("philadelphia|pa")).toBe(true);
    expect(g.states.has("pa")).toBe(true);
  });

  it("flags empty preferences", () => {
    const g = parseGeoPrefs({ markets: [] });
    expect(g.empty).toBe(true);
  });
});

describe("geoTier ladder", () => {
  it("orders zip > city > metro > statewide > in-state > national > empty", () => {
    const q = query();
    const zip = geoTier(q, parseGeoPrefs({ markets: ["zip:19143"] }));
    const city = geoTier(q, parseGeoPrefs({ markets: ["philadelphia, pa"] }));
    const metro = geoTier(q, parseGeoPrefs({ markets: ["camden, pa"] }));
    const statewide = geoTier(q, parseGeoPrefs({ markets: ["statewide", "pa"] }));
    const inState = geoTier(q, parseGeoPrefs({ markets: ["pa"] }));
    const national = geoTier(q, parseGeoPrefs({ markets: ["nationwide"] }));
    const empty = geoTier(q, parseGeoPrefs({ markets: [] }));

    expect(zip.base).toBeGreaterThan(city.base);
    expect(city.base).toBeGreaterThan(metro.base);
    expect(metro.base).toBeGreaterThan(statewide.base);
    expect(statewide.base).toBeGreaterThan(inState.base);
    expect(inState.base).toBeGreaterThan(national.base);
    expect(national.base).toBeGreaterThan(empty.base);

    expect(zip.tier).toBe(1);
    expect(city.tier).toBe(1);
    expect(metro.tier).toBe(2);
    expect(statewide.tier).toBe(3);
    expect(inState.tier).toBe(3);
    expect(national.tier).toBe(4);
    expect(empty.tier).toBe(4);
  });

  it("drops buyers with declared but incompatible markets", () => {
    const res = geoTier(query(), parseGeoPrefs({ markets: ["Miami, FL"] }));
    expect(res.dropped).toBe(true);
  });

  it("requires state compatibility for bare-city and metro matches", () => {
    const q = query();
    // Buyer likes "philadelphia" but declares only Ohio → not a city match
    const conflicted = geoTier(q, parseGeoPrefs({ markets: ["philadelphia", "oh"] }));
    expect(conflicted.tier).not.toBe(1);
    // Metro city with no state info at all → still a metro match
    const noState = geoTier(q, parseGeoPrefs({ markets: ["camden"] }));
    expect(noState.tier).toBe(2);
  });

  it("matches zip via preferred_zips", () => {
    const res = geoTier(query(), parseGeoPrefs({ markets: [], preferredZips: ["19143"] }));
    expect(res.tier).toBe(1);
    expect(res.label).toContain("19143");
  });
});
