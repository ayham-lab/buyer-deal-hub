// TopBar pill showing the current GHL location's credit balance.
// Iframe-only. Click opens the BuyCreditsModal.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveLocation } from "@/contexts/LocationContext";
import { Coins } from "lucide-react";
import { BuyCreditsModal } from "./BuyCreditsModal";

export function CreditsPill() {
  const { activeLocation, isIframed } = useActiveLocation();
  const [balance, setBalance] = useState<number>(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isIframed || !activeLocation?.locationId) return;
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("credit_balances")
        .select("balance")
        .eq("ghl_location_id", activeLocation.locationId)
        .maybeSingle();
      if (!cancelled) setBalance(data?.balance ?? 0);
    };
    load();
    // Refresh on focus + every 30s in case webhook just credited.
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
        title="Buy credits"
      >
        <Coins className="h-3.5 w-3.5" />
        {balance.toLocaleString()} credits
      </button>
      <BuyCreditsModal
        open={open}
        onOpenChange={setOpen}
        ghlLocationId={activeLocation?.locationId ?? null}
      />
    </>
  );
}
