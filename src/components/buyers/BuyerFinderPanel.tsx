import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { scopeToLocation, withLocation } from "@/lib/locationScope";
import { useAuth } from "@/hooks/useAuth";
import { useActiveLocation } from "@/contexts/LocationContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BuyCreditsModal } from "@/components/credits/BuyCreditsModal";
import { MapPin, Sparkles, Loader2, Users, Archive, Globe, Lock, Mail, Phone, Check, Briefcase, X, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const PROPERTY_TYPES = ["SFH", "MFH 2-4", "MFH 5+", "Commercial", "Land", "Mobile"];

type DealOption = {
  id: string;
  property_address: string | null;
  city: string | null;
  state: string | null;
  property_type: string | null;
  asking_price: number | null;
  contract_price: number | null;
  arv: number | null;
};

type Match = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  markets?: string[];
  property_types?: string[];
  price_min?: number;
  price_max?: number;
  source?: string | null;
  score: number;
  reason: string;
  revealed?: boolean;
  profile_complete?: boolean;
  profile_completeness?: number;
};

type ArchiveState = "admin" | "subscription" | "pay_per_reveal";

type Results = {
  rolodex: Match[];
  archive: Match[];
  archive_locked: boolean;
  archive_count: number;
  archive_state: ArchiveState;
  archive_reveal_cost: number;
  archive_credit_balance: number;
  archive_location_label: string;
  public: Match[];
  public_available: boolean;
};

