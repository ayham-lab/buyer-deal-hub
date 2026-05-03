import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mail, Phone, MapPin, DollarSign, Trash2, Clock } from "lucide-react";
import type { Buyer } from "@/pages/Buyers";

export function BuyerDrawer({ buyer, onClose, onUpdated }: { buyer: Buyer | null; onClose: () => void; onUpdated: () => void }) {
  if (!buyer) return null;

  async function logContact() {
    const { error } = await supabase
      .from("buyers")
      .update({ last_contact_at: new Date().toISOString() })
      .eq("id", buyer!.id);
    if (error) toast.error(error.message);
    else { toast.success("Contact logged"); onUpdated(); onClose(); }
  }

  async function archive() {
    if (!confirm("Archive this buyer?")) return;
    const { error } = await supabase.from("buyers").update({ is_archived: true }).eq("id", buyer!.id);
    if (error) toast.error(error.message);
    else { toast.success("Buyer archived"); onUpdated(); onClose(); }
  }

  return (
    <Sheet open={!!buyer} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="bg-card border-border w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-xl">{buyer.name}</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          <div className="space-y-2 text-sm">
            {buyer.email && <div className="flex items-center gap-2 text-muted-foreground"><Mail className="h-4 w-4" /> {buyer.email}</div>}
            {buyer.phone && <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-4 w-4" /> {buyer.phone}</div>}
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Markets</h4>
            <div className="flex gap-1 flex-wrap">
              {buyer.markets.length ? buyer.markets.map((m) => <Badge key={m} variant="outline">{m}</Badge>) : <span className="text-sm text-muted-foreground">—</span>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1"><DollarSign className="h-3 w-3" />Price Range</h4>
              <div className="text-sm">
                ${(buyer.price_min || 0).toLocaleString()} – ${(buyer.price_max || 0).toLocaleString()}
              </div>
            </div>
            <div>
              <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Deals</h4>
              <div className="text-sm">{buyer.deal_count}</div>
            </div>
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Property Types</h4>
            <div className="flex gap-1 flex-wrap">
              {buyer.property_types.length ? buyer.property_types.map((t) => <Badge key={t} variant="outline">{t}</Badge>) : <span className="text-sm text-muted-foreground">—</span>}
            </div>
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Buyer Type</h4>
            <div className="flex gap-1 flex-wrap">
              {buyer.buyer_types?.length ? buyer.buyer_types.map((t) => <Badge key={t} variant="outline">{t}</Badge>) : <span className="text-sm text-muted-foreground">—</span>}
            </div>
          </div>

          {buyer.criteria_notes && (
            <div>
              <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Criteria Notes</h4>
              <p className="text-sm whitespace-pre-wrap">{buyer.criteria_notes}</p>
            </div>
          )}

          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <Clock className="h-3 w-3" />
            Last contact: {buyer.last_contact_at ? new Date(buyer.last_contact_at).toLocaleString() : "Never"}
          </div>

          <div className="flex gap-2 pt-4 border-t border-border">
            <Button onClick={logContact} className="bg-primary hover:bg-primary-hover flex-1">Log Contact</Button>
            <Button onClick={archive} variant="outline"><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
