export const EXIT_STRATEGIES: { key: string; label: string; cls: string }[] = [
  { key: "wholesale",        label: "Wholesale",        cls: "bg-blue-500/15 text-blue-300 border border-blue-500/30" },
  { key: "novation",         label: "Novation",         cls: "bg-purple-500/15 text-purple-300 border border-purple-500/30" },
  { key: "subject_to",       label: "Subject To",       cls: "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30" },
  { key: "owner_financing",  label: "Owner Financing",  cls: "bg-teal-500/15 text-teal-300 border border-teal-500/30" },
  { key: "flip",             label: "Flip",             cls: "bg-orange-500/15 text-orange-300 border border-orange-500/30" },
  { key: "wholetail",        label: "Wholetail",        cls: "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30" },
  { key: "rental",           label: "Rental",           cls: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" },
  { key: "internal_listing", label: "Internal Listing", cls: "bg-pink-500/15 text-pink-300 border border-pink-500/30" },
  { key: "listing_referral", label: "Listing Referral", cls: "bg-amber-500/15 text-amber-300 border border-amber-500/30" },
];

export const EXIT_STRATEGY_MAP: Record<string, { label: string; cls: string }> =
  Object.fromEntries(EXIT_STRATEGIES.map((s) => [s.key, { label: s.label, cls: s.cls }]));

export function exitStrategyLabel(key: string): string {
  return EXIT_STRATEGY_MAP[key]?.label || key;
}
