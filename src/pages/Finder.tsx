import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { withLocation } from "@/lib/locationScope";
import { useAuth } from "@/hooks/useAuth";
import { useActiveLocation } from "@/contexts/LocationContext";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BuyCreditsModal } from "@/components/credits/BuyCreditsModal";

const PROPERTY_TYPES = ["SFH", "MFH 2-4", "MFH 5+", "Commercial", "Land", "Mobile"];
import { MapPin, Sparkles, Loader2, Users, Archive, Globe, Lock, Mail, Phone, Coins, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

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

export default function Finder() {
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

  async function findMatches() {
    if (!street.trim() || !city.trim() || !stateCode.trim()) {
      toast.error("Street, City, and State are required");
      return;
    }
    const address = `${street.trim()}, ${city.trim()}, ${stateCode.trim().toUpperCase()}${zip.trim() ? " " + zip.trim() : ""}`;
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
    else toast.success(`${b.name} added to your buyers`);
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
      } else {
        toast.error("Reveal failed");
      }
      return;
    }
    const { data: row } = await supabase
      .from("archive_buyers")
      .select("email, phone")
      .eq("id", b.id)
      .maybeSingle();
    setResults({
      ...results,
      archive: results.archive.map((m) =>
        m.id === b.id
          ? { ...m, revealed: true, email: row?.email ?? null, phone: row?.phone ?? null }
          : m,
      ),
      archive_credit_balance: Math.max(0, (results.archive_credit_balance ?? 0) - results.archive_reveal_cost),
    });
    toast.success(`Revealed ${b.name}`);
  }

  return (
    <AppLayout>
      <PageHeader
        title="Buyer Finder"
        subtitle="Enter a property address — we'll match the best buyers across all your sources"
      />
      <div className="p-6 lg:p-8 space-y-6">
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <div className="grid gap-3 md:grid-cols-12">
            <div className="relative md:col-span-5">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Street address *"
                value={street} onChange={(e) => setStreet(e.target.value)} />
            </div>
            <Input className="md:col-span-3" placeholder="City *" value={city} onChange={(e) => setCity(e.target.value)} />
            <Input className="md:col-span-2" placeholder="State *" maxLength={2}
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
            <Input className="md:col-span-6" placeholder="Est. price (optional)"
              value={priceHint} onChange={(e) => setPriceHint(e.target.value)} />
          </div>
          <div className="mt-4">
            <Button onClick={findMatches} disabled={loading}
              className="bg-primary hover:bg-primary-hover text-primary-foreground">
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
            <ResultGroup
              title="My Buyer Rolodex"
              icon={<Users className="h-4 w-4" />}
              matches={results.rolodex}
              canAdd={false}
              onAdd={(b) => addToMine(b)}
            />
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="text-primary"><Archive className="h-4 w-4" /></div>
                <h3 className="font-semibold text-sm">Buyer Archive</h3>
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  {results.archive.length}
                </Badge>
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
                    <ArchiveCard
                      key={b.id}
                      b={b}
                      i={i}
                      revealCost={results.archive_reveal_cost}
                      onReveal={() => revealArchiveBuyer(b)}
                      onAdd={() => addToMine(b)}
                    />
                  ))}
                </div>
              )}
            </div>
            <ResultGroup
              title="Public Data Buyers"
              icon={<Globe className="h-4 w-4" />}
              matches={results.public}
              canAdd
              onAdd={(b) => addToMine(b)}
              emptyHint={!results.public_available ? "Public data source not connected yet." : undefined}
            />
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

function ResultGroup({
  title, icon, matches, canAdd, onAdd, emptyHint,
}: {
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
        <p className="text-xs text-muted-foreground py-6 text-center">
          {emptyHint || "No matches in this source."}
        </p>
      ) : (
        <div className="space-y-2">
          {matches.map((b, i) => (
            <MatchCard key={b.id} b={b} i={i} canAdd={canAdd} onAdd={() => onAdd(b)} />
          ))}
        </div>
      )}
    </div>
  );
}

function MatchCard({
  b, i, canAdd, onAdd,
}: { b: Match; i: number; canAdd: boolean; onAdd: () => void }) {
  return (
    <div className="border border-border rounded-lg p-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground w-4">#{i + 1}</span>
        <span className="font-medium text-sm flex-1 truncate">{b.name}</span>
        <Badge variant="outline" className="text-[10px]">{Math.round(b.score)}</Badge>
      </div>
      <p className="text-xs text-muted-foreground mt-1">{b.reason}</p>
      <div className="flex flex-wrap gap-1 mt-2">
        {b.markets?.slice(0, 2).map((m) => (
          <Badge key={m} variant="outline" className="text-[10px]">{m}</Badge>
        ))}
      </div>
      {canAdd && (
        <Button size="sm" variant="outline" onClick={onAdd} className="mt-2 h-7 text-xs w-full">
          Add to Rolodex
        </Button>
      )}
    </div>
  );
}

function ArchiveCard({
  b, i, revealCost, onReveal, onAdd,
}: { b: Match; i: number; revealCost: number; onReveal: () => void; onAdd: () => void }) {
  const revealed = !!b.revealed;
  return (
    <div className="border border-border rounded-lg p-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground w-4">#{i + 1}</span>
        <span className="font-medium text-sm flex-1 truncate">{b.name}</span>
        <Badge variant="outline" className="text-[10px]">{Math.round(b.score)}</Badge>
      </div>
      <p className="text-xs text-muted-foreground mt-1">{b.reason}</p>
      <div className="flex flex-wrap gap-1 mt-2">
        {b.markets?.slice(0, 2).map((m) => (
          <Badge key={m} variant="outline" className="text-[10px]">{m}</Badge>
        ))}
      </div>

      <div className="mt-2 space-y-1 text-xs">
        <div className="flex items-center gap-1.5">
          <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
          {revealed ? (
            <span className="text-foreground truncate">{b.email || "—"}</span>
          ) : (
            <span className="select-none blur-sm text-muted-foreground tracking-wider">
              •••••••@••••••.com
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
          {revealed ? (
            <span className="text-foreground">{b.phone || "—"}</span>
          ) : (
            <span className="select-none blur-sm text-muted-foreground tracking-wider">
              (•••) •••-••••
            </span>
          )}
        </div>
      </div>

      {revealed ? (
        <Button size="sm" variant="outline" onClick={onAdd} className="mt-2 h-7 text-xs w-full">
          <Check className="h-3 w-3 mr-1" /> Add to Rolodex
        </Button>
      ) : (
        <Button
          size="sm"
          onClick={onReveal}
          className="mt-2 h-7 text-xs w-full bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          <Lock className="h-3 w-3 mr-1" />
          Reveal Contact ({revealCost} credits)
        </Button>
      )}
    </div>
  );
}
