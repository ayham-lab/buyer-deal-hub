import { differenceInDays } from "date-fns";

export function ipBadge(ip: string | null) {
  if (!ip) return null;
  const days = differenceInDays(new Date(ip), new Date());
  if (days < 0) return { label: "Expired", cls: "bg-destructive text-destructive-foreground" };
  if (days < 7) return { label: `${days}d IP`, cls: "bg-destructive/20 text-destructive border border-destructive/40" };
  if (days < 14) return { label: `${days}d IP`, cls: "bg-warning/20 text-warning border border-warning/40" };
  return { label: `${days}d IP`, cls: "bg-success/20 text-success border border-success/40" };
}

export const STATUS_COLS: { id: "lead" | "active" | "under_contract" | "closed" | "dead"; label: string }[] = [
  { id: "lead", label: "Lead" },
  { id: "active", label: "Active" },
  { id: "under_contract", label: "Under Contract" },
  { id: "closed", label: "Closed" },
  { id: "dead", label: "Dead" },
];
