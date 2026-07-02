import { useEffect, useMemo, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { scopeToLocation, getActiveLocationId } from "@/lib/locationScope";
import { useAuth } from "@/hooks/useAuth";
import { useActiveLocation } from "@/contexts/LocationContext";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  CalendarClock, DollarSign, AlertTriangle, Sparkles, TrendingUp,
  CheckSquare, ArrowRight, Briefcase, Target, FileSignature, Timer,
  MessageSquare, Users, UserCheck,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, addDays, startOfMonth, endOfMonth, subDays, subMonths, startOfYear } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const COLORS = ["#CC0000", "#FF1A1A", "#FF6B6B", "#FFA07A", "#FFD93D", "#6BCB77"];

export default function Dashboard() {
  const { user, profile, isAdmin, isSuperAdmin, loading: authLoading } = useAuth();
  const { activeLocation, isIframed, handshakeReady } = useActiveLocation();

  // Live-summary state (top cards + lists)
  const [summary, setSummary] = useState<{
    closingsThisWeek: any[]; emdOverdue: any[]; ipExpiring: any[];
    newLeads: number; revenueMTD: number; openTasks: number;
    dealsUnderContract: number; avgDaysToAssign: number | null; avgOffersPerDeal: number | null;
    newBuyersThisWeek: number; activeBuyers90d: number;
    dealsAssignedThisWeek: number; closeRatePct: number | null; avgAssignmentFee: number | null;
  } | null>(null);

  // KPI / charts state
  const [deals, setDeals] = useState<any[]>([]);
  const [buyers, setBuyers] = useState<any[]>([]);
  const [owners, setOwners] = useState<{ user_id: string; name: string | null; email: string | null }[]>([]);
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [range, setRange] = useState("month");
  const now = new Date();
  const [customYear, setCustomYear] = useState(now.getFullYear());
  const [fromMonth, setFromMonth] = useState(now.getMonth());
  const [toMonth, setToMonth] = useState(now.getMonth());

  if (!isIframed && !authLoading && isSuperAdmin && !activeLocation) {
    return <Navigate to="/admin" replace />;
  }

  // Load top-of-page summary
  useEffect(() => {
    if (isIframed ? !handshakeReady : !user) return;
    (async () => {
      const today = new Date();
      const weekFromNow = addDays(today, 7);
      const monthStart = startOfMonth(today);
      const todayISO = format(today, "yyyy-MM-dd");
      const weekISO = format(weekFromNow, "yyyy-MM-dd");
      const sevenDaysAgo = format(addDays(today, -7), "yyyy-MM-dd");
      const ninetyDaysAgoISO = addDays(today, -90).toISOString();
      const sevenDaysAgoISO = addDays(today, -7).toISOString();

      const [
        closings, emd, ip, leads, revenue, openTasks,
        underContract, assigned, offerAgg, newBuyers, activeBuyerDeals,
        assignedThisWeek, allDealsForRate, allFees,
      ] = await Promise.all([
        scopeToLocation(supabase.from("deals").select("id,property_address,city,state,closing_date,assignment_fee").is("deleted_at", null).gte("closing_date", todayISO).lte("closing_date", weekISO).order("closing_date")),
        scopeToLocation(supabase.from("deals").select("id,property_address,emd_amount,closing_date,status").is("deleted_at", null).eq("status", "under_contract").eq("emd_received", false)),
        scopeToLocation(supabase.from("deals").select("id,property_address,ip_expiry_date").is("deleted_at", null).gte("ip_expiry_date", todayISO).lte("ip_expiry_date", weekISO).order("ip_expiry_date")),
        scopeToLocation(supabase.from("deals").select("id", { count: "exact", head: true }).is("deleted_at", null).gte("created_at", sevenDaysAgo)),
        scopeToLocation(supabase.from("deals").select("assignment_fee").is("deleted_at", null).gte("closed_at", monthStart.toISOString())),
        scopeToLocation(supabase.from("tasks").select("id", { count: "exact", head: true }).eq("is_completed", false)),
        scopeToLocation(supabase.from("deals").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("status", "under_contract")),
        scopeToLocation(supabase.from("deals").select("created_at,assigned_at").is("deleted_at", null).not("assigned_at", "is", null)),
        scopeToLocation(supabase.from("deals").select("id, deal_offers(id)").is("deleted_at", null)),
        scopeToLocation(supabase.from("buyers").select("id", { count: "exact", head: true }).gte("created_at", sevenDaysAgo)),
        scopeToLocation(supabase.from("deals").select("buyer_id").is("deleted_at", null).eq("status", "closed").not("buyer_id", "is", null).gte("closed_at", ninetyDaysAgoISO)),
        scopeToLocation(supabase.from("deals").select("id", { count: "exact", head: true }).is("deleted_at", null).gte("assigned_at", sevenDaysAgoISO)),
        scopeToLocation(supabase.from("deals").select("status").is("deleted_at", null)),
        scopeToLocation(supabase.from("deals").select("assignment_fee").is("deleted_at", null).not("assignment_fee", "is", null)),
      ]);

      const assignedRows = (assigned.data as any) || [];
      const avgDays = assignedRows.length
        ? assignedRows.reduce((s: number, d: any) => {
            const a = new Date(d.assigned_at).getTime();
            const c = new Date(d.created_at).getTime();
            return s + Math.max(0, (a - c) / 86400000);
          }, 0) / assignedRows.length
        : null;

      const offerRows = (offerAgg.data as any) || [];
      const totalOffers = offerRows.reduce((s: number, d: any) => s + (d.deal_offers?.length || 0), 0);
      const avgOffers = offerRows.length ? totalOffers / offerRows.length : null;

      const activeBuyerIds = new Set<string>();
      ((activeBuyerDeals.data as any) || []).forEach((r: any) => r.buyer_id && activeBuyerIds.add(r.buyer_id));

      const allRateRows = (allDealsForRate.data as any) || [];
      const closedCount = allRateRows.filter((d: any) => d.status === "closed").length;
      const closeRate = allRateRows.length ? (closedCount / allRateRows.length) * 100 : null;

      const feeRows = ((allFees.data as any) || []).map((r: any) => Number(r.assignment_fee)).filter((n: number) => !isNaN(n) && n > 0);
      const avgFee = feeRows.length ? feeRows.reduce((s: number, n: number) => s + n, 0) / feeRows.length : null;

      setSummary({
        closingsThisWeek: (closings.data as any) || [],
        emdOverdue: (emd.data as any) || [],
        ipExpiring: (ip.data as any) || [],
        newLeads: leads.count || 0,
        revenueMTD: ((revenue.data as any) || []).reduce((s: number, d: any) => s + (Number(d.assignment_fee) || 0), 0),
        openTasks: openTasks.count || 0,
        dealsUnderContract: underContract.count || 0,
        avgDaysToAssign: avgDays,
        avgOffersPerDeal: avgOffers,
        newBuyersThisWeek: newBuyers.count || 0,
        activeBuyers90d: activeBuyerIds.size,
        dealsAssignedThisWeek: assignedThisWeek.count || 0,
        closeRatePct: closeRate,
        avgAssignmentFee: avgFee,
      });
    })();
  }, [user, handshakeReady, activeLocation?.locationId, isIframed]);

  // Load KPI data (deals + buyers + owners)
  useEffect(() => {
    if (!user) return;
    const activeLoc = getActiveLocationId();
    const inLocation = isIframed || !!activeLoc || isAdmin;
    const dealsQ = inLocation
      ? supabase.from("deals").select("*").is("deleted_at", null)
      : supabase.from("deals").select("*").is("deleted_at", null).eq("user_id", user.id);
    const buyersQ = inLocation
      ? supabase.from("buyers").select("id, created_at")
      : supabase.from("buyers").select("id, created_at").eq("user_id", user.id);
    const promises: any[] = [scopeToLocation(dealsQ), scopeToLocation(buyersQ)];
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
      case "last": { const lm = subMonths(n, 1); return { from: startOfMonth(lm), to: endOfMonth(lm) }; }
      case "90": return { from: subDays(n, 90), to: n };
      case "year": return { from: startOfYear(n), to: n };
      case "custom": {
        const lo = Math.min(fromMonth, toMonth); const hi = Math.max(fromMonth, toMonth);
        return { from: startOfMonth(new Date(customYear, lo, 1)), to: endOfMonth(new Date(customYear, hi, 1)) };
      }
      default: return { from: new Date(0), to: n };
    }
  }, [range, fromMonth, toMonth, customYear]);

  const ownerScoped = ownerFilter === "all" ? deals : deals.filter((d) => d.owner_id === ownerFilter);
  const filtered = ownerScoped.filter((d) => { const c = new Date(d.created_at); return c >= from && c <= to; });
  const closed = filtered.filter((d) => d.status === "closed");
  const active = ownerScoped.filter((d) => ["active", "under_contract"].includes(d.status));
  const revenueCreated = filtered.reduce((s, d) => s + (Number(d.assignment_fee) || 0), 0);
  const revenueClosed = closed.reduce((s, d) => s + (Number(d.assignment_fee) || 0), 0);
  const conversion = filtered.length ? Math.round((filtered.filter((d) => d.status === "under_contract" || d.status === "closed").length / filtered.length) * 100) : 0;

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

  const expectedVsActual = useMemo(() => {
    return ownerScoped
      .filter((d) => d.status === "closed")
      .sort((a, b) => new Date(b.closed_at || b.updated_at || b.created_at).getTime() - new Date(a.closed_at || a.updated_at || a.created_at).getTime())
      .slice(0, 30).reverse()
      .map((d) => {
        const label = (d.marketing_name || d.property_address || "Untitled").toString();
        const short = label.length > 22 ? label.slice(0, 22) + "…" : label;
        return { name: short, fullName: label, expected: Number(d.expected_assignment) || 0, actual: Number(d.assignment_fee) || 0 };
      });
  }, [ownerScoped]);

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
      if (d.status === "closed") { m[key].closed += 1; m[key].revenue += Number(d.assignment_fee) || 0; }
    });
    return Object.values(m).sort((a, b) => b.revenue - a.revenue);
  }, [ownerScoped, owners, isIframed, activeLocation]);

  const displayName = isIframed ? activeLocation?.userName || null : profile?.name || null;
  const fmt = (n: number | null, digits = 1) => n === null ? "—" : n.toFixed(digits);

  return (
    <AppLayout>
      <PageHeader
        title={`Welcome back${displayName ? `, ${displayName.split(" ")[0]}` : ""}`}
        subtitle="Here's what's happening across your pipeline today."
      />

      <div className="px-6 lg:px-8 py-6">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="deals">Deal Metrics</TabsTrigger>
            <TabsTrigger value="buyers">Buyer Metrics</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="space-y-6 mt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard icon={DollarSign} label="Revenue MTD" value={summary ? `$${summary.revenueMTD.toLocaleString()}` : null} tone="primary" />
              <KpiCard icon={Sparkles} label="New Leads (7d)" value={summary ? String(summary.newLeads) : null} link="/pipeline" />
              <KpiCard icon={CalendarClock} label="Closings This Week" value={summary ? String(summary.closingsThisWeek.length) : null} link="/pipeline" />
              <KpiCard icon={CheckSquare} label="Open Tasks" value={summary ? String(summary.openTasks) : null} link="/tasks" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <ListCard title="Closings this week" icon={CalendarClock} items={summary?.closingsThisWeek || []} loading={!summary} empty="No closings scheduled"
                render={(d) => (
                  <Link to="/pipeline" className="block py-2 px-3 rounded hover:bg-muted">
                    <div className="text-sm font-medium truncate">{d.property_address}</div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{d.city}{d.state ? `, ${d.state}` : ""}</span>
                      <span>{format(new Date(d.closing_date), "MMM d")}</span>
                    </div>
                  </Link>
                )} />
              <ListCard title="EMD outstanding" icon={AlertTriangle} tone="warn" items={summary?.emdOverdue || []} loading={!summary} empty="All EMDs received"
                render={(d) => (
                  <Link to="/pipeline" className="block py-2 px-3 rounded hover:bg-muted">
                    <div className="text-sm font-medium truncate">{d.property_address}</div>
                    <div className="text-xs text-muted-foreground">${Number(d.emd_amount || 0).toLocaleString()} · under contract</div>
                  </Link>
                )} />
              <ListCard title="IP expiring soon" icon={CalendarClock} tone="warn" items={summary?.ipExpiring || []} loading={!summary} empty="No IPs expiring"
                render={(d) => (
                  <Link to="/pipeline" className="block py-2 px-3 rounded hover:bg-muted">
                    <div className="text-sm font-medium truncate">{d.property_address}</div>
                    <div className="text-xs text-muted-foreground">Expires {format(new Date(d.ip_expiry_date), "MMM d")}</div>
                  </Link>
                )} />
            </div>
          </TabsContent>

          {/* DEAL METRICS */}
          <TabsContent value="deals" className="space-y-4 mt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <KpiCard icon={FileSignature} label="Deals Under Contract" value={summary ? String(summary.dealsUnderContract) : null} link="/pipeline" />
              <KpiCard icon={CalendarClock} label="Deals Assigned This Week" value={summary ? String(summary.dealsAssignedThisWeek) : null} link="/pipeline" />
              <KpiCard icon={Target} label="Close Rate" value={summary ? (summary.closeRatePct === null ? "—" : `${summary.closeRatePct.toFixed(1)}%`) : null} hint="Closed / all deals (all-time)" />
              <KpiCard icon={Timer} label="Avg Days to Assign" value={summary ? (summary.avgDaysToAssign === null ? "—" : `${fmt(summary.avgDaysToAssign)}d`) : null} />
              <KpiCard icon={MessageSquare} label="Avg Offers per Deal" value={summary ? (summary.avgOffersPerDeal === null ? "—" : fmt(summary.avgOffersPerDeal, 2)) : null} />
              <KpiCard icon={DollarSign} label="Avg Assignment Fee" value={summary ? (summary.avgAssignmentFee === null ? "—" : `$${Math.round(summary.avgAssignmentFee).toLocaleString()}`) : null} tone="primary" />
            </div>
          </TabsContent>

          {/* BUYER METRICS */}
          <TabsContent value="buyers" className="space-y-4 mt-0">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <KpiCard icon={Users} label="New Buyers (7d)" value={summary ? String(summary.newBuyersThisWeek) : null} link="/buyers" />
              <KpiCard icon={UserCheck} label="Active Buyers (90d)" value={summary ? String(summary.activeBuyers90d) : null} link="/buyers" hint="Bought a deal in the last 90 days" />
              <KpiCard icon={TrendingUp} label="Text Blast Open %" value={summary ? "—" : null} hint="Awaiting SMS provider integration" />
            </div>
          </TabsContent>

          {/* ANALYTICS */}
          <TabsContent value="analytics" className="space-y-6 mt-0">

          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-lg font-semibold">Performance Analytics</h2>
            <div className="flex items-center gap-2">
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
                              i === fromMonth ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40")}>
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
                              i === toMonth ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40")}>
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
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
                  No closed deals yet. Once a deal closes, its Expected vs Actual assignment will appear here.
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
                  <thead><tr><th>Owner</th><th>Deals</th><th>Closed</th><th>Revenue</th></tr></thead>
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

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
            <Stat label="Top Lead Source" value={leadSourceData.sort((a, b) => b.value - a.value)[0]?.name || "—"} />
            <Stat label="Total Deals" value={String(deals.length)} />
            <Stat label="Avg Assignment Fee" value={`$${deals.length ? Math.round(deals.reduce((s, d) => s + (Number(d.assignment_fee) || 0), 0) / deals.length).toLocaleString() : 0}`} />
            <Stat label="Total Buyers" value={String(buyers.length)} />
          </div>
          </TabsContent>

        </Tabs>
      </div>

    </AppLayout>
  );
}

