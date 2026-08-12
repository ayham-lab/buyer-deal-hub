export type CanonicalPropertyType =
  | "SFH"
  | "MFH 2-4"
  | "MFH 5+"
  | "Commercial"
  | "Land"
  | "Mobile";

export interface PropertyQuery {
  city: string;
  stateAbbr: string;
  stateFull: string;
  zip: string;
  propertyType: CanonicalPropertyType | "";
  price: number | null;
  metroCities: string[];
}

export interface GeoPref {
  zips: Set<string>;
  /** "city|st" pairs, lowercase, state as 2-letter abbr */
  cityStates: Set<string>;
  /** bare city names with no state attached */
  cities: Set<string>;
  /** "county|st" pairs, lowercase */
  counties: Set<string>;
  /** lowercase 2-letter state abbrevs */
  states: Set<string>;
  statewide: boolean;
  national: boolean;
  empty: boolean;
}

export interface BuyerFacts {
  geo: GeoPref;
  propertyTypes: Set<CanonicalPropertyType>;
  hasDeclaredTypes: boolean;
  priceMin: number | null;
  priceMax: number | null;
  status: string | null;
  activity: string | null;
  completedTransaction: boolean;
  dealsPurchased: number;
  completeness: number;
  profileComplete: boolean;
}

export interface MatchResult {
  score: number;
  tier: 1 | 2 | 3 | 4;
  reason: string;
  dropped: boolean;
}
