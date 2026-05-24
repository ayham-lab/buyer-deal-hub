export const BUYER_ACTIVITY_VALUES = [
  "currently_buying",
  "inactive",
  "not_buying_now",
  "uncertain",
] as const;

export type BuyerActivity = (typeof BUYER_ACTIVITY_VALUES)[number];

export const BUYER_ACTIVITY_OPTIONS: { value: BuyerActivity; label: string }[] = [
  { value: "currently_buying", label: "Currently Buying" },
  { value: "inactive", label: "Inactive" },
  { value: "not_buying_now", label: "Not Buying Right Now" },
  { value: "uncertain", label: "Uncertain" },
];

export const BUYER_ACTIVITY_LABEL: Record<string, string> = Object.fromEntries(
  BUYER_ACTIVITY_OPTIONS.map((o) => [o.value, o.label])
);

export const BUYER_ACTIVITY_COLOR: Record<string, string> = {
  currently_buying: "bg-green-100 text-green-700 border-green-200",
  inactive: "bg-muted text-muted-foreground",
  not_buying_now: "bg-amber-100 text-amber-800 border-amber-300",
  uncertain: "bg-slate-100 text-slate-700 border-slate-200",
};

export function normalizeBuyerActivity(v: any): BuyerActivity {
  const s = String(v ?? "").toLowerCase().trim().replace(/[\s-]+/g, "_");
  return (BUYER_ACTIVITY_VALUES as readonly string[]).includes(s)
    ? (s as BuyerActivity)
    : "currently_buying";
}
