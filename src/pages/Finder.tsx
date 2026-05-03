import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MapPin, Sparkles, Search, Loader2 } from "lucide-react";
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

export default function Finder() {
  const { user } = useAuth();
  const [address, setAddress] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [priceHint, setPriceHint] = useState("");
  const [source, setSource] = useState<"archive" | "mine" | "skiptraced">("archive");
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);

  async function findMatches(useSource: "archive" | "mine" | "skiptraced") {
    if (!address.trim()) {
      toast.error("Enter a property address");
      return;
    }
    setSource(useSource);
    setLoading(true);
    setMatches([]);
    try {
      const { data, error } = await supabase.functions.invoke("find-buyers", {
        body: { address, source: useSource, propertyType, priceHint },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setMatches(data?.matches || []);
      if (!data?.matches?.length) toast.info("No matches found.");
    } catch (e: any) {
      toast.error(e.message || "Failed to find buyers");
    } finally {
      setLoading(false);
    }
  }

  async function addToMine(b: Match) {
    if (!user) return;
    const { error } = await supabase.from("buyers").insert({
      user_id: user.id,
      name: b.name,
      email: b.email,
      phone: b.phone,
      markets: b.markets,
      property_types: b.property_types,
      price_min: b.price_min,
      price_max: b.price_max,
      source: b.source,
    });
    if (error) toast.error(error.message);
    else toast.success(`${b.name} added to your buyers`);
  }

  return (
    <AppLayout>
      <PageHeader
        title="Buyer Finder"
        subtitle="Enter a property address — we'll match the best buyers from the archive or your own list using AI"
      />
      <div className="p-6 lg:p-8 space-y-6">
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[1fr,200px,200px]">
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="123 Main St, Atlanta, GA"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
            <Input
              placeholder="Property type (optional)"
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value)}
            />
            <Input
              placeholder="Est. price (optional)"
              value={priceHint}
              onChange={(e) => setPriceHint(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <Button
              onClick={() => findMatches("archive")}
              disabled={loading}
              className="bg-primary hover:bg-primary-hover text-primary-foreground"
            >
              {loading && source === "archive" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Match from Archive
            </Button>
            <Button
              onClick={() => findMatches("mine")}
              disabled={loading}
              variant="outline"
            >
              {loading && source === "mine" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              AI Match from My Buyers
            </Button>
            <Button
              onClick={() => findMatches("skiptraced")}
              disabled={loading}
              variant="outline"
            >
              {loading && source === "skiptraced" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Search With Local Skiptraced Buyers
            </Button>
          </div>
        </div>

        {matches.length === 0 ? (
          <div className="empty-state">
            <Sparkles className="h-10 w-10 text-primary" />
            <h3 className="text-lg font-semibold">Find the perfect buyer</h3>
            <p className="text-sm text-muted-foreground">
              Enter a property address above and we'll rank the best buyer matches.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {matches.map((b, i) => (
              <div key={b.id} className="bg-card border border-border rounded-xl p-4 shadow-sm flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-primary font-bold">{i + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-semibold">{b.name}</h4>
                    <Badge variant="secondary">Score {Math.round(b.score)}</Badge>
                    {b.markets?.slice(0, 3).map((m) => (
                      <Badge key={m} variant="outline">{m}</Badge>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{b.reason}</p>
                  <div className="text-xs text-muted-foreground mt-2 flex gap-3 flex-wrap">
                    {b.email && <span>{b.email}</span>}
                    {b.phone && <span>{b.phone}</span>}
                    {(b.price_min || b.price_max) && (
                      <span>
                        ${b.price_min?.toLocaleString() || "0"} – ${b.price_max?.toLocaleString() || "∞"}
                      </span>
                    )}
                  </div>
                </div>
                {source === "archive" && (
                  <Button size="sm" onClick={() => addToMine(b)} className="bg-primary hover:bg-primary-hover text-primary-foreground">
                    Add
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
