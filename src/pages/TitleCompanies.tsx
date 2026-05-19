import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { scopeToLocation, getActiveLocationId } from "@/lib/locationScope";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Building2, Library } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { TitleCompanyModal } from "@/components/title/TitleCompanyModal";
import { ArchiveTitleCompaniesBrowser } from "@/components/title/ArchiveTitleCompaniesBrowser";

export interface TitleCompany {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  service_states: string[];
  service_cities: string[];
  charges_file_fee: boolean;
  file_fee_amount: number | null;
  deal_types: string[];
  notes: string | null;
  created_at: string;
}

export const DEAL_TYPE_LABELS: Record<string, string> = {
  cash: "Cash",
  novation: "Novation",
  sub2: "Sub2",
  owner_financing: "Owner Financing",
  commercial: "Commercial",
};

export default function TitleCompanies() {
  const { user } = useAuth();
  const [items, setItems] = useState<TitleCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<TitleCompany | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showArchive, setShowArchive] = useState(false);

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data } = await scopeToLocation(
      supabase
        .from("title_companies")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
    );
    setItems((data as any) || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [user]);

  const filtered = items.filter((t) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      t.name.toLowerCase().includes(q) ||
      (t.contact_name || "").toLowerCase().includes(q) ||
      t.service_states.some((s) => s.toLowerCase().includes(q)) ||
      t.service_cities.some((c) => c.toLowerCase().includes(q))
    );
  });

  return (
    <AppLayout>
      <PageHeader
        title="Title Company Rolodex"
        subtitle="Your trusted closing partners"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowArchive(true)}>
              <Library className="h-4 w-4 mr-1" /> Browse Archive
            </Button>
            <Button onClick={() => setShowAdd(true)} className="bg-primary hover:bg-primary-hover text-primary-foreground">
              <Plus className="h-4 w-4 mr-1" /> Add Title Company
            </Button>
          </div>
        }
      />
      <div className="p-8 space-y-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, state, city…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <Building2 className="h-10 w-10 text-primary" />
            <h3 className="text-lg font-semibold">No title companies yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Track the title companies you work with, the areas they service, and the deal types they handle.
            </p>
            <Button onClick={() => setShowAdd(true)} className="bg-primary hover:bg-primary-hover">
              <Plus className="h-4 w-4 mr-1" /> Add Your First Title Company
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden bg-card shadow-sm">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>States</th>
                  <th>Cities</th>
                  <th>Deal Types</th>
                  <th>File Fee</th>
                  <th>Phone</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} onClick={() => setActive(t)} className="cursor-pointer">
                    <td className="font-medium">{t.name}</td>
                    <td className="text-muted-foreground">{t.contact_name || "—"}</td>
                    <td className="text-muted-foreground">{t.service_states.join(", ") || "—"}</td>
                    <td className="text-muted-foreground">{t.service_cities.join(", ") || "—"}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {t.deal_types.length === 0 ? <span className="text-muted-foreground">—</span> :
                          t.deal_types.map((d) => (
                            <Badge key={d} variant="outline" className="text-[10px]">{DEAL_TYPE_LABELS[d] || d}</Badge>
                          ))}
                      </div>
                    </td>
                    <td className="text-muted-foreground">
                      {t.charges_file_fee ? (t.file_fee_amount ? `$${t.file_fee_amount.toLocaleString()}` : "Yes") : "No"}
                    </td>
                    <td className="text-muted-foreground">{t.phone || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <TitleCompanyModal
        open={showAdd || !!active}
        onClose={() => { setShowAdd(false); setActive(null); }}
        onSaved={load}
        existing={active}
      />
      <ArchiveTitleCompaniesBrowser
        open={showArchive}
        onClose={() => setShowArchive(false)}
        onAdded={load}
      />
    </AppLayout>
  );
}
