import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { scopeToLocation, getActiveLocationId } from "@/lib/locationScope";
import { useAuth } from "@/hooks/useAuth";
import { useActiveLocation } from "@/contexts/LocationContext";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { TrendingUp, DollarSign, Briefcase, Target } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, startOfMonth, endOfMonth, subDays, subMonths, startOfYear } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const COLORS = ["#CC0000", "#FF1A1A", "#FF6B6B", "#FFA07A", "#FFD93D", "#6BCB77"];

export default function KPIs() {
  const { user, isAdmin } = useAuth();
  const { isIframed, activeLocation } = useActiveLocation();
  const [deals, setDeals] = useState<any[]>([]);
  const [buyers, setBuyers] = useState<any[]>([]);
  const [owners, setOwners] = useState<{ user_id: string; name: string | null; email: string | null }[]>([]);
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [range, setRange] = useState("month");
  const now = new Date();
  const [customYear, setCustomYear] = useState(now.getFullYear());
  const [fromMonth, setFromMonth] = useState(now.getMonth());
  const [toMonth, setToMonth] = useState(now.getMonth());

  useEffect(() => {
    if (!user) return;
    // When a GHL location is active (iframe or standalone admin), include all rows for the
    // location (incl. webhook-imported with user_id=NULL). RLS enforces location scoping.
    // Admin / super_admin also skip the user_id self-filter — they intentionally view tenant
    // data including webhook-imported rows with user_id=NULL. Recurring regression (3rd time);
    // don't re-add the fallback for admins.
    const activeLoc = getActiveLocationId();
    const inLocation = isIframed || !!activeLoc || isAdmin;
    const dealsQ = inLocation
      ? supabase.from("deals").select("*").is("deleted_at", null)
      : supabase.from("deals").select("*").is("deleted_at", null).eq("user_id", user.id);
    const buyersQ = inLocation
      ? supabase.from("buyers").select("id, created_at")
      : supabase.from("buyers").select("id, created_at").eq("user_id", user.id);
    const promises: any[] = [
      scopeToLocation(dealsQ),
      scopeToLocation(buyersQ),
    ];
    // SECURITY: never source the iframe owners dropdown from the Lovable `profiles` table —
    // it can leak workspace users from other tenants. In iframe mode we leave owners empty
    // and hide the dropdown; identity comes from GHL (ghl_assigned_user_id / activeLocation.userName).
    if (!isIframed) {
      promises.push(supabase.from("profiles").select("user_id,name,email").order("name"));
    }
    Promise.all(promises).then(([d, b, o]) => {
      setDeals(d.data || []);
      setBuyers(b.data || []);
      setOwners(isIframed ? [] : ((o?.data as any) || []));
    });
  }, [user, isIframed, isAdmin]);

  const { from, to } = useMemo(() => {
    const n = new Date();
    switch (range) {
      case "month": return { from: startOfMonth(n), to: n };
      case "last": {
        const lm = subMonths(n, 1);
        return { from: startOfMonth(lm), to: endOfMonth(lm) };
      }
      case "90": return { from: subDays(n, 90), to: n };
      case "year": return { from: startOfYear(n), to: n };
      case "custom": {
        const lo = Math.min(fromMonth, toMonth);
        const hi = Math.max(fromMonth, toMonth);
        return {
          from: startOfMonth(new Date(customYear, lo, 1)),
          to: endOfMonth(new Date(customYear, hi, 1)),
        };
      }
      default: return { from: new Date(0), to: n };
    }
  }, [range, fromMonth, toMonth, customYear]);

  const ownerScoped = ownerFilter === "all" ? deals : deals.filter((d) => d.owner_id === ownerFilter);
  const filtered = ownerScoped.filter((d) => {
    const c = new Date(d.created_at);
    return c >= from && c <= to;
  });
  const closed = filtered.filter((d) => d.status === "closed");
  const active = ownerScoped.filter((d) => ["active", "under_contract"].includes(d.status));
  const revenueCreated = filtered.reduce((s, d) => s + (Number(d.assignment_fee) || 0), 0);
  const revenueClosed = closed.reduce((s, d) => s + (Number(d.assignment_fee) || 0), 0);
  const conversion = filtered.length ? Math.round((filtered.filter((d) => d.status === "under_contract" || d.status === "closed").length / filtered.length) * 100) : 0;

  // Monthly revenue
  const monthly = useMemo(() => {
    const buckets: Record<string, { month: string; created: number; closed: number }> = {};
    for (let i = 5; i >= 0; i--) {
      const key = format(subMonths(new Date(), i), "MMM");
      buckets[key] = { month: key, created: 0, closed: 0 };
    }
    deals.forEach((d) => {
      const key = format(new Date(d.created_at), "MMM");
      if (buckets[key]) buckets[key].created += Number(d.assignment_fee) || 0;
      if (d.status === "closed" && buckets[key]) buckets[key].closed += Number(d.assignment_fee) || 0;
    });
    return Object.values(buckets);
  }, [deals]);

  // Lead source
  const leadSourceData = useMemo(() => {
    const m: Record<string, number> = {};
    deals.forEach((d) => { const s = d.lead_source || "Unknown"; m[s] = (m[s] || 0) + 1; });
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, [deals]);

  const avgFeeBySource = useMemo(() => {
    const m: Record<string, { sum: number; count: number }> = {};
    deals.forEach((d) => {
      const s = d.lead_source || "Unknown";
      m[s] = m[s] || { sum: 0, count: 0 };
      m[s].sum += Number(d.assignment_fee) || 0; m[s].count += 1;
    });
    return Object.entries(m).map(([name, { sum, count }]) => ({ name, avg: Math.round(sum / count) }));
  }, [deals]);

  // Expected vs Actual Assignment per closed deal (most recent 30)
  const expectedVsActual = useMemo(() => {
    return ownerScoped
      .filter((d) => d.status === "closed")
      .sort((a, b) => {
        const ad = new Date(a.closed_at || a.updated_at || a.created_at).getTime();
        const bd = new Date(b.closed_at || b.updated_at || b.created_at).getTime();
        return bd - ad;
      })
      .slice(0, 30)
      .reverse()
      .map((d) => {
        const label = (d.marketing_name || d.property_address || "Untitled").toString();
        const short = label.length > 22 ? label.slice(0, 22) + "…" : label;
        return {
          name: short,
          fullName: label,
          expected: Number(d.expected_assignment) || 0,
          actual: Number(d.assignment_fee) || 0,
        };
      });
  }, [ownerScoped]);

  // By owner (dispo manager)
  // In iframe mode, NEVER show users.email/name from the Lovable profiles table —
  // those leak across tenants. Use GHL identity from the deal (ghl_assigned_user_id)
  // or the active location's userName. Owner badges fall back to "GHL user" / "Unassigned".
  const ownerName = (id: string | null, deal?: any) => {
    if (isIframed) {
      const ghlId = deal?.ghl_assigned_user_id;
      if (ghlId) {
        if (activeLocation?.userName && ghlId === (activeLocation as any).userId) return activeLocation.userName;
        return `GHL: ${String(ghlId).slice(0, 8)}`;
      }
      return "Unassigned";
    }
    if (!id) return "Unassigned";
    const o = owners.find((x) => x.user_id === id);
    return o?.name || o?.email || id.slice(0, 8);
  };
  const byOwner = useMemo(() => {
    const m: Record<string, { name: string; deals: number; closed: number; revenue: number }> = {};
    ownerScoped.forEach((d) => {
      const key = (isIframed ? d.ghl_assigned_user_id : d.owner_id) || "unassigned";
      m[key] = m[key] || { name: ownerName(d.owner_id, d), deals: 0, closed: 0, revenue: 0 };
      m[key].deals += 1;
      if (d.status === "closed") {
        m[key].closed += 1;
        m[key].revenue += Number(d.assignment_fee) || 0;
      }
    });
    return Object.values(m).sort((a, b) => b.revenue - a.revenue);
  }, [ownerScoped, owners, isIframed, activeLocation]);

  return (
    <AppLayout>
      <PageHeader
        title="KPI Dashboard"
        actions={
          <div className="flex items-center gap-2">
            {/* Owners dropdown is HIDDEN in iframe — sourcing it from the cross-tenant
                Lovable profiles table leaks workspace users from other tenants. */}
            {!isIframed && (
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger className="w-48"><SelectValue placeholder="All Owners" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Owners</SelectItem>
                  {owners.map((o) => (
                    <SelectItem key={o.user_id} value={o.user_id}>{o.name || o.email || o.user_id.slice(0, 8)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="last">Last Month</SelectItem>
                <SelectItem value="90">Last 90 Days</SelectItem>
                <SelectItem value="year">This Year</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
            {range === "custom" && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("justify-start text-left font-normal")}>
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {MONTHS[Math.min(fromMonth, toMonth)]} – {MONTHS[Math.max(fromMonth, toMonth)]} {customYear}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-4 space-y-3" align="end">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Year</span>
                    <Select value={String(customYear)} onValueChange={(v) => setCustomYear(Number(v))}>
                      <SelectTrigger className="w-24 h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 6 }).map((_, i) => {
                          const y = now.getFullYear() - i;
                          return <SelectItem key={y} value={String(y)}>{y}</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">From</div>
                    <div className="grid grid-cols-4 gap-1">
                      {MONTHS.map((m, i) => (
                        <button key={m} onClick={() => setFromMonth(i)}
                          className={cn("text-xs py-1.5 rounded border transition",
                            i === fromMonth ? "bg-primary text-primary-foreground border-primary"
                              : "border-border text-muted-foreground hover:border-primary/40")}>
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">To</div>
                    <div className="grid grid-cols-4 gap-1">
                      {MONTHS.map((m, i) => (
                        <button key={m} onClick={() => setToMonth(i)}
                          className={cn("text-xs py-1.5 rounded border transition",
                            i === toMonth ? "bg-primary text-primary-foreground border-primary"
                              : "border-border text-muted-foreground hover:border-primary/40")}>
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
        }
      />
      <div className="p-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Stat icon={<DollarSign />} label="Revenue Created" value={`$${revenueCreated.toLocaleString()}`} />
          <Stat icon={<TrendingUp />} label="Revenue Closed" value={`$${revenueClosed.toLocaleString()}`} />
          <Stat icon={<Briefcase />} label="Deals Active" value={String(active.length)} />
          <Stat icon={<Target />} label="Contract Conversion" value={`${conversion}%`} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-semibold mb-4">Monthly Revenue</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Legend />
                <Bar dataKey="created" fill="#CC0000" name="Created" />
                <Bar dataKey="closed" fill="#FF6B6B" name="Closed" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-semibold mb-4">Deals by Lead Source</h3>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={leadSourceData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90}>
                  {leadSourceData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-card border border-border rounded-lg p-5 lg:col-span-2">
            <h3 className="text-sm font-semibold mb-4">Average Assignment Fee by Lead Source</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={avgFeeBySource}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="avg" fill="#CC0000" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card border border-border rounded-lg p-5 lg:col-span-2">
            <h3 className="text-sm font-semibold mb-4">Expected vs Actual Assignment (per closed deal)</h3>
            {expectedVsActual.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No closed deals yet. Once a deal closes, its Expected vs Actual assignment will appear here so you can compare forecast to reality.
              </p>
            ) : (
              <div style={{ width: "100%", overflowX: expectedVsActual.length > 10 ? "auto" : "visible" }}>
                <div style={{ minWidth: Math.max(expectedVsActual.length * 70, 600) }}>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={expectedVsActual} margin={{ top: 10, right: 20, left: 0, bottom: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} angle={-35} textAnchor="end" interval={0} height={70} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                        content={({ active: a, payload }) => {
                          if (!a || !payload?.length) return null;
                          const row: any = payload[0].payload;
                          const variance = row.actual - row.expected;
                          const pct = row.expected ? Math.round((variance / row.expected) * 100) : null;
                          return (
                            <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-xl">
                              <div className="font-semibold mb-1">{row.fullName}</div>
                              <div>Expected: <span className="font-mono">${row.expected.toLocaleString()}</span></div>
                              <div>Actual: <span className="font-mono">${row.actual.toLocaleString()}</span></div>
                              {row.expected > 0 && (
                                <div className={cn("mt-1", variance < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400")}>
                                  Off by ${Math.abs(variance).toLocaleString()}{pct !== null ? ` / ${pct > 0 ? "+" : ""}${pct}%` : ""}
                                </div>
                              )}
                            </div>
                          );
                        }}
                      />
                      <Legend />
                      <Bar dataKey="expected" fill="hsl(var(--muted-foreground))" name="Expected" />
                      <Bar dataKey="actual" fill="#CC0000" name="Actual" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>



          <div className="bg-card border border-border rounded-lg p-5 lg:col-span-2">
            <h3 className="text-sm font-semibold mb-4">Performance by Dispo Manager</h3>
            {byOwner.length === 0 ? (
              <p className="text-sm text-muted-foreground">No deals yet.</p>
            ) : (
              <table className="data-table w-full">
                <thead>
                  <tr><th>Owner</th><th>Deals</th><th>Closed</th><th>Revenue</th></tr>
                </thead>
                <tbody>
                  {byOwner.map((o) => (
                    <tr key={o.name}>
                      <td className="font-medium">{o.name}</td>
                      <td>{o.deals}</td>
                      <td>{o.closed}</td>
                      <td className="text-primary font-semibold">${o.revenue.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Stat label="Top Lead Source" value={leadSourceData.sort((a, b) => b.value - a.value)[0]?.name || "—"} />
          <Stat label="Total Deals" value={String(deals.length)} />
          <Stat label="Avg Assignment Fee" value={`$${deals.length ? Math.round(deals.reduce((s, d) => s + (Number(d.assignment_fee) || 0), 0) / deals.length).toLocaleString() : 0}`} />
          <Stat label="Total Buyers" value={String(buyers.length)} />
        </div>
      </div>
    </AppLayout>
  );
}

function Stat({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
          <div className="text-2xl font-bold mt-1">{value}</div>
        </div>
        {icon && <div className="text-primary opacity-60">{icon}</div>}
      </div>
    </div>
  );
}
