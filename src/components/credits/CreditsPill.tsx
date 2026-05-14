// TopBar pill showing the current GHL location's credit balance.
// If the location has an active Unlimited subscription, shows "Unlimited ∞" instead.
// Iframe-only. Click opens the BuyCreditsModal.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveLocation } from "@/contexts/LocationContext";
import { Coins, Infinity as InfinityIcon } from "lucide-react";
import { BuyCreditsModal } from "./BuyCreditsModal";

export function CreditsPill() {
  const { activeLocation, isIframed } = useActiveLocation();
  const [balance, setBalance] = useState<number>(0);
  const [unlimited, setUnlimited] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isIframed || !activeLocation?.locationId) return;
    let cancelled = false;
    const load = async () => {
      const [{ data: bal }, { data: sub }] = await Promise.all([
        supabase
          .from("credit_balances")
          .select("balance")
          .eq("ghl_location_id", activeLocation.locationId)
          .maybeSingle(),
        supabase
          .from("subscriptions")
          .select("subscription_status,current_period_end")
          .eq("ghl_location_id", activeLocation.locationId)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setBalance(bal?.balance ?? 0);
      const isActive =
        sub?.subscription_status === "active" &&
        (!sub?.current_period_end || new Date(sub.current_period_end) > new Date());
      setUnlimited(!!isActive);
    };
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    const t = setInterval(load, 30000);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      clearInterval(t);
    };
  }, [isIframed, activeLocation?.locationId]);

  if (!isIframed) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary/10 text-primary hover:bg-primary/20 text-xs font-semibold transition-colors"
        title={unlimited ? "Unlimited subscription active" : "Buy credits"}
      >
        {unlimited ? (
          <>
            <InfinityIcon className="h-3.5 w-3.5" />
            Unlimited
          </>
        ) : (
          <>
            <Coins className="h-3.5 w-3.5" />
            {balance.toLocaleString()} credits
          </>
        )}
      </button>
      <BuyCreditsModal
        open={open}
        onOpenChange={setOpen}
        ghlLocationId={activeLocation?.locationId ?? null}
      />
    </>
  );
}
