import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { scopeToLocation } from "@/lib/locationScope";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, X, Check } from "lucide-react";

interface Buyer { id: string; name: string; company_name: string | null; markets: string[]; }

export function DealBuyerMatch({
  dealId, buyerId, onChange,
}: { dealId: string; buyerId: string | null; onChange: (id: string | null) => void }) {
  const { user } = useAuth();
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [matched, setMatched] = useState<Buyer | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!user) return;
    scopeToLocation(
      supabase.from("buyers").select("id, name, company_name, markets")
        .eq("user_id", user.id).eq("is_archived", false)
        .order("name")
    ).then(({ data }) => setBuyers((data as any) || []));
  }, [user]);

  useEffect(() => {
    if (!buyerId) { setMatched(null); return; }
    supabase.from("buyers").select("id, name, company_name, markets").eq("id", buyerId).maybeSingle()
      .then(({ data }) => setMatched(data as any));
  }, [buyerId]);

  async function pick(b: Buyer) {
    await supabase.from("deals").update({ buyer_id: b.id }).eq("id", dealId);
    onChange(b.id);
    setQ("");
  }

  async function clear() {
    await supabase.from("deals").update({ buyer_id: null }).eq("id", dealId);
    onChange(null);
  }

  const filtered = q.trim()
    ? buyers.filter((b) =>
        b.name.toLowerCase().includes(q.toLowerCase()) ||
        (b.company_name || "").toLowerCase().includes(q.toLowerCase()))
        .slice(0, 8)
    : [];

  return (
    <div className="space-y-2">
      <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Sold To Buyer</label>
      {matched ? (
        <div className="flex items-center gap-2 p-2 rounded-md border border-border bg-muted/40">
          <Check className="h-4 w-4 text-green-600" />
          <div className="flex-1">
            <div className="text-sm font-medium">{matched.name}</div>
            {matched.company_name && <div className="text-xs text-muted-foreground">{matched.company_name}</div>}
          </div>
          <button onClick={clear} className="text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search your buyer rolodex…" value={q} onChange={(e) => setQ(e.target.value)} />
          {filtered.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-popover border border-border rounded-md shadow-md overflow-hidden">
              {filtered.map((b) => (
                <button key={b.id} onClick={() => pick(b)} className="w-full text-left px-3 py-2 hover:bg-muted text-sm">
                  <div className="font-medium">{b.name}</div>
                  <div className="text-xs text-muted-foreground">{b.company_name || "—"} · {b.markets.slice(0,2).join(", ")}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
