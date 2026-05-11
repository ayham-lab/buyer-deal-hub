// Archive Buyers page — globally curated buyer pool. Preview-only contact info
// by default; iframe users can spend credits to permanently reveal a buyer.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { useActiveLocation } from "@/contexts/LocationContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, Phone, Mail, MapPin, Search, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { BuyCreditsModal } from "@/components/credits/BuyCreditsModal";

interface ArchiveBuyer {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  state: string | null;
  preferred_markets: string[];
  price_min: number | null;
  price_max: number | null;
  property_types: string[];
  phone: string | null;
  email: string | null;
  notes: string | null;
  last_active_at: string | null;
}

function relTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  const mo = Math.floor(days / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function priceRange(min: number | null, max: number | null) {
  if (min == null && max == null) return "Any price";
  const f = (n: number) => `$${(n / 1000).toFixed(0)}k`;
  if (min != null && max != null) return `${f(min)} – ${f(max)}`;
  if (min != null) return `${f(min)}+`;
  return `up to ${f(max!)}`;
}

export default function Archive() {
  const { activeLocation, isIframed } = useActiveLocation();
  const [buyers, setBuyers] = useState<ArchiveBuyer[]>([]);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [revealCost, setRevealCost] = useState<number>(3);
  const [loading, setLoading] = useState(true);
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [buyOpen, setBuyOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: b }, { data: cost }, { data: revs }] = await Promise.all([
      supabase
        .from("archive_buyers")
        .select("*")
        .eq("is_active", true)
        .order("last_active_at", { ascending: false, nullsFirst: false }),
      supabase
        .from("credit_action_costs")
        .select("credits")
        .eq("action_key", "archive_reveal")
        .maybeSingle(),
      isIframed && activeLocation?.locationId
        ? supabase
            .from("archive_buyer_reveals")
            .select("buyer_id")
            .eq("ghl_location_id", activeLocation.locationId)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    setBuyers((b as any) || []);
    if (cost?.credits) setRevealCost(cost.credits);
    setRevealed(new Set(((revs as any) || []).map((r: any) => r.buyer_id)));
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isIframed, activeLocation?.locationId]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return buyers;
    return buyers.filter(
      (b) =>
        b.city?.toLowerCase().includes(s) ||
        b.state?.toLowerCase().includes(s) ||
        b.preferred_markets.some((m) => m.toLowerCase().includes(s)) ||
        b.property_types.some((t) => t.toLowerCase().includes(s)),
    );
  }, [buyers, q]);

  async function reveal(b: ArchiveBuyer) {
    if (!isIframed || !activeLocation?.locationId) {
      toast.error("Reveals are only available inside the GHL app.");
      return;
    }
    setRevealingId(b.id);
    const { data, error } = await supabase.rpc("reveal_archive_buyer", {
      p_location: activeLocation.locationId,
      p_buyer_id: b.id,
    });
    setRevealingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    const res = data as any;
    if (res?.success) {
      setRevealed((prev) => new Set(prev).add(b.id));
      toast.success("Buyer revealed");
      return;
    }
    if (res?.error === "insufficient_credits") {
      toast.error("Not enough credits");
      setBuyOpen(true);
      return;
    }
    toast.error(res?.error || "Reveal failed");
  }

  return (
    <AppLayout>
      <PageHeader
        title="Archive Buyers"
        subtitle="Curated cash buyer pool. Reveal contact details to start a deal."
      />
      <div className="p-6 lg:p-8 space-y-5">
        <div className="flex items-center gap-3 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search city, state, market, type…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No archive buyers found.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((b) => {
              const isRevealed = revealed.has(b.id);
              const initial = (b.first_name || b.full_name || "?").trim().charAt(0).toUpperCase();
              return (
                <div
                  key={b.id}
                  className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3 hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/15 text-primary font-semibold flex items-center justify-center">
                      {initial}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm truncate">
                        {isRevealed
                          ? b.full_name ||
                            [b.first_name, b.last_name].filter(Boolean).join(" ") ||
                            "Unnamed buyer"
                          : `${initial}. ${b.last_name ? b.last_name.charAt(0) + "." : "•••"}`}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {[b.city, b.state].filter(Boolean).join(", ") || "Location undisclosed"}
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {relTime(b.last_active_at)}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {b.preferred_markets.slice(0, 4).map((m) => (
                      <Badge key={m} variant="secondary" className="text-[10px]">
                        {m}
                      </Badge>
                    ))}
                    {b.preferred_markets.length > 4 && (
                      <Badge variant="outline" className="text-[10px]">
                        +{b.preferred_markets.length - 4}
                      </Badge>
                    )}
                  </div>

                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {priceRange(b.price_min, b.price_max)}
                    </span>
                    {b.property_types.length > 0 && (
                      <> · {b.property_types.join(", ")}</>
                    )}
                  </div>

                  {/* Contact section */}
                  <div className="relative mt-1 border-t border-border pt-3">
                    {isRevealed ? (
                      <div className="space-y-1.5 text-sm">
                        {b.phone && (
                          <a
                            href={`tel:${b.phone}`}
                            className="flex items-center gap-2 text-foreground hover:text-primary"
                          >
                            <Phone className="h-3.5 w-3.5" /> {b.phone}
                          </a>
                        )}
                        {b.email && (
                          <a
                            href={`mailto:${b.email}`}
                            className="flex items-center gap-2 text-foreground hover:text-primary truncate"
                          >
                            <Mail className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{b.email}</span>
                          </a>
                        )}
                        {b.notes && (
                          <p className="text-xs text-muted-foreground italic mt-1">{b.notes}</p>
                        )}
                        {!b.phone && !b.email && !b.notes && (
                          <p className="text-xs text-muted-foreground">No contact details on file.</p>
                        )}
                      </div>
                    ) : (
                      <div className="relative">
                        {/* Blurred preview */}
                        <div className="space-y-1.5 text-sm select-none blur-sm pointer-events-none">
                          <div className="flex items-center gap-2">
                            <Phone className="h-3.5 w-3.5" /> (•••) •••-••••
                          </div>
                          <div className="flex items-center gap-2">
                            <Mail className="h-3.5 w-3.5" /> ••••••••@••••.com
                          </div>
                        </div>
                        {/* Gradient overlay + CTA */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-gradient-to-b from-card/70 via-card/90 to-card rounded">
                          <Lock className="h-4 w-4 text-muted-foreground" />
                          {isIframed ? (
                            <Button
                              size="sm"
                              onClick={() => reveal(b)}
                              disabled={revealingId === b.id}
                              className="h-7 text-xs"
                            >
                              {revealingId === b.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <>
                                  <Sparkles className="h-3 w-3" />
                                  Reveal — {revealCost} credit{revealCost === 1 ? "" : "s"}
                                </>
                              )}
                            </Button>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">
                              Open inside GHL to reveal
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <BuyCreditsModal
        open={buyOpen}
        onOpenChange={setBuyOpen}
        ghlLocationId={activeLocation?.locationId ?? null}
      />
    </AppLayout>
  );
}