function KpiCard({ icon: Icon, label, value, link, tone, hint }: any) {
  const inner = (
    <div className={`rounded-lg border border-border bg-card p-4 hover:border-primary/40 transition-colors ${tone === "primary" ? "ring-1 ring-primary/20" : ""}`}>
      <div className="flex items-center justify-between mb-2">
        <Icon className={`h-4 w-4 ${tone === "primary" ? "text-primary" : "text-muted-foreground"}`} />
        {link && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />}
      </div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      {value === null ? <Skeleton className="h-7 w-20 mt-1" /> : <div className="text-2xl font-bold mt-0.5">{value}</div>}
      {hint && <div className="text-[10px] text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
  return link ? <Link to={link} className="group">{inner}</Link> : inner;
}

function ListCard({ title, icon: Icon, items, loading, empty, render, tone }: any) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className={`flex items-center gap-2 px-4 py-3 border-b border-border ${tone === "warn" ? "text-orange-600 dark:text-orange-400" : ""}`}>
        <Icon className="h-4 w-4" />
        <div className="text-sm font-semibold">{title}</div>
        <div className="ml-auto text-xs text-muted-foreground">{items?.length || 0}</div>
      </div>
      <div className="p-2 max-h-[340px] overflow-y-auto">
        {loading ? (
          <div className="space-y-1.5 p-1">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-6">{empty}</div>
        ) : (
          items.map((it: any) => <div key={it.id}>{render(it)}</div>)
        )}
      </div>
    </div>
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
