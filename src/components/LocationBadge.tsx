// Small badge showing which sub-account a row belongs to.
// Hidden when the user isn't in an operator group (only 1 effective location).
import { Badge } from "@/components/ui/badge";
import { getEffectiveLocationIds, getLocationNamesMap } from "@/lib/locationScope";

export function LocationBadge({
  locationId,
  className,
}: {
  locationId: string | null | undefined;
  className?: string;
}) {
  if (!locationId) return null;
  const effective = getEffectiveLocationIds();
  if (!effective || effective.length < 2) return null;
  const names = getLocationNamesMap();
  const label = names[locationId] || locationId.slice(0, 8);
  return (
    <Badge variant="secondary" className={className} title={`Source: ${label}`}>
      {label}
    </Badge>
  );
}
