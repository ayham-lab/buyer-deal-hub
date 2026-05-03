import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Briefcase, Users as UsersIcon, BarChart3 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  userId: string | null;
  onClose: () => void;
  onChanged?: () => void;
}

export function UserDrawer({ userId, onClose, onChanged }: Props) {
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [deals, setDeals] = useState<any[]>([]);
  const [buyers, setBuyers] = useState<any[]>([]);
  const [kpi, setKpi] = useState<any>(null);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    (async () => {
      const now = new Date();
      const [{ data: p }, { data: d }, { data: b }, { data: k }] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("deals").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        supabase.from("buyers").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        supabase.from("kpi_snapshots").select("*").eq("user_id", userId)
          .eq("year", now.getFullYear()).eq("month", now.getMonth() + 1).maybeSingle(),
      ]);
      setProfile(p);
      setDeals(d || []);
      setBuyers(b || []);
      setKpi(k);
      setLoading(false);
    })();
  }, [userId]);

  async function setStatus(status: string) {
    if (!userId) return;
    const { error } = await supabase.from("profiles").update({ subscription_status: status as any }).eq("user_id", userId);
    if (error) toast.error(error.message);
    else { toast.success(`Set to ${status}`); setProfile({ ...profile, subscription_status: status }); onChanged?.(); }
  }

  const revenue = deals.reduce((s, d) => s + (Number(d.assignment_fee) || 0), 0);

  return (
    <Sheet open={!!userId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{profile?.name || profile?.email || "User"}</SheetTitle>
        </SheetHeader>

        {loading ? (
          <div className="py-12 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : (
          <div className="mt-4 space-y-6">
            {/* Profile */}
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Profile</div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-xs text-muted-foreground">Email</div><div className="font-medium truncate">{profile?.email || "—"}</div></div>
                <div><div className="text-xs text-muted-foreground">GHL Location</div><div className="font-mono text-xs truncate">{profile?.ghl_location_id || "—"}</div></div>
                <div><div className="text-xs text-muted-foreground">Subscription</div><Badge variant="outline" className="capitalize">{profile?.subscription_status}</Badge></div>
                <div><div className="text-xs text-muted-foreground">Last active</div><div className="text-xs">{profile?.last_active_at ? new Date(profile.last_active_at).toLocaleString() : "—"}</div></div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button size="sm" variant="outline" onClick={() => setStatus("active")}>Set Active</Button>
                <Button size="sm" variant="outline" onClick={() => setStatus("trialing")}>Trialing</Button>
                <Button size="sm" variant="outline" onClick={() => setStatus("cancelled")}>Cancel</Button>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <MiniStat icon={<Briefcase className="h-4 w-4" />} label="Deals" value={String(deals.length)} />
              <MiniStat icon={<UsersIcon className="h-4 w-4" />} label="Buyers" value={String(buyers.length)} />
              <MiniStat icon={<BarChart3 className="h-4 w-4" />} label="Revenue" value={`$${revenue.toLocaleString()}`} />
            </div>

            {/* Current month KPI */}
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">This month KPI</div>
              {kpi ? (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><div className="text-xs text-muted-foreground">Opened</div><div className="font-semibold">{kpi.deals_opened}</div></div>
                  <div><div className="text-xs text-muted-foreground">Closed</div><div className="font-semibold">{kpi.deals_closed}</div></div>
                  <div><div className="text-xs text-muted-foreground">Revenue closed</div><div className="font-semibold text-primary">${Number(kpi.revenue_closed).toLocaleString()}</div></div>
                  <div><div className="text-xs text-muted-foreground">Conversion</div><div className="font-semibold">{Number(kpi.contract_conversion_rate).toFixed(1)}%</div></div>
                </div>
              ) : <div className="text-xs text-muted-foreground">No KPI snapshot for this month.</div>}
            </div>

            {/* Recent deals */}
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Recent deals</div>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="data-table w-full text-sm">
                  <thead><tr><th>Address</th><th>Status</th><th>Fee</th></tr></thead>
                  <tbody>
                    {deals.slice(0, 8).map((d) => (
                      <tr key={d.id}>
                        <td className="font-medium truncate max-w-[260px]">{d.property_address}</td>
                        <td><Badge variant="outline" className="capitalize">{d.status}</Badge></td>
                        <td className="text-primary">{d.assignment_fee ? `$${Number(d.assignment_fee).toLocaleString()}` : "—"}</td>
                      </tr>
                    ))}
                    {deals.length === 0 && <tr><td colSpan={3} className="text-center text-muted-foreground py-4">No deals</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Buyers */}
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Buyers</div>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="data-table w-full text-sm">
                  <thead><tr><th>Name</th><th>Status</th><th>Markets</th></tr></thead>
                  <tbody>
                    {buyers.slice(0, 8).map((b) => (
                      <tr key={b.id}>
                        <td className="font-medium">{b.name}</td>
                        <td><Badge variant="outline" className="capitalize">{b.buyer_status}</Badge></td>
                        <td className="text-xs text-muted-foreground truncate max-w-[200px]">{(b.markets || []).join(", ") || "—"}</td>
                      </tr>
                    ))}
                    {buyers.length === 0 && <tr><td colSpan={3} className="text-center text-muted-foreground py-4">No buyers</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-3">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">{icon}{label}</div>
      <div className="text-lg font-bold mt-1">{value}</div>
    </div>
  );
}
