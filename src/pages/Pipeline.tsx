import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Plus, LayoutGrid, List } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { KanbanBoard } from "@/components/pipeline/KanbanBoard";
import { DealListView } from "@/components/pipeline/DealListView";
import { AddDealModal } from "@/components/pipeline/AddDealModal";
import { DealDrawer } from "@/components/pipeline/DealDrawer";
import { Skeleton } from "@/components/ui/skeleton";

export type DealStatus = "lead" | "active" | "under_contract" | "closed" | "dead" | "title_issues" | "seller_issue" | "could_not_sell";

export interface Deal {
  id: string;
  property_address: string;
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
  created_at: string;
}

export default function Pipeline() {
  const { user } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase.from("deals").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setDeals((data as any) || []);
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
          <Button onClick={() => setShowAdd(true)} className="bg-primary hover:bg-primary-hover text-primary-foreground">
            <Plus className="h-4 w-4 mr-1" /> Add Deal
          </Button>
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
              <KanbanBoard deals={deals} onStatusChange={updateStatus} onSelect={setActiveId} />}
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
