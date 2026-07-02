import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { scopeToLocation, getActiveLocationId } from "@/lib/locationScope";
import { useAuth } from "@/hooks/useAuth";
import { useActiveLocation } from "@/contexts/LocationContext";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Plus, LayoutGrid, List, Download } from "lucide-react";
import { exportToCsv } from "@/lib/csv";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { KanbanBoard } from "@/components/pipeline/KanbanBoard";
import { DealListView } from "@/components/pipeline/DealListView";
import { AddDealModal } from "@/components/pipeline/AddDealModal";
import { DealDrawer } from "@/components/pipeline/DealDrawer";
import { Skeleton } from "@/components/ui/skeleton";
import { usePipelineStages } from "@/hooks/usePipelineStages";

export type DealStatus = "lead" | "active" | "under_contract" | "closed" | "dead" | "title_issues" | "seller_issue" | "could_not_sell";

export interface Deal {
  id: string;
  property_address: string;
  homeowner_name?: string | null;
  status: DealStatus;
  ip_expiry_date: string | null;
  closing_date: string | null;
  emd_received: boolean;
  emd_amount: number | null;
  assignment_fee: number | null;
  arv: number | null;
  asking_price: number | null;
  lead_source: string | null;
  jv_partner_id: string | null;
  buyer_id: string | null;
  notes: string | null;
  ghl_location_id?: string | null;
  ghl_contact_id?: string | null;
 exit_strategies?: string[] | null;
 price_under_contract?: number | null;
 expected_assignment?: number | null;
  created_at: string;
}


export default function Pipeline() {
  const { user, isAdmin } = useAuth();
  const { isIframed } = useActiveLocation();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [locationNames, setLocationNames] = useState<Record<string, string>>({});

  async function load() {
    if (!user) return;
    setLoading(true);
    // When a GHL location is active (iframe OR standalone admin viewing a tenant location),
    // show ALL deals for that location — including webhook-imported deals where user_id IS NULL.
    // RLS already gates by location. Only fall back to owner-scoped when no location context exists.
    const activeLoc = getActiveLocationId();
    const base = supabase.from("deals").select("*").is("deleted_at", null).order("created_at", { ascending: false });
    // Admin / super_admin intentionally view tenant data — skip user_id self-filter so they
    // can see webhook-imported rows with user_id=NULL. This regression keeps creeping back
    // (3rd recurrence; prior fixes covered Pipeline + Buyers + KPIs + TitleCompanies);
    // don't re-add the fallback for admins.
    const query = (isIframed || activeLoc || isAdmin) ? base : base.eq("user_id", user.id);
    const { data } = await scopeToLocation(query);
    setDeals((data as any) || []);

    // Source location names (for "From: <location>" badge on cards). RLS limits us to
    // the active location in iframe mode; in standalone admin mode we get all rows.
    const { data: locRows } = await supabase
      .from("ghl_location_tokens")
      .select("ghl_location_id, location_name");
    const map: Record<string, string> = {};
    (locRows || []).forEach((r: any) => {
      if (r.ghl_location_id) map[r.ghl_location_id] = r.location_name || r.ghl_location_id.slice(0, 8);
    });
    setLocationNames(map);

    setLoading(false);
  }
  useEffect(() => { load(); }, [user]);

  async function updateStatus(id: string, status: DealStatus) {
    setDeals((d) => d.map((x) => x.id === id ? { ...x, status } : x));
    await supabase.from("deals").update({ status }).eq("id", id);
  }

  return (
    <AppLayout>
      <PageHeader
        title="Deal Pipeline"
        subtitle={`${deals.length} deals`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => exportToCsv(deals.map((d) => ({
              property_address: d.property_address, status: d.status,
              ip_expiry_date: d.ip_expiry_date, closing_date: d.closing_date,
              emd_received: d.emd_received, emd_amount: d.emd_amount,
              assignment_fee: d.assignment_fee, arv: d.arv, asking_price: d.asking_price,
              lead_source: d.lead_source, created_at: d.created_at,
            })), `deals-${new Date().toISOString().slice(0,10)}`)}>
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </Button>
            <Button onClick={() => setShowAdd(true)} className="bg-primary hover:bg-primary-hover text-primary-foreground">
              <Plus className="h-4 w-4 mr-1" /> Add Deal
            </Button>
          </div>
        }
      />
      <div className="p-6 lg:p-8">
        <Tabs defaultValue="kanban">
          <TabsList>
            <TabsTrigger value="kanban"><LayoutGrid className="h-4 w-4 mr-1" />Kanban</TabsTrigger>
            <TabsTrigger value="list"><List className="h-4 w-4 mr-1" />List</TabsTrigger>
          </TabsList>
          <TabsContent value="kanban" className="mt-6">
            {loading ? <Skeleton className="h-96 w-full" /> :
              <KanbanBoard deals={deals} onStatusChange={updateStatus} onSelect={setActiveId} locationNames={locationNames} columns={visibleColumns as any} />}
          </TabsContent>
          <TabsContent value="list" className="mt-6">
            <DealListView deals={deals} onSelect={setActiveId} />
          </TabsContent>
        </Tabs>
      </div>

      <AddDealModal open={showAdd} onClose={() => setShowAdd(false)} onCreated={load} />
      <DealDrawer dealId={activeId} onClose={() => setActiveId(null)} onUpdated={load} />
    </AppLayout>
  );
}
