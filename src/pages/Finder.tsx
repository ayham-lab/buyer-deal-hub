import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Sparkles, Lock } from "lucide-react";
import { toast } from "sonner";

export default function Finder() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function searchArchive() {
    setLoading(true);
    const { data } = await supabase
      .from("buyer_archive")
      .select("*")
      .or(`name.ilike.%${q}%,markets.cs.{${q}},source.ilike.%${q}%`)
      .limit(50);
    setResults(data || []);
    setLoading(false);
  }

  async function addToMine(b: any) {
    if (!user) return;
    const { error } = await supabase.from("buyers").insert({
      user_id: user.id, name: b.name, email: b.email, phone: b.phone,
      markets: b.markets, property_types: b.property_types,
      price_min: b.price_min, price_max: b.price_max, source: b.source,
    });
    if (error) toast.error(error.message);
    else toast.success(`${b.name} added to your buyers`);
  }

  return (
    <AppLayout>
      <PageHeader title="Buyer Finder" subtitle="Search the system archive or use AI to find buyers" />
      <div className="p-8">
        <Tabs defaultValue="archive">
          <TabsList className="bg-secondary">
            <TabsTrigger value="archive"><Search className="h-4 w-4 mr-1" />Archive Search</TabsTrigger>
            <TabsTrigger value="ai"><Sparkles className="h-4 w-4 mr-1" />AI Finder</TabsTrigger>
          </TabsList>

          <TabsContent value="archive" className="mt-6 space-y-4">
            <div className="flex gap-2 max-w-xl">
              <Input placeholder="Market, name, or source…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchArchive()} />
              <Button onClick={searchArchive} disabled={loading} className="bg-primary hover:bg-primary-hover">Search</Button>
            </div>
            {results.length === 0 ? (
              <div className="empty-state">
                <Search className="h-10 w-10 text-primary" />
                <h3 className="text-lg font-semibold">Search the shared buyer archive</h3>
                <p className="text-sm text-muted-foreground">Find buyers other wholesalers have shared.</p>
              </div>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="data-table w-full">
                  <thead><tr><th>Name</th><th>Markets</th><th>Contact</th><th>Source</th><th></th></tr></thead>
                  <tbody>
                    {results.map((b) => (
                      <tr key={b.id}>
                        <td className="font-medium">{b.name}</td>
                        <td className="text-muted-foreground">{b.markets?.join(", ") || "—"}</td>
                        <td className="text-muted-foreground">{b.email || b.phone || "—"}</td>
                        <td className="text-muted-foreground">{b.source || "—"}</td>
                        <td><Button size="sm" onClick={() => addToMine(b)} className="bg-primary hover:bg-primary-hover">Add</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="ai" className="mt-6">
            <div className="bg-card border border-border rounded-lg p-10 max-w-2xl mx-auto text-center relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-[10px] uppercase tracking-wider px-3 py-1 rounded-bl-lg font-semibold flex items-center gap-1">
                <Lock className="h-3 w-3" /> Coming Soon
              </div>
              <Sparkles className="h-12 w-12 text-primary mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-primary mb-2">AI-Powered Buyer + Agent Finder</h2>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                This will use AI and skip-tracing to find cash buyers and active agents near any property address.
              </p>
              <div className="flex gap-2 max-w-md mx-auto">
                <Input disabled placeholder="123 Main St, Atlanta, GA" />
                <Button disabled className="bg-primary"><Sparkles className="h-4 w-4 mr-1" />Search</Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
