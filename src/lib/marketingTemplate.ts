// Generates a standardized marketing template from a deal + dispo user profile.
// Fields missing on the deal are emitted as "[ADD]" placeholders so the user
// knows what still needs to be filled in.

export interface DispoContact {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
}

const PLACEHOLDER = "[ADD]";

function money(v: any): string {
  if (v === null || v === undefined || v === "") return PLACEHOLDER;
  const n = Number(v);
  if (!Number.isFinite(n)) return PLACEHOLDER;
  return `$${n.toLocaleString()}`;
}

function txt(v: any): string {
  if (v === null || v === undefined) return PLACEHOLDER;
  const s = String(v).trim();
  return s.length ? s : PLACEHOLDER;
}

function bedsBaths(d: any): string {
  const b = d.beds ?? "";
  const ba = d.baths ?? "";
  if (b === "" && ba === "") return PLACEHOLDER;
  return `${b !== "" ? b : "?"}/${ba !== "" ? ba : "?"}`;
}

function address(d: any): string {
  const parts = [d.property_address, d.city, d.state].filter(Boolean);
  return parts.length ? parts.join(", ") : PLACEHOLDER;
}

export function generateMarketingTemplate(deal: any, contact: DispoContact = {}): string {
  // Starting Price → asking_price; Projected ARV → arv
  // Non-Refundable EMD → non_refundable_emd, else emd_amount, else $5,000 default
  const emdSource = deal.non_refundable_emd ?? deal.emd_amount;
  const emd = emdSource ? money(emdSource) : "$5,000";

  const lines = [
    `Address: ${address(deal)}`,
    ``,
    `Starting Price: ${money(deal.asking_price)}`,
    `Projected ARV: ${money(deal.arv)}`,
    `--------------------------------`,
    `Property Details`,
    `Beds/Baths: ${bedsBaths(deal)}`,
    `Living SqFt: ${txt(deal.living_sqft)}`,
    `Lot Size: ${txt(deal.lot_size)}`,
    `Year Built: ${txt(deal.year_built)}`,
    `Property Type: ${txt(deal.property_type)}`,
    `Occupancy: ${txt(deal.occupancy)}`,
    `Access: ${txt(deal.access)}`,
    `---------------------------------`,
    `Property Condition`,
    `Rehab Level: ${txt(deal.rehab_level)}`,
    `Roof Age: ${txt(deal.roof_age)}`,
    `Plumbing Age: ${txt(deal.plumbing_age)}`,
    `Electrical Age: ${txt(deal.electrical_age)}`,
    `AC Age: ${txt(deal.ac_age)}`,
    `Water Heater: ${txt(deal.water_heater_age)}`,
    `HVAC (Heater) Age: ${txt(deal.hvac_age)}`,
    `---------------------------------`,
    `SOLD COMPS:`,
    `${txt(deal.sold_comps)}`,
    ``,
    ``,
    `Non-Refundable EMD: ${emd}`,
    ``,
    `Contact`,
    `Call ${txt(contact.name)} @ ${txt(contact.phone)}`,
    `Email: ${txt(contact.email)}`,
    ``,
    `DISCLAIMER: This is an assignment of contract. A legally binding purchasing contract with memorandum has been signed with the Seller giving this company exclusive rights to purchase the property.`,
  ];

  return lines.join("\n");
}

// Fields the marketing tab needs to surface as editable inputs so users can
// fill in template-only data without leaving the marketing screen.
export const MARKETING_PROPERTY_FIELDS: { key: string; label: string; type: "text" | "number" }[] = [
  { key: "beds", label: "Beds", type: "number" },
  { key: "baths", label: "Baths", type: "number" },
  { key: "living_sqft", label: "Living SqFt", type: "number" },
  { key: "lot_size", label: "Lot Size", type: "text" },
  { key: "year_built", label: "Year Built", type: "number" },
  { key: "property_type", label: "Property Type", type: "text" },
  { key: "occupancy", label: "Occupancy", type: "text" },
  { key: "access", label: "Access", type: "text" },
];

export const MARKETING_CONDITION_FIELDS: { key: string; label: string }[] = [
  { key: "rehab_level", label: "Rehab Level" },
  { key: "roof_age", label: "Roof Age" },
  { key: "plumbing_age", label: "Plumbing Age" },
  { key: "electrical_age", label: "Electrical Age" },
  { key: "ac_age", label: "AC Age" },
  { key: "water_heater_age", label: "Water Heater Age" },
  { key: "hvac_age", label: "HVAC (Heater) Age" },
];
