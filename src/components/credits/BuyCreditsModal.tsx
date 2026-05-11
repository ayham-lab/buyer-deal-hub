// Modal listing active credit packs. Click → calls create-credit-checkout
// edge function → redirects to Stripe Checkout.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Coins } from "lucide-react";
import { toast } from "sonner";

interface Pack {
  id: string;
  name: string;
  credits: number;
  price_cents: number;
  stripe_price_id: string | null;
  sort_order: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ghlLocationId: string | null;
}

export function BuyCreditsModal({ open, onOpenChange, ghlLocationId }: Props) {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(false);
  const [buyingId, setBuyingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from("credit_packs")
      .select("*")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => {
        setPacks((data as Pack[]) || []);
        setLoading(false);
      });
  }, [open]);

  async function buy(pack: Pack) {
    if (!ghlLocationId) {
      toast.error("No active location");
      return;
    }
    setBuyingId(pack.id);
    const { data, error } = await supabase.functions.invoke("create-credit-checkout", {
      body: { pack_id: pack.id, ghl_location_id: ghlLocationId },
    });
    setBuyingId(null);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Checkout failed");
      return;
    }
    const url = (data as any)?.url;
    if (url) window.location.href = url;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-primary" /> Buy Credits
          </DialogTitle>
          <DialogDescription>
            Credits are used for skiptraces, archive reveals, and public records lookups.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
            {packs.map((p) => {
              const dollars = p.price_cents / 100;
              const perCredit = (p.price_cents / 100 / p.credits).toFixed(3);
              return (
                <div
                  key={p.id}
                  className="border border-border rounded-lg p-4 flex flex-col gap-2 hover:border-primary/60 transition-colors"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-semibold">{p.name}</span>
                    <span className="text-2xl font-bold text-primary">${dollars}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {p.credits.toLocaleString()} credits
                  </div>
                  <div className="text-xs text-muted-foreground">
                    ${perCredit} / credit
                  </div>
                  <Button
                    size="sm"
                    className="mt-2"
                    onClick={() => buy(p)}
                    disabled={buyingId === p.id}
                  >
                    {buyingId === p.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Buy"
                    )}
                  </Button>
                </div>
              );
            })}
            {packs.length === 0 && (
              <p className="col-span-full text-sm text-muted-foreground text-center py-6">
                No credit packs available.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
