import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { scopeToLocation } from "@/lib/locationScope";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Users as UsersIcon, Upload, Download } from "lucide-react";
import { AddBuyerModal } from "@/components/buyers/AddBuyerModal";
import { ImportBuyersModal } from "@/components/buyers/ImportBuyersModal";
import { BuyerDrawer } from "@/components/buyers/BuyerDrawer";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { exportToCsv } from "@/lib/csv";

export interface Buyer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  markets: string[];
  property_types: string[];
  price_min: number | null;
  price_max: number | null;
  source: string | null;
  last_contact_at: string | null;
  deal_count: number;
  criteria_notes: string | null;
  created_at: string;
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
  buyer_status?: "not_vetted" | "vetted" | "repeat" | "recurring";
  buyer_types?: string[];
  buyer_frequency?: string[];
  other_property_type?: string | null;
  proof_of_funds_files?: string[];
  previous_deals?: string | null;
  experience?: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  not_vetted: "Not Vetted",
  vetted: "Vetted",
  repeat: "Repeat Buyer",
  recurring: "Recurring Buyer",
};
const STATUS_COLOR: Record<string, string> = {
  not_vetted: "bg-muted text-muted-foreground",
  vetted: "bg-green-100 text-green-700 border-green-200",
  repeat: "bg-blue-100 text-blue-700 border-blue-200",
  recurring: "bg-purple-100 text-purple-700 border-purple-200",
};

export default function Buyers() {
  const { user } = useAuth();
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [active, setActive] = useState<Buyer | null>(null);

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data } = await scopeToLocation(
      supabase
        .from("buyers")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_archived", false)
        .order("created_at", { ascending: false })
    );
    setBuyers((data as any) || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [user]);

  const filtered = buyers.filter((b) => {
    const q = search.toLowerCase();
    return !q || b.name.toLowerCase().includes(q) ||
      b.markets.some((m) => m.toLowerCase().includes(q)) ||
      (b.company_name || "").toLowerCase().includes(q);
  });

  return (
    <AppLayout>
      <PageHeader
        title="Buyer Rolodex"
        subtitle="Your private buyer database"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => exportToCsv(filtered.map((b) => ({
              name: b.name, email: b.email, phone: b.phone,
              markets: (b.markets || []).join("|"),
              property_types: (b.property_types || []).join("|"),
              price_min: b.price_min, price_max: b.price_max,
              source: b.source, status: b.buyer_status, deal_count: b.deal_count,
              created_at: b.created_at,
            })), `buyers-${new Date().toISOString().slice(0,10)}`)}>
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </Button>
            <Button variant="outline" onClick={() => setShowImport(true)}>
              <Upload className="h-4 w-4 mr-1" /> Import CSV
            </Button>
            <Button onClick={() => setShowAdd(true)} className="bg-primary hover:bg-primary-hover text-primary-foreground">
              <Plus className="h-4 w-4 mr-1" /> Add Buyer
            </Button>
          </div>
        }
      />
      <div className="p-8 space-y-4">
        <div className="flex gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, market, company…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <UsersIcon className="h-10 w-10 text-primary" />
            <h3 className="text-lg font-semibold">No buyers yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Build your private cash buyer database. Add buyers manually or import from the system archive.
            </p>
            <Button onClick={() => setShowAdd(true)} className="bg-primary hover:bg-primary-hover">
              <Plus className="h-4 w-4 mr-1" /> Add Your First Buyer
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden bg-card shadow-sm">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Company</th>
                  <th>Status</th>
                  <th>Markets</th>
                  <th>Price Range</th>
                  <th>Property Types</th>
                  <th>Last Contact</th>
                  <th>Deals</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <tr key={b.id} onClick={() => setActive(b)} className="cursor-pointer">
                    <td className="font-medium">{b.name}</td>
                    <td className="text-muted-foreground">{b.company_name || "—"}</td>
                    <td>
                      <Badge variant="outline" className={`text-[10px] rounded ${STATUS_COLOR[b.buyer_status || "not_vetted"]}`}>
                        {STATUS_LABEL[b.buyer_status || "not_vetted"]}
                      </Badge>
                    </td>
                    <td className="text-muted-foreground">{b.markets.join(", ") || "—"}</td>
                    <td className="text-muted-foreground">
                      {b.price_min || b.price_max
                        ? `$${(b.price_min || 0).toLocaleString()} – $${(b.price_max || 0).toLocaleString()}`
                        : "—"}
                    </td>
                    <td className="text-muted-foreground">{b.property_types.join(", ") || "—"}</td>
                    <td className="text-muted-foreground">
                      {b.last_contact_at ? format(new Date(b.last_contact_at), "MMM d") : "—"}
                    </td>
                    <td>{b.deal_count}</td>
                    <td className="text-muted-foreground">{b.source || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddBuyerModal open={showAdd} onClose={() => setShowAdd(false)} onCreated={load} />
      <ImportBuyersModal open={showImport} onClose={() => setShowImport(false)} onImported={load} />
      <BuyerDrawer buyer={active} onClose={() => setActive(null)} onUpdated={load} />
    </AppLayout>
  );
}
