import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { scopeToLocation } from "@/lib/locationScope";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, Home, Library } from "lucide-react";
import { RealtorModal, RealtorRow } from "@/components/contacts/RealtorModal";
import { ArchiveContactsBrowser } from "@/components/contacts/ArchiveContactsBrowser";

export default function Realtors() {
  const { user, isAdmin } = useAuth();
  const [items, setItems] = useState<RealtorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<RealtorRow | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showArchive, setShowArchive] = useState(false);

  async function load() {
    if (!user) return;
    setLoading(true);
    const base = (supabase as any).from("realtors").select("*").order("created_at", { ascending: false });
    const q = isAdmin ? base : base;
    const { data } = await scopeToLocation(q);
    setItems((data as any[]) || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [user]);

  const filtered = items.filter((r) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      r.name?.toLowerCase().includes(q) ||
      (r.email || "").toLowerCase().includes(q) ||
      (r.phone || "").toLowerCase().includes(q) ||
      (r.brokerage || "").toLowerCase().includes(q) ||
      (r.markets || []).some((m) => m.toLowerCase().includes(q))
    );
  });

  return (
    <AppLayout>
      <PageHeader
        title="Realtor Rolodex"
        subtitle="Track agents, their brokerages, novation appetite, and markets"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowArchive(true)}>
              <Library className="h-4 w-4 mr-1" /> Browse Archive
            </Button>
            <Button onClick={() => setShowAdd(true)} className="bg-primary hover:bg-primary-hover">
              <Plus className="h-4 w-4 mr-1" /> Add Realtor
            </Button>
          </div>
        }
      />
      <div className="p-8 space-y-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <Home className="h-10 w-10 text-primary" />
            <h3 className="text-lg font-semibold">No realtors yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm">Add agents you work with to track their brokerage, markets, and whether they handle novations.</p>
            <Button onClick={() => setShowAdd(true)} className="bg-primary hover:bg-primary-hover">
              <Plus className="h-4 w-4 mr-1" /> Add Your First Realtor
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden bg-card shadow-sm">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Brokerage</th>
                  <th>Novations</th>
                  <th>Markets</th>
                  <th>Email</th>
                  <th>Phone</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} onClick={() => setActive(r)} className="cursor-pointer">
                    <td className="font-medium">{r.name}</td>
                    <td className="text-muted-foreground">{r.brokerage || "—"}</td>
                    <td>{r.does_novations ? <Badge variant="outline">Yes</Badge> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="text-muted-foreground">
                      {(r.markets || []).slice(0, 3).join(", ") || "—"}
                      {(r.markets || []).length > 3 && ` +${r.markets.length - 3}`}
                    </td>
                    <td className="text-muted-foreground">{r.email || "—"}</td>
                    <td className="text-muted-foreground">{r.phone || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <RealtorModal open={showAdd || !!active} onClose={() => { setShowAdd(false); setActive(null); }} onSaved={load} existing={active} />
      <ArchiveContactsBrowser kind="realtors" open={showArchive} onClose={() => setShowArchive(false)} onAdded={load} />
    </AppLayout>
  );
}