export function BuyerFinderPanel({ onBuyerAdded }: { onBuyerAdded?: () => void }) {
  const { user } = useAuth();
  const { activeLocation } = useActiveLocation();
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [zip, setZip] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [priceHint, setPriceHint] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Results | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);

  const [deals, setDeals] = useState<DealOption[]>([]);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [dealsLoading, setDealsLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    setDealsLoading(true);
    scopeToLocation(
      supabase
        .from("deals")
        .select("id, property_address, city, state, property_type, asking_price, contract_price, arv")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(300)
    ).then(({ data }) => {
      setDeals(((data as any) || []) as DealOption[]);
      setDealsLoading(false);
    });
  }, [user, activeLocation?.locationId]);

  const selectedDeal = useMemo(
    () => deals.find((d) => d.id === selectedDealId) || null,
    [deals, selectedDealId],
  );

  function applyDeal(d: DealOption) {
    const addr = (d.property_address || "").trim();
    const streetPart = addr.includes(",") ? addr.split(",")[0].trim() : addr;
    const zipMatch = addr.match(/\b(\d{5})(?:-\d{4})?\b/);
    setStreet(streetPart);
    setCity((d.city || "").trim());
    setStateCode(((d.state || "").trim().toUpperCase()).slice(0, 2));
    setZip(zipMatch ? zipMatch[1] : "");
    if (d.property_type && PROPERTY_TYPES.includes(d.property_type)) {
      setPropertyType(d.property_type);
    }
    const price = d.asking_price ?? d.contract_price ?? d.arv ?? null;
    if (price != null) setPriceHint(String(price));
    setSelectedDealId(d.id);
  }

  function clearDeal() { setSelectedDealId(null); }

  async function findMatches() {
    if (!stateCode.trim() && !zip.trim() && !city.trim()) {
      toast.error("Provide at least a State, ZIP, or City");
      return;
    }
    const locParts = [city.trim(), stateCode.trim().toUpperCase()].filter(Boolean).join(", ");
    const address = [street.trim(), locParts, zip.trim()].filter(Boolean).join(street.trim() ? ", " : " ").trim();
    setLoading(true);
    setResults(null);
    try {
      const { data, error } = await supabase.functions.invoke("find-buyers", {
        body: {
          address,
          street: street.trim(),
          city: city.trim(),
          state: stateCode.trim().toUpperCase(),
          zip: zip.trim(),
          propertyType,
          priceHint,
          ghl_location_id: activeLocation?.locationId ?? null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResults(data as Results);
      const total = (data?.rolodex?.length || 0) + (data?.archive?.length || 0) + (data?.public?.length || 0);
      if (!total && !data?.archive_locked) toast.info("No matches found.");
    } catch (e: any) {
      toast.error(e.message || "Failed to find buyers");
    } finally {
      setLoading(false);
    }
  }

  async function addToMine(b: Match) {
    if (!user) return;
    const { error } = await supabase.from("buyers").insert(withLocation({
      user_id: user.id,
      name: b.name,
      email: b.email,
      phone: b.phone,
      markets: b.markets,
      property_types: b.property_types,
      price_min: b.price_min,
      price_max: b.price_max,
      source: b.source ?? undefined,
    }));
    if (error) toast.error(error.message);
    else { toast.success(`${b.name} added to your buyers`); onBuyerAdded?.(); }
  }

  async function revealArchiveBuyer(b: Match) {
    if (!activeLocation?.locationId || !results) return;
    const { data, error } = await supabase.rpc("reveal_archive_buyer", {
      p_location: activeLocation.locationId,
      p_buyer_id: b.id,
    });
    if (error) { toast.error(error.message); return; }
    const r = data as any;
    if (!r?.success) {
      if (r?.error === "insufficient_credits") {
        toast.error("Not enough credits — buy a pack to continue");
        setBuyOpen(true);
      } else { toast.error("Reveal failed"); }
      return;
    }
    const { data: row } = await supabase.rpc("get_archive_buyer_contact" as any, {
      p_location: activeLocation.locationId,
      p_id: b.id,
    });
    const contact = (row && typeof row === "object") ? (row as any) : {};
    setResults({
      ...results,
      archive: results.archive.map((m) =>
        m.id === b.id
          ? { ...m, revealed: true, email: contact.email ?? null, phone: contact.phone ?? null }
          : m,
      ),
      archive_credit_balance: Math.max(0, (results.archive_credit_balance ?? 0) - results.archive_reveal_cost),
    });
    toast.success(`Revealed ${b.name}`);
  }

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-4">
        <div>
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2">
            <Briefcase className="h-3.5 w-3.5" /> Pull from a deal
          </label>
          {selectedDeal ? (
            <div className="flex items-center gap-2 p-2 rounded-md border border-border bg-muted/40">
              <Check className="h-4 w-4 text-green-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{selectedDeal.property_address || "(no address)"}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {[selectedDeal.city, selectedDeal.state].filter(Boolean).join(", ")}
                  {selectedDeal.property_type ? ` · ${selectedDeal.property_type}` : ""}
                </div>
              </div>
              <button onClick={clearDeal} className="text-muted-foreground hover:text-destructive">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <Select
              disabled={dealsLoading || deals.length === 0}
              onValueChange={(id) => { const d = deals.find((deal) => deal.id === id); if (d) applyDeal(d); }}
            >
              <SelectTrigger>
                <SelectValue placeholder={dealsLoading ? "Loading deals…" : deals.length === 0 ? "No active deals" : "Select a deal…"} />
              </SelectTrigger>
              <SelectContent>
                {deals.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    <div className="truncate">
                      {d.property_address || "(no address)"}
                      <span className="text-muted-foreground ml-1">
                        — {[d.city, d.state].filter(Boolean).join(", ")}
                        {d.property_type ? ` · ${d.property_type}` : ""}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-12">
          <div className="relative md:col-span-5">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Street address (optional)" value={street} onChange={(e) => setStreet(e.target.value)} />
          </div>
          <Input className="md:col-span-3" placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
          <Input className="md:col-span-2" placeholder="State" maxLength={2}
            value={stateCode}
            onChange={(e) => setStateCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} />
          <Input className="md:col-span-2" placeholder="Zip" maxLength={5} inputMode="numeric"
            value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, ""))} />
          <div className="md:col-span-6">
            <Select value={propertyType || "any"} onValueChange={(v) => setPropertyType(v === "any" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Property type (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any property type</SelectItem>
                {PROPERTY_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Input className="md:col-span-6" placeholder="Est. price (optional)" value={priceHint} onChange={(e) => setPriceHint(e.target.value)} />
        </div>
        <div className="mt-4">
          <Button onClick={findMatches} disabled={loading} className="bg-primary hover:bg-primary-hover text-primary-foreground">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Match with Buyers
          </Button>
        </div>
      </div>

      {!results ? (
        <div className="empty-state">
          <Sparkles className="h-10 w-10 text-primary" />
          <h3 className="text-lg font-semibold">Find the perfect buyer</h3>
          <p className="text-sm text-muted-foreground">
            Enter a property address above and we'll rank buyer matches from your Rolodex, the Buyer Archive, and public data.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <ResultGroup title="My Buyer Rolodex" icon={<Users className="h-4 w-4" />} matches={results.rolodex} canAdd={false} onAdd={(b) => addToMine(b)} />
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="text-primary"><Archive className="h-4 w-4" /></div>
              <h3 className="font-semibold text-sm">Buyer Archive</h3>
              <Badge variant="secondary" className="ml-auto text-[10px]">{results.archive.length}</Badge>
            </div>
            {results.archive.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">No matches in this source.</p>
            ) : (
              <div className="space-y-2">
                {results.archive_state === "pay_per_reveal" && (
                  <div className="text-[11px] text-muted-foreground bg-muted/40 border border-border rounded-md px-2 py-1.5 mb-2">
                    Reveal a buyer's contact for {results.archive_reveal_cost} credits.
                    Balance: <span className="font-semibold text-foreground">{results.archive_credit_balance}</span>
                  </div>
                )}
                {results.archive.map((b, i) => (
                  <ArchiveCard key={b.id} b={b} i={i} revealCost={results.archive_reveal_cost} onReveal={() => revealArchiveBuyer(b)} onAdd={() => addToMine(b)} />
                ))}
              </div>
            )}
          </div>
          <ResultGroup title="Public Data Buyers" icon={<Globe className="h-4 w-4" />} matches={results.public} canAdd onAdd={(b) => addToMine(b)}
            emptyHint={!results.public_available ? "Public data source not connected yet." : undefined} />
        </div>
      )}
      <BuyCreditsModal open={buyOpen} onOpenChange={setBuyOpen} ghlLocationId={activeLocation?.locationId ?? null} />
    </div>
  );
}

function ResultGroup({ title, icon, matches, canAdd, onAdd, emptyHint }: {
  title: string; icon: React.ReactNode; matches: Match[]; canAdd: boolean;
  onAdd: (m: Match) => void; emptyHint?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <div className="text-primary">{icon}</div>
        <h3 className="font-semibold text-sm">{title}</h3>
        <Badge variant="secondary" className="ml-auto text-[10px]">{matches.length}</Badge>
      </div>
      {matches.length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center">{emptyHint || "No matches in this source."}</p>
      ) : (
        <div className="space-y-2">
          {matches.map((b, i) => <MatchCard key={b.id} b={b} i={i} canAdd={canAdd} onAdd={() => onAdd(b)} />)}
        </div>
      )}
    </div>
  );
}

function MatchCard({ b, i, canAdd, onAdd }: { b: Match; i: number; canAdd: boolean; onAdd: () => void }) {
  return (
    <div className="border border-border rounded-lg p-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground w-4">#{i + 1}</span>
        <span className="font-medium text-sm flex-1 truncate">{b.name}</span>
        {b.profile_complete && (
          <span title={`Complete profile (${b.profile_completeness ?? 100}%)`}>
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
          </span>
        )}
        <Badge variant="outline" className="text-[10px]">{Math.round(b.score)}</Badge>
      </div>
      <p className="text-xs text-muted-foreground mt-1">{b.reason}</p>
      <div className="flex flex-wrap gap-1 mt-2">
        {b.markets?.slice(0, 2).map((m) => <Badge key={m} variant="outline" className="text-[10px]">{m}</Badge>)}
      </div>
      {canAdd && (
        <Button size="sm" variant="outline" onClick={onAdd} className="mt-2 h-7 text-xs w-full">Add to Rolodex</Button>
      )}
    </div>
  );
}

function maskName(raw: string | null | undefined): string {
  const name = (raw || "").trim();
  if (!name) return "—";
  const parts = name.split(/\s+/);
  if (parts.length === 1) {
    const w = parts[0];
    return w.length <= 2 ? w + "•••" : w.slice(0, Math.min(2, w.length)) + "•".repeat(Math.max(3, w.length - 2));
  }
  return parts.map((p, idx) => {
    if (idx === 0) return p;
    const keep = Math.min(1, p.length);
    return p.slice(0, keep) + "•".repeat(Math.max(3, p.length - keep));
  }).join(" ");
}

function ArchiveCard({ b, i, revealCost, onReveal, onAdd }: { b: Match; i: number; revealCost: number; onReveal: () => void; onAdd: () => void }) {
  const revealed = !!b.revealed;
  return (
    <div className="border border-border rounded-lg p-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground w-4">#{i + 1}</span>
        <span className="font-medium text-sm flex-1 truncate">{revealed ? b.name : maskName(b.name)}</span>
        {b.profile_complete && (
          <span title={`Complete profile (${b.profile_completeness ?? 100}%)`}>
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
          </span>
        )}
        <Badge variant="outline" className="text-[10px]">{Math.round(b.score)}</Badge>
      </div>
      <p className="text-xs text-muted-foreground mt-1">{b.reason}</p>
      <div className="flex flex-wrap gap-1 mt-2">
        {b.markets?.slice(0, 2).map((m) => <Badge key={m} variant="outline" className="text-[10px]">{m}</Badge>)}
      </div>
      <div className="mt-2 space-y-1 text-xs">
        <div className="flex items-center gap-1.5">
          <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
          {revealed ? <span className="text-foreground truncate">{b.email || "—"}</span> : <span className="select-none blur-sm text-muted-foreground tracking-wider">•••••••@••••••.com</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
          {revealed ? <span className="text-foreground">{b.phone || "—"}</span> : <span className="select-none blur-sm text-muted-foreground tracking-wider">(•••) •••-••••</span>}
        </div>
      </div>
      {revealed ? (
        <Button size="sm" variant="outline" onClick={onAdd} className="mt-2 h-7 text-xs w-full">
          <Check className="h-3 w-3 mr-1" /> Add to Rolodex
        </Button>
      ) : (
        <Button size="sm" onClick={onReveal} className="mt-2 h-7 text-xs w-full bg-primary hover:bg-primary/90 text-primary-foreground">
          <Lock className="h-3 w-3 mr-1" /> Reveal Contact ({revealCost} credits)
        </Button>
      )}
    </div>
  );
}
