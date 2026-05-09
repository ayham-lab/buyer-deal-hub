import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useActiveLocation } from "@/contexts/LocationContext";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import {
  CalendarClock,
  DollarSign,
  AlertTriangle,
  Sparkles,
  TrendingUp,
  CheckSquare,
  ArrowRight,
} from "lucide-react";
import { format, addDays, startOfMonth } from "date-fns";

interface Stats {
  closingsThisWeek: any[];
  emdOverdue: any[];
  ipExpiring: any[];
  newLeads: number;
  revenueMTD: number;
  openTasks: number;
}

export default function Dashboard() {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const today = new Date();
      const weekFromNow = addDays(today, 7);
      const monthStart = startOfMonth(today);
      const todayISO = format(today, "yyyy-MM-dd");
      const weekISO = format(weekFromNow, "yyyy-MM-dd");
      const sevenDaysAgo = format(addDays(today, -7), "yyyy-MM-dd");

      const [closings, emd, ip, leads, revenue, openTasks] = await Promise.all([
        supabase.from("deals").select("id,property_address,city,state,closing_date,assignment_fee").gte("closing_date", todayISO).lte("closing_date", weekISO).order("closing_date"),
        supabase.from("deals").select("id,property_address,emd_amount,closing_date,status").eq("status", "under_contract").eq("emd_received", false),
        supabase.from("deals").select("id,property_address,ip_expiry_date").gte("ip_expiry_date", todayISO).lte("ip_expiry_date", weekISO).order("ip_expiry_date"),
        supabase.from("deals").select("id", { count: "exact", head: true }).gte("created_at", sevenDaysAgo),
        supabase.from("deals").select("assignment_fee").gte("closed_at", monthStart.toISOString()),
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("is_completed", false),
      ]);

      setStats({
        closingsThisWeek: (closings.data as any) || [],
        emdOverdue: (emd.data as any) || [],
        ipExpiring: (ip.data as any) || [],
        newLeads: leads.count || 0,
        revenueMTD: ((revenue.data as any) || []).reduce((sum: number, d: any) => sum + (Number(d.assignment_fee) || 0), 0),
        openTasks: openTasks.count || 0,
      });
    })();
  }, [user]);

  return (
    <AppLayout>
      <PageHeader
        title={`Welcome back${profile?.name ? `, ${profile.name.split(" ")[0]}` : ""}`}
        subtitle="Here's what's happening across your pipeline today."
      />

      <div className="px-6 lg:px-8 py-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard icon={DollarSign} label="Revenue MTD" value={stats ? `$${stats.revenueMTD.toLocaleString()}` : null} link="/kpis" tone="primary" />
          <KpiCard icon={Sparkles} label="New Leads (7d)" value={stats ? String(stats.newLeads) : null} link="/pipeline" tone="default" />
          <KpiCard icon={CalendarClock} label="Closings This Week" value={stats ? String(stats.closingsThisWeek.length) : null} link="/pipeline" tone="default" />
          <KpiCard icon={CheckSquare} label="Open Tasks" value={stats ? String(stats.openTasks) : null} link="/tasks" tone="default" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ListCard
            title="Closings this week"
            icon={CalendarClock}
            items={stats?.closingsThisWeek || []}
            loading={!stats}
            empty="No closings scheduled"
            render={(d) => (
              <Link to="/pipeline" className="block py-2 px-3 rounded hover:bg-muted">
                <div className="text-sm font-medium truncate">{d.property_address}</div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{d.city}{d.state ? `, ${d.state}` : ""}</span>
                  <span>{format(new Date(d.closing_date), "MMM d")}</span>
                </div>
              </Link>
            )}
          />
          <ListCard
            title="EMD outstanding"
            icon={AlertTriangle}
            tone="warn"
            items={stats?.emdOverdue || []}
            loading={!stats}
            empty="All EMDs received"
            render={(d) => (
              <Link to="/pipeline" className="block py-2 px-3 rounded hover:bg-muted">
                <div className="text-sm font-medium truncate">{d.property_address}</div>
                <div className="text-xs text-muted-foreground">
                  ${Number(d.emd_amount || 0).toLocaleString()} · under contract
                </div>
              </Link>
            )}
          />
          <ListCard
            title="IP expiring soon"
            icon={CalendarClock}
            tone="warn"
            items={stats?.ipExpiring || []}
            loading={!stats}
            empty="No IPs expiring"
            render={(d) => (
              <Link to="/pipeline" className="block py-2 px-3 rounded hover:bg-muted">
                <div className="text-sm font-medium truncate">{d.property_address}</div>
                <div className="text-xs text-muted-foreground">
                  Expires {format(new Date(d.ip_expiry_date), "MMM d")}
                </div>
              </Link>
            )}
          />
        </div>
      </div>
    </AppLayout>
  );
}

function KpiCard({ icon: Icon, label, value, link, tone }: any) {
  const inner = (
    <div className={`rounded-lg border border-border bg-card p-4 hover:border-primary/40 transition-colors ${tone === "primary" ? "ring-1 ring-primary/20" : ""}`}>
      <div className="flex items-center justify-between mb-2">
        <Icon className={`h-4 w-4 ${tone === "primary" ? "text-primary" : "text-muted-foreground"}`} />
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      {value === null ? <Skeleton className="h-7 w-20 mt-1" /> : <div className="text-2xl font-bold mt-0.5">{value}</div>}
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
