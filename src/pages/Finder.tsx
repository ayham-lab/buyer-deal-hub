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
import { MapPin, Sparkles, Loader2, Users, Archive, Globe, Lock, Infinity as InfinityIcon, Coins } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Match = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  markets?: string[];
  property_types?: string[];
  price_min?: number;
  price_max?: number;
  source?: string;
  score: number;
  reason: string;
};

type ArchiveState = "admin" | "subscription" | "credits" | "locked";

type Results = {
  rolodex: Match[];
  archive: Match[];
  archive_locked: boolean;
  archive_count: number;
  archive_state: ArchiveState;
  archive_reveal_cost: number;
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

  async function addToMine(b: Match, fromArchive: boolean) {
    if (!user) return;
    // State 2 (credits): adding from archive deducts reveal cost.
    if (fromArchive && results?.archive_state === "credits" && activeLocation?.locationId) {
      const { data, error } = await supabase.rpc("reveal_archive_buyer", {
        p_location: activeLocation.locationId,
        p_buyer_id: b.id,
      });
      if (error) { toast.error(error.message); return; }
      const r = data as any;
      if (!r?.success) {
        if (r?.error === "insufficient_credits") setBuyOpen(true);
        toast.error(r?.error === "insufficient_credits" ? "Not enough credits" : "Reveal failed");
        return;
      }
    }
    const { error } = await supabase.from("buyers").insert(withLocation({
      user_id: user.id,
      name: b.name,
      email: b.email,
      phone: b.phone,
      markets: b.markets,
      property_types: b.property_types,
      price_min: b.price_min,
      price_max: b.price_max,
      source: b.source,
    }));
    if (error) toast.error(error.message);
    else toast.success(`${b.name} added to your buyers`);
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
              onAdd={(b) => addToMine(b, false)}
            />
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="text-primary"><Archive className="h-4 w-4" /></div>
                <h3 className="font-semibold text-sm">Buyer Archive</h3>
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  {results.archive_locked ? results.archive_count : results.archive.length}
                </Badge>
              </div>
              {results.archive_locked ? (
                <ArchiveTeaser
                  count={results.archive_count}
                  locationLabel={results.archive_location_label}
                  onSubscribe={() => setBuyOpen(true)}
                  onBuyCredits={() => setBuyOpen(true)}
                />
              ) : results.archive.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">No matches in this source.</p>
              ) : (
                <div className="space-y-2">
                  {results.archive_state === "credits" && (
                    <div className="text-[11px] text-muted-foreground bg-muted/40 border border-border rounded-md px-2 py-1.5 mb-2">
                      Adding a buyer from the Archive uses {results.archive_reveal_cost} credits.
                    </div>
                  )}
                  {results.archive.map((b, i) => (
                    <MatchCard key={b.id} b={b} i={i} canAdd onAdd={() => addToMine(b, true)} />
                  ))}
                </div>
              )}
            </div>
            <ResultGroup
              title="Public Data Buyers"
              icon={<Globe className="h-4 w-4" />}
              matches={results.public}
              canAdd
              onAdd={(b) => addToMine(b, false)}
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

function ArchiveTeaser({
  count, locationLabel, onSubscribe, onBuyCredits,
}: { count: number; locationLabel: string; onSubscribe: () => void; onBuyCredits: () => void }) {
  return (
    <div className="text-center py-8 px-3 space-y-4 bg-gradient-to-b from-primary/5 to-transparent border-2 border-dashed border-primary/40 rounded-lg">
      <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
        <Lock className="h-6 w-6 text-primary" />
      </div>
      <div className="space-y-1">
        <div className="text-3xl font-bold text-foreground">
          {count.toLocaleString()} {count === 1 ? "buyer" : "buyers"}
        </div>
        <p className="text-sm text-muted-foreground">
          matching this property{locationLabel ? ` in ${locationLabel}` : ""}
        </p>
      </div>
      <p className="text-sm font-medium text-foreground px-2">
        Subscribe to Unlimited or buy credits to see them.
      </p>
      <div className="flex flex-col gap-2 pt-1">
        <Button onClick={onSubscribe} className="w-full bg-primary hover:bg-primary-hover text-primary-foreground">
          <InfinityIcon className="h-4 w-4 mr-2" />
          Subscribe to Unlimited ($297/mo)
        </Button>
        <Button onClick={onBuyCredits} variant="outline" className="w-full">
          <Coins className="h-4 w-4 mr-2" />
          Buy Credits
        </Button>
      </div>
    </div>
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
