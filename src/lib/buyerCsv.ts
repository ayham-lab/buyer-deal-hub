// Single source of truth for the Buyer CSV round-trip (export + import).
// Keep export columns and import-accepted headers in lockstep so a user can:
//   Export CSV → edit in Excel → re-import without data loss.
//
// Multi-value cells are joined with "; " (the import side also accepts "|" for
// backward compatibility with older exports/templates).

import type { Buyer } from "@/pages/Buyers";

// Ordered list of columns we emit on export and accept on import.
export const BUYER_CSV_COLUMNS = [
  "first_name",
  "last_name",
  "name",
  "company_name",
  "email",
  "phone",
  "markets",
  "property_types",
  "other_property_type",
  "buyer_types",
  "buyer_frequency",
  "price_min",
  "price_max",
  "buyer_status",
  "buyer_activity",
  "activity_resume_date",
  "source",
  "criteria_notes",
  "previous_deals",
  "experience",
  // Read-only / informational — exported for backup, IGNORED on import so
  // server-managed values are never clobbered.
  "deals_purchased",
  "deal_count",
  "last_contact_at",
  "created_at",
  "updated_at",
] as const;

export type BuyerCsvColumn = (typeof BUYER_CSV_COLUMNS)[number];

// Columns the importer must NOT write to the DB (server-managed or computed).
export const IMPORT_READONLY_COLUMNS = new Set<string>([
  "deals_purchased",
  "deal_count",
  "last_contact_at",
  "created_at",
  "updated_at",
]);

export const BUYER_STATUS_VALUES = [
  "not_vetted",
  "vetted",
  "vetted_and_closed",
  "repeat",
  "recurring",
] as const;

const MULTI_SEP = "; ";

function joinList(v: string[] | null | undefined): string {
  return (v ?? []).filter(Boolean).join(MULTI_SEP);
}

export function buyerToCsvRow(b: Buyer): Record<BuyerCsvColumn, unknown> {
  return {
    first_name: b.first_name ?? "",
    last_name: b.last_name ?? "",
    name: b.name ?? "",
    company_name: b.company_name ?? "",
    email: b.email ?? "",
    phone: b.phone ?? "",
    markets: joinList(b.markets),
    property_types: joinList(b.property_types),
    other_property_type: b.other_property_type ?? "",
    buyer_types: joinList(b.buyer_types),
    buyer_frequency: joinList(b.buyer_frequency),
    price_min: b.price_min ?? "",
    price_max: b.price_max ?? "",
    buyer_status: b.buyer_status ?? "",
    buyer_activity: (b as any).buyer_activity ?? "currently_buying",
    activity_resume_date: (b as any).activity_resume_date ?? "",
    source: b.source ?? "",
    criteria_notes: b.criteria_notes ?? "",
    previous_deals: b.previous_deals ?? "",
    experience: b.experience ?? "",
    deals_purchased: b.deals_purchased ?? 0,
    deal_count: b.deal_count ?? 0,
    last_contact_at: b.last_contact_at ?? "",
    created_at: b.created_at ?? "",
    updated_at: (b as unknown as { updated_at?: string }).updated_at ?? "",
  };
}

// Template CSV shown via the "Download CSV template" button in the importer.
// Only includes the writable columns to avoid confusing users with read-only
// fields they shouldn't fill in.
const WRITABLE_COLUMNS = BUYER_CSV_COLUMNS.filter(
  (c) => !IMPORT_READONLY_COLUMNS.has(c)
);

const TEMPLATE_EXAMPLE: Record<string, string> = {
  first_name: "John",
  last_name: "Doe",
  name: "",
  company_name: "Acme Capital",
  email: "john@example.com",
  phone: "555-1234",
  markets: "Atlanta, GA; Tampa, FL",
  property_types: "SFH; MFH 2-4",
  other_property_type: "",
  buyer_types: "Fix & Flip; Buy & Hold",
  buyer_frequency: "Full time Buyer",
  price_min: "75000",
  price_max: "250000",
  buyer_status: "not_vetted",
  source: "Referral",
  criteria_notes: "Cash buyer prefers off-market",
  previous_deals: "",
  experience: "",
};

function csvEscape(s: string): string {
  if (/["\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const BUYER_TEMPLATE_CSV =
  WRITABLE_COLUMNS.join(",") +
  "\n" +
  WRITABLE_COLUMNS.map((c) => csvEscape(TEMPLATE_EXAMPLE[c] ?? "")).join(",") +
  "\n";
