import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
  const { user } = useAuth();
  const [deals, setDeals] = useState<any[]>([]);
  const [buyers, setBuyers] = useState<any[]>([]);
  const [range, setRange] = useState("month");
  const now = new Date();
  const [customYear, setCustomYear] = useState(now.getFullYear());
  const [fromMonth, setFromMonth] = useState(now.getMonth());
  const [toMonth, setToMonth] = useState(now.getMonth());

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("deals").select("*").eq("user_id", user.id),
      supabase.from("buyers").select("id, created_at").eq("user_id", user.id),
    ]).then(([d, b]) => { setDeals(d.data || []); setBuyers(b.data || []); });
  }, [user]);

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

  const filtered = deals.filter((d) => {
    const c = new Date(d.created_at);
    return c >= from && c <= to;
  });
  const closed = filtered.filter((d) => d.status === "closed");
  const active = deals.filter((d) => ["active", "under_contract"].includes(d.status));
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

  return (
    <AppLayout>
      <PageHeader
        title="KPI Dashboard"
        actions={
          <div className="flex items-center gap-2">
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
