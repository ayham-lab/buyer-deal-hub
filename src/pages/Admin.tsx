import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Users, Briefcase, DollarSign, Database, MapPin, Search, ShieldCheck,
  TrendingUp, Loader2, Trash2, RotateCcw,
} from "lucide-react";
import { UserDrawer } from "@/components/admin/UserDrawer";
import { RoleManager } from "@/components/admin/RoleManager";
import { PricingTab } from "@/components/admin/PricingTab";
import { ArchiveBuyersTab } from "@/components/admin/ArchiveBuyersTab";
import { ImportBuyersTab } from "@/components/admin/ImportBuyersTab";
import { ArchiveTitleCompaniesTab } from "@/components/admin/ArchiveTitleCompaniesTab";
import { OperatorAccountsTab } from "@/components/admin/OperatorAccountsTab";
import { SkiptraceBuyersTab } from "@/components/admin/SkiptraceBuyersTab";
import { useActiveLocation } from "@/contexts/LocationContext";
import { useAuth } from "@/hooks/useAuth";

export default function Admin() {
  const { isIframed } = useActiveLocation();
  const { isSuperAdmin } = useAuth();
  const showPricing = !isIframed;
  const showArchiveBuyers = !isIframed && isSuperAdmin;
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [buyers, setBuyers] = useState<any[]>([]);
  const [archive, setArchive] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [locationNames, setLocationNames] = useState<Record<string, string>>({});
  const [openUserId, setOpenUserId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [{ data: pf }, { data: dl }, { data: by }, { data: ar }, { data: rl }, { data: lt }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("deals").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
      supabase.from("buyers").select("*").order("created_at", { ascending: false }),
      supabase.from("buyer_archive").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("*"),
      supabase.from("ghl_location_tokens").select("ghl_location_id, location_name"),
    ]);
    setUsers(pf || []); setDeals(dl || []); setBuyers(by || []); setArchive(ar || []); setRoles(rl || []);
    const map: Record<string, string> = {};
    (lt || []).forEach((r: any) => { if (r.ghl_location_id) map[r.ghl_location_id] = r.location_name || ""; });
    setLocationNames(map);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  // ============== Aggregations ==============
  const totalRevenue = deals.reduce((s, d) => s + (Number(d.assignment_fee) || 0), 0);
  const closedDeals = deals.filter((d) => d.status === "closed").length;
  const activeSubs = users.filter((u) => u.subscription_status === "active").length;

  const dealsByUser: Record<string, number> = {};
  deals.forEach((d) => { dealsByUser[d.user_id] = (dealsByUser[d.user_id] || 0) + 1; });
  const buyersByUser: Record<string, number> = {};
  buyers.forEach((b) => { buyersByUser[b.user_id] = (buyersByUser[b.user_id] || 0) + 1; });

  const dealsByState = useMemo(() => {
    const out: Record<string, number> = {};
    deals.forEach((d) => {
      const m = d.state || d.property_address?.match(/,\s*([A-Z]{2})\b/)?.[1];
      if (m) out[m] = (out[m] || 0) + 1;
    });
    return out;
  }, [deals]);

  const dealsPerMonth = useMemo(() => {
    const out: Record<string, { opened: number; revenue: number }> = {};
    deals.forEach((d) => {
      const dt = new Date(d.created_at);
      const k = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      out[k] ||= { opened: 0, revenue: 0 };
      out[k].opened += 1;
      if (d.status === "closed") out[k].revenue += Number(d.assignment_fee) || 0;
    });
    return Object.entries(out).sort(([a], [b]) => a.localeCompare(b)).slice(-12);
  }, [deals]);

  const topLeadSources = useMemo(() => {
    const out: Record<string, number> = {};
    deals.forEach((d) => { if (d.lead_source) out[d.lead_source] = (out[d.lead_source] || 0) + 1; });
    return Object.entries(out).sort(([, a], [, b]) => b - a).slice(0, 5);
  }, [deals]);

  const usersWithRoles = useMemo(() => {
    const adminSet = new Set(roles.filter((r) => r.role === "admin").map((r) => r.user_id));
    return users.map((u) => ({ ...u, isAdminRole: adminSet.has(u.user_id) }));
  }, [users, roles]);

  return (
    <AppLayout requireAdmin>
      <PageHeader
        title="Admin Console"
        subtitle="Cross-tenant operations, monitoring & role management"
        actions={
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Refresh
          </Button>
        }
      />
      <div className="p-6 lg:p-8">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="deals">Deals</TabsTrigger>
            {isSuperAdmin && <TabsTrigger value="recently_deleted">Recently Deleted</TabsTrigger>}
            
            
            <TabsTrigger value="roles">Roles</TabsTrigger>
            {showPricing && <TabsTrigger value="pricing">Pricing</TabsTrigger>}
            {showArchiveBuyers && <TabsTrigger value="archive_buyers">Archive Buyers</TabsTrigger>}
            {showArchiveBuyers && <TabsTrigger value="import_buyers">Import Buyers</TabsTrigger>}
            {showArchiveBuyers && <TabsTrigger value="archive_title">Archive Title Cos</TabsTrigger>}
            {isSuperAdmin && <TabsTrigger value="operator_accounts">Operator Accounts</TabsTrigger>}
            {showArchiveBuyers && <TabsTrigger value="skiptrace_buyers">Skiptrace Investors</TabsTrigger>}
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <Stat icon={<Users />} label="Users" value={String(users.length)} />
              <Stat icon={<ShieldCheck />} label="Active Subs" value={String(activeSubs)} />
              <Stat icon={<Briefcase />} label="Deals" value={String(deals.length)} />
              <Stat icon={<TrendingUp />} label="Closed" value={String(closedDeals)} />
              <Stat icon={<DollarSign />} label="Revenue" value={`$${totalRevenue.toLocaleString()}`} />
              <Stat icon={<Database />} label="Archive" value={String(archive.length)} />
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              <Section title="Deals per month (last 12)">
                <div className="bg-card border border-border rounded-lg p-4">
                  {dealsPerMonth.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No data yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {dealsPerMonth.map(([k, v]) => {
                        const max = Math.max(...dealsPerMonth.map(([, x]) => x.opened));
                        const pct = max ? (v.opened / max) * 100 : 0;
                        return (
                          <div key={k} className="flex items-center gap-3 text-xs">
                            <div className="w-16 font-mono text-muted-foreground">{k}</div>
                            <div className="flex-1 bg-secondary h-5 rounded overflow-hidden">
                              <div className="bg-primary h-full" style={{ width: `${pct}%` }} />
                            </div>
                            <div className="w-12 text-right font-semibold">{v.opened}</div>
                            <div className="w-24 text-right text-primary">${v.revenue.toLocaleString()}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Section>

              <Section title="Top lead sources">
                <div className="bg-card border border-border rounded-lg p-4">
                  {topLeadSources.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No lead source data.</p>
                  ) : (
                    <div className="space-y-2">
                      {topLeadSources.map(([src, n]) => {
                        const max = topLeadSources[0][1];
                        return (
                          <div key={src} className="flex items-center gap-3 text-sm">
                            <div className="w-32 truncate">{src}</div>
                            <div className="flex-1 bg-secondary h-5 rounded overflow-hidden">
                              <div className="bg-primary h-full" style={{ width: `${(n / max) * 100}%` }} />
                            </div>
                            <div className="w-10 text-right font-semibold">{n}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Section>
            </div>

            <Section title="Deals by state">
              <div className="bg-card border border-border rounded-lg p-5">
                <div className="flex items-center gap-2 text-muted-foreground mb-3 text-sm">
                  <MapPin className="h-4 w-4" /> Cross-tenant heatmap
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
                  {Object.entries(dealsByState).sort(([, a], [, b]) => b - a).map(([s, n]) => (
                    <div key={s} className="flex items-center justify-between bg-secondary rounded px-3 py-2">
                      <span className="font-mono font-semibold">{s}</span>
                      <span className="text-primary font-bold">{n}</span>
                    </div>
                  ))}
                  {Object.keys(dealsByState).length === 0 && (
                    <p className="text-sm text-muted-foreground col-span-full">No state data yet.</p>
                  )}
                </div>
              </div>
            </Section>
          </TabsContent>

          {/* USERS */}
          <TabsContent value="users">
            <UsersTab users={users} dealsByUser={dealsByUser} buyersByUser={buyersByUser} onOpen={setOpenUserId} />
          </TabsContent>

          {/* DEALS */}
          <TabsContent value="deals">
            <DealsTab deals={deals} users={users} locationNames={locationNames} onOpenUser={setOpenUserId} />
          </TabsContent>

          {/* RECENTLY DELETED */}
          {isSuperAdmin && (
            <TabsContent value="recently_deleted">
              <RecentlyDeletedTab users={users} locationNames={locationNames} />
            </TabsContent>
          )}


          {/* ROLES */}
          <TabsContent value="roles">
            <RoleManager users={usersWithRoles} onChanged={load} />
          </TabsContent>

          {/* PRICING */}
          {showPricing && (
            <TabsContent value="pricing">
              <PricingTab />
            </TabsContent>
          )}

          {showArchiveBuyers && (
            <TabsContent value="archive_buyers">
              <ArchiveBuyersTab />
            </TabsContent>
          )}

          {showArchiveBuyers && (
            <TabsContent value="import_buyers">
              <ImportBuyersTab />
            </TabsContent>
          )}

          {showArchiveBuyers && (
            <TabsContent value="archive_title">
              <ArchiveTitleCompaniesTab />
            </TabsContent>
          )}

          {isSuperAdmin && (
            <TabsContent value="operator_accounts">
              <OperatorAccountsTab />
            </TabsContent>
          )}
        </Tabs>
      </div>

      <UserDrawer userId={openUserId} onClose={() => setOpenUserId(null)} onChanged={load} />
    </AppLayout>
  );
}

// ============== Sub-tabs ==============

function UsersTab({ users, dealsByUser, buyersByUser, onOpen }: any) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const filtered = users.filter((u: any) => {
    const s = q.toLowerCase();
    const matchQ = !s || u.email?.toLowerCase().includes(s) || u.name?.toLowerCase().includes(s);
    const matchS = status === "all" || u.subscription_status === status;
    return matchQ && matchS;
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="md:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="trialing">Trialing</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="data-table w-full">
          <thead><tr><th>Name</th><th>Email</th><th>Subscription</th><th>Deals</th><th>Buyers</th><th>Last Active</th></tr></thead>
          <tbody>
            {filtered.map((u: any) => (
              <tr key={u.id} className="cursor-pointer hover:bg-muted/40" onClick={() => onOpen(u.user_id)}>
                <td className="font-medium">{u.name || "—"}</td>
                <td className="text-muted-foreground">{u.email}</td>
                <td><Badge variant="outline" className="capitalize">{u.subscription_status}</Badge></td>
                <td>{dealsByUser[u.user_id] || 0}</td>
                <td>{buyersByUser[u.user_id] || 0}</td>
                <td className="text-xs text-muted-foreground">{u.last_active_at ? new Date(u.last_active_at).toLocaleDateString() : "—"}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-muted-foreground">No users match.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DealsTab({ deals, users, locationNames, onOpenUser }: any) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const userMap: Record<string, any> = Object.fromEntries(users.map((u: any) => [u.user_id, u]));
  const states = Array.from(new Set(deals.map((d: any) => d.state).filter(Boolean))).sort();
  const filtered = deals.filter((d: any) => {
    const s = q.toLowerCase();
    const matchQ = !s || d.property_address?.toLowerCase().includes(s);
    const matchS = status === "all" || d.status === status;
    const matchState = stateFilter === "all" || d.state === stateFilter;
    return matchQ && matchS && matchState;
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search address…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="lead">Lead</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="under_contract">Under contract</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
            <SelectItem value="dead">Dead</SelectItem>
            <SelectItem value="title_issues">Title Issues</SelectItem>
            <SelectItem value="seller_issue">Seller Issue / Memorandum</SelectItem>
            <SelectItem value="could_not_sell">Could Not Sell</SelectItem>
          </SelectContent>
        </Select>
        <Select value={stateFilter} onValueChange={setStateFilter}>
          <SelectTrigger className="md:w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All states</SelectItem>
            {states.map((s: any) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="data-table w-full">
          <thead><tr><th>Owner</th><th>Source</th><th>Address</th><th>Status</th><th>Asking</th><th>Fee</th><th>Created</th><th>Closed</th></tr></thead>
          <tbody>
            {filtered.map((d: any) => (
              <tr key={d.id}>
                <td>
                  {d.user_id ? (
                    <button className="text-primary hover:underline text-xs" onClick={() => onOpenUser(d.user_id)}>
                      {userMap[d.user_id]?.email || d.user_id.slice(0, 8)}
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {d.ghl_assigned_user_id ? `GHL: ${d.ghl_assigned_user_id}` : "— (GHL import)"}
                    </span>
                  )}
                </td>
                <td className="text-xs text-muted-foreground">
                  {d.ghl_location_id ? (locationNames?.[d.ghl_location_id] || d.ghl_location_id.slice(0, 8)) : "—"}
                </td>
                <td className="font-medium truncate max-w-[260px]">{d.property_address}</td>
                <td><Badge variant="outline" className="capitalize">{d.status}</Badge></td>
                <td>{d.asking_price ? `$${Number(d.asking_price).toLocaleString()}` : "—"}</td>
                <td className="text-primary">{d.assignment_fee ? `$${Number(d.assignment_fee).toLocaleString()}` : "—"}</td>
                <td className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleDateString()}</td>
                <td className="text-xs text-muted-foreground">{d.closed_at ? new Date(d.closed_at).toLocaleDateString() : "—"}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={8} className="text-center py-6 text-muted-foreground">No deals match.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BuyersTab({ buyers, users, onOpenUser }: any) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const userMap: Record<string, any> = Object.fromEntries(users.map((u: any) => [u.user_id, u]));
  const filtered = buyers.filter((b: any) => {
    const s = q.toLowerCase();
    const matchQ = !s || b.name?.toLowerCase().includes(s) || b.email?.toLowerCase().includes(s) ||
      (b.markets || []).some((m: string) => m.toLowerCase().includes(s));
    const matchS = status === "all" || b.buyer_status === status;
    return matchQ && matchS;
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search name, email, market…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="vetted">Vetted</SelectItem>
            <SelectItem value="vetted_and_closed">Vetted + Closed</SelectItem>
            <SelectItem value="not_vetted">Not vetted</SelectItem>
            <SelectItem value="repeat">Repeat Buyer</SelectItem>
            <SelectItem value="recurring">Recurring Buyer</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="data-table w-full">
          <thead><tr><th>Owner</th><th>Name</th><th>Email</th><th>Status</th><th>Markets</th><th>Deals</th></tr></thead>
          <tbody>
            {filtered.map((b: any) => (
              <tr key={b.id}>
                <td>
                  <button className="text-primary hover:underline text-xs" onClick={() => onOpenUser(b.user_id)}>
                    {userMap[b.user_id]?.email || b.user_id.slice(0, 8)}
                  </button>
                </td>
                <td className="font-medium">{b.name}</td>
                <td className="text-muted-foreground">{b.email || "—"}</td>
                <td><Badge variant="outline" className="capitalize">{b.buyer_status}</Badge></td>
                <td className="text-xs text-muted-foreground truncate max-w-[200px]">{(b.markets || []).join(", ") || "—"}</td>
                <td>{b.deals_purchased ?? 0}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-muted-foreground">No buyers match.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ArchiveTab({ archive, onChanged }: any) {
  const [q, setQ] = useState("");
  const filtered = archive.filter((b: any) => {
    const s = q.toLowerCase();
    return !s || b.name?.toLowerCase().includes(s) || b.email?.toLowerCase().includes(s) ||
      (b.markets || []).some((m: string) => m.toLowerCase().includes(s));
  });
  async function del(id: string) {
    if (!confirm("Delete this archive entry?")) return;
    const { error } = await supabase.from("buyer_archive").delete().eq("id", id);
    if (error) return alert(error.message);
    onChanged();
  }
  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search name, email, market…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="data-table w-full">
          <thead><tr><th>Name</th><th>Email</th><th>Markets</th><th>Source</th><th>Added</th><th></th></tr></thead>
          <tbody>
            {filtered.map((b: any) => (
              <tr key={b.id}>
                <td className="font-medium">{b.name}</td>
                <td className="text-muted-foreground">{b.email || "—"}</td>
                <td className="text-xs text-muted-foreground truncate max-w-[200px]">{(b.markets || []).join(", ") || "—"}</td>
                <td className="text-xs">{b.source || "—"}</td>
                <td className="text-xs text-muted-foreground">{new Date(b.created_at).toLocaleDateString()}</td>
                <td className="text-right">
                  <Button size="sm" variant="outline" onClick={() => del(b.id)}>Delete</Button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-muted-foreground">No archive entries match.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============== Recently Deleted ==============

function RecentlyDeletedTab({ users, locationNames }: { users: any[]; locationNames: Record<string, string> }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const userMap: Record<string, any> = Object.fromEntries(users.map((u: any) => [u.user_id, u]));

  async function load() {
    setLoading(true);
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("deals")
      .select("*")
      .not("deleted_at", "is", null)
      .gte("deleted_at", since)
      .order("deleted_at", { ascending: false });
    setRows((data as any) || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function undelete(id: string) {
    if (!confirm("Restore this deal? It will reappear in the pipeline.")) return;
    const { data, error } = await supabase
      .from("deals")
      .update({ deleted_at: null, deleted_by: null } as any)
      .eq("id", id)
      .select("id");
    if (error) return alert(error.message);
    if (!data || data.length === 0) return alert("Couldn't restore — check permissions.");
    load();
  }

  async function hardDelete(id: string) {
    if (!confirm("PERMANENTLY delete this deal and all related rows? This cannot be undone.")) return;
    const { error } = await supabase.from("deals").delete().eq("id", id);
    if (error) return alert(error.message);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Deals deleted in the last 90 days. Restore brings them back into the pipeline; permanent delete is irreversible.
        </p>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Refresh
        </Button>
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="data-table w-full">
          <thead>
            <tr>
              <th>Address / Homeowner</th>
              <th>Location</th>
              <th>Original status</th>
              <th>Deleted</th>
              <th>Deleted by</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d: any) => (
              <tr key={d.id}>
                <td className="font-medium">
                  <div>{d.property_address || "—"}</div>
                  {d.homeowner_name && <div className="text-xs text-muted-foreground">{d.homeowner_name}</div>}
                </td>
                <td className="text-xs text-muted-foreground">
                  {d.ghl_location_id ? (locationNames?.[d.ghl_location_id] || d.ghl_location_id.slice(0, 8)) : "—"}
                </td>
                <td><Badge variant="outline" className="capitalize">{d.status}</Badge></td>
                <td className="text-xs text-muted-foreground">{new Date(d.deleted_at).toLocaleString()}</td>
                <td className="text-xs text-muted-foreground">
                  {d.deleted_by ? (userMap[d.deleted_by]?.email || d.deleted_by.slice(0, 8)) : "—"}
                </td>
                <td className="text-right space-x-2">
                  <Button size="sm" variant="outline" onClick={() => undelete(d.id)}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restore
                  </Button>
                  <Button size="sm" variant="outline" className="text-destructive" onClick={() => hardDelete(d.id)}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete forever
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="text-center py-6 text-muted-foreground">
                {loading ? "Loading…" : "Nothing in the trash."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============== Helpers ==============

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
          <div className="text-2xl font-bold mt-1 truncate">{value}</div>
        </div>
        <div className="text-primary opacity-60 shrink-0">{icon}</div>
      </div>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">{title}</h2>
      {children}
    </div>
  );
}
