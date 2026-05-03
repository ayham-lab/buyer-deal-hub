import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Briefcase, DollarSign, Database, MapPin } from "lucide-react";
import { toast } from "sonner";

export default function Admin() {
  const [users, setUsers] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [archiveCount, setArchiveCount] = useState(0);
  const [buyerCounts, setBuyerCounts] = useState<Record<string, number>>({});

  async function load() {
    const [{ data: profs }, { data: dls }, { count: arch }, { data: bc }] = await Promise.all([
      supabase.from("profiles").select("*"),
      supabase.from("deals").select("*"),
      supabase.from("buyer_archive").select("*", { count: "exact", head: true }),
      supabase.from("buyers").select("user_id"),
    ]);
    setUsers(profs || []); setDeals(dls || []); setArchiveCount(arch || 0);
    const counts: Record<string, number> = {};
    (bc || []).forEach((b: any) => { counts[b.user_id] = (counts[b.user_id] || 0) + 1; });
    setBuyerCounts(counts);
  }
  useEffect(() => { load(); }, []);

  const totalRevenue = deals.reduce((s, d) => s + (Number(d.assignment_fee) || 0), 0);
  const dealsByUser: Record<string, number> = {};
  deals.forEach((d) => { dealsByUser[d.user_id] = (dealsByUser[d.user_id] || 0) + 1; });

  const dealsByState: Record<string, number> = {};
  deals.forEach((d) => {
    const m = d.property_address?.match(/,\s*([A-Z]{2})\b/);
    if (m) dealsByState[m[1]] = (dealsByState[m[1]] || 0) + 1;
  });

  async function setStatus(userId: string, status: string) {
    const { error } = await supabase.from("profiles").update({ subscription_status: status as any }).eq("user_id", userId);
    if (error) toast.error(error.message);
    else { toast.success("Updated"); load(); }
  }

  return (
    <AppLayout requireAdmin>
      <PageHeader title="Admin" subtitle="Cross-tenant operations" />
      <div className="p-8 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Stat icon={<Users />} label="Total Users" value={String(users.length)} />
          <Stat icon={<Briefcase />} label="Total Deals" value={String(deals.length)} />
          <Stat icon={<DollarSign />} label="Revenue Tracked" value={`$${totalRevenue.toLocaleString()}`} />
          <Stat icon={<Database />} label="Archive Buyers" value={String(archiveCount)} />
        </div>

        <Section title="Users">
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="data-table w-full">
              <thead><tr><th>Name</th><th>Email</th><th>GHL Location</th><th>Subscription</th><th>Deals</th><th>Buyers</th><th>Actions</th></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="font-medium">{u.name || "—"}</td>
                    <td className="text-muted-foreground">{u.email}</td>
                    <td className="text-muted-foreground text-xs">{u.ghl_location_id || "—"}</td>
                    <td><Badge variant="outline" className="capitalize">{u.subscription_status}</Badge></td>
                    <td>{dealsByUser[u.user_id] || 0}</td>
                    <td>{buyerCounts[u.user_id] || 0}</td>
                    <td className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => setStatus(u.user_id, "active")}>Active</Button>
                      <Button size="sm" variant="outline" onClick={() => setStatus(u.user_id, "cancelled")}>Cancel</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Full Stripe integration added in Phase 2.</p>
        </Section>

        <Section title="Available Deals (all users, status = Active)">
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="data-table w-full">
              <thead><tr><th>Address</th><th>Assignment Fee</th><th>Lead Source</th></tr></thead>
              <tbody>
                {deals.filter((d) => d.status === "active").map((d) => (
                  <tr key={d.id}>
                    <td className="font-medium">{d.property_address}</td>
                    <td className="text-primary">{d.assignment_fee ? `$${Number(d.assignment_fee).toLocaleString()}` : "—"}</td>
                    <td className="text-muted-foreground">{d.lead_source || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Deal Heatmap by Market (Coming Soon)">
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center gap-2 text-muted-foreground mb-3 text-sm">
              <MapPin className="h-4 w-4" /> Deals per state
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {Object.entries(dealsByState).sort(([, a], [, b]) => b - a).map(([state, n]) => (
                <div key={state} className="flex items-center justify-between bg-secondary rounded px-3 py-2">
                  <span className="font-mono font-semibold">{state}</span>
                  <span className="text-primary font-bold">{n}</span>
                </div>
              ))}
              {Object.keys(dealsByState).length === 0 && <p className="text-sm text-muted-foreground col-span-full">No state data yet.</p>}
            </div>
          </div>
        </Section>
      </div>
    </AppLayout>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
          <div className="text-2xl font-bold mt-1">{value}</div>
        </div>
        <div className="text-primary opacity-60">{icon}</div>
      </div>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (<div><h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">{title}</h2>{children}</div>);
}
