import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Mail, Phone, Lock, Check, CheckCircle2 } from "lucide-react";

/**
 * Read-only detail view for a Buyer Finder match that is not (yet) a row in the
 * user's own `buyers` table — i.e. Buyer Archive and public-data results.
 * Rolodex matches open the editable BuyerDrawer instead.
 *
 * Contact fields stay masked until the buyer has been revealed, mirroring the
 * card, so opening the dialog never leaks paid-for data.
 */
export type BuyerMatchDetails = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  markets?: string[];
  property_types?: string[];
  price_min?: number | null;
  price_max?: number | null;
  source?: string | null;
  score: number;
  reason: string;
  revealed?: boolean;
  profile_complete?: boolean;
  profile_completeness?: number;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function Chips({ values }: { values?: string[] }) {
  if (!values || values.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {values.map((v) => <Badge key={v} variant="outline" className="text-[10px]">{v}</Badge>)}
    </div>
  );
}

function priceRange(min?: number | null, max?: number | null) {
  if (min == null && max == null) return "—";
  return `$${(min || 0).toLocaleString()} – $${(max || 0).toLocaleString()}`;
}

export function BuyerMatchDetailsDialog({
  match,
  displayName,
  revealCost,
  onReveal,
  onAdd,
  onClose,
}: {
  match: BuyerMatchDetails | null;
  /** Pre-masked when the buyer has not been revealed. */
  displayName: string;
  revealCost?: number;
  onReveal?: () => void;
  onAdd?: () => void;
  onClose: () => void;
}) {
  if (!match) return null;
  const revealed = !!match.revealed;

  return (
    <Dialog open={!!match} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-card border-border sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2 pr-6">
            <span className="truncate">{displayName}</span>
            {match.profile_complete && (
              <span title={`Complete profile (${match.profile_completeness ?? 100}%)`}>
                <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            {match.reason || "Buyer match details."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">Match score {Math.round(match.score)}</Badge>
            {typeof match.profile_completeness === "number" && (
              <Badge variant="secondary" className="text-[10px]">
                Profile {match.profile_completeness}%
              </Badge>
            )}
          </div>

          <Separator />

          <Field label="Contact">
            {revealed ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{match.email || "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span>{match.phone || "—"}</span>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="select-none blur-sm text-muted-foreground tracking-wider">•••••••@••••••.com</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="select-none blur-sm text-muted-foreground tracking-wider">(•••) •••-••••</span>
                </div>
              </div>
            )}
          </Field>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <Field label="Price Range">{priceRange(match.price_min, match.price_max)}</Field>
            <Field label="Source">
              {revealed ? (match.source || "—") : <span className="text-muted-foreground">Hidden</span>}
            </Field>
          </div>

          <Field label="Markets"><Chips values={match.markets} /></Field>
          <Field label="Property Types"><Chips values={match.property_types} /></Field>

          {(onReveal || onAdd) && (
            <div className="flex gap-2 pt-2 border-t border-border">
              {revealed
                ? onAdd && (
                    <Button size="sm" variant="outline" onClick={onAdd} className="flex-1 h-8 text-xs">
                      <Check className="h-3 w-3 mr-1" /> Add to Rolodex
                    </Button>
                  )
                : onReveal && (
                    <Button
                      size="sm"
                      onClick={onReveal}
                      className="flex-1 h-8 text-xs bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                      <Lock className="h-3 w-3 mr-1" /> Reveal Contact
                      {typeof revealCost === "number" ? ` (${revealCost} credits)` : ""}
                    </Button>
                  )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
