// Modal listing the Unlimited subscription plan + active credit packs.
// Click → calls create-subscription-checkout or create-credit-checkout edge function
// → redirects to Stripe Checkout.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Coins, Infinity as InfinityIcon, Star } from "lucide-react";
import { toast } from "sonner";

interface Pack {
  id: string;
  name: string;
  credits: number;
  price_cents: number;
  stripe_price_id: string | null;
  sort_order: number;
  is_featured: boolean;
}

interface Plan {
  id: string;
  name: string;
  price_cents: number;
  description: string | null;
  stripe_price_id: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ghlLocationId: string | null;
}

export function BuyCreditsModal({ open, onOpenChange, ghlLocationId }: Props) {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [buyingId, setBuyingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      supabase.from("credit_packs").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("subscription_plans").select("*").eq("is_active", true).order("sort_order"),
    ]).then(([p, s]) => {
      setPacks((p.data as Pack[]) || []);
      setPlans((s.data as Plan[]) || []);
      setLoading(false);
    });
  }, [open]);

  async function buyPack(pack: Pack) {
    if (!ghlLocationId) return toast.error("No active location");
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

  async function subscribe(plan: Plan) {
    if (!ghlLocationId) return toast.error("No active location");
    setBuyingId(plan.id);
    const { data, error } = await supabase.functions.invoke("create-subscription-checkout", {
      body: { plan_id: plan.id, ghl_location_id: ghlLocationId },
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-primary" /> Buy Credits
          </DialogTitle>
          <DialogDescription>
            Subscribe for unlimited usage, or buy credit packs as you go.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 py-2">
            {plans.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Subscription
                </h3>
                <div className="grid grid-cols-1 gap-3">
                  {plans.map((plan) => {
                    const dollars = plan.price_cents / 100;
                    return (
                      <div
                        key={plan.id}
                        className="border-2 border-primary rounded-lg p-4 flex flex-col gap-2 bg-primary/5"
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="font-semibold flex items-center gap-2">
                            <InfinityIcon className="h-4 w-4 text-primary" />
                            {plan.name}
                          </span>
                          <span className="text-2xl font-bold text-primary">
                            ${dollars}<span className="text-sm font-normal text-muted-foreground">/mo</span>
                          </span>
                        </div>
                        {plan.description && (
                          <p className="text-sm text-muted-foreground">{plan.description}</p>
                        )}
                        <Button
                          size="sm"
                          className="mt-2"
                          onClick={() => subscribe(plan)}
                          disabled={buyingId === plan.id}
                        >
                          {buyingId === plan.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Subscribe"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <section>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Credit Packs
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {packs.map((p) => {
                  const dollars = p.price_cents / 100;
                  const perCredit = (p.price_cents / 100 / p.credits).toFixed(3);
                  return (
                    <div
                      key={p.id}
                      className={`relative border rounded-lg p-4 flex flex-col gap-2 transition-colors ${
                        p.is_featured
                          ? "border-primary border-2"
                          : "border-border hover:border-primary/60"
                      }`}
                    >
                      {p.is_featured && (
                        <div className="absolute -top-2 left-3 inline-flex items-center gap-1 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full">
                          <Star className="h-2.5 w-2.5 fill-current" />
                          Most Popular
                        </div>
                      )}
                      <div className="flex items-baseline justify-between">
                        <span className="font-semibold">{p.name}</span>
                        <span className="text-2xl font-bold text-primary">${dollars}</span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {p.credits.toLocaleString()} credits
                      </div>
                      <div className="text-xs text-muted-foreground">${perCredit} / credit</div>
                      <Button
                        size="sm"
                        className="mt-2"
                        onClick={() => buyPack(p)}
                        disabled={buyingId === p.id}
                      >
                        {buyingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buy"}
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
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
