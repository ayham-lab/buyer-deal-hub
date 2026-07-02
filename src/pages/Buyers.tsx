import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { scopeToLocation, getActiveLocationId } from "@/lib/locationScope";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Users as UsersIcon, Upload, Download, Trash2, Filter, X, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AddBuyerModal } from "@/components/buyers/AddBuyerModal";
import { ImportBuyersModal } from "@/components/buyers/ImportBuyersModal";
import { BuyerDrawer } from "@/components/buyers/BuyerDrawer";
import { BuyerFinderPanel } from "@/components/buyers/BuyerFinderPanel";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { exportToCsv } from "@/lib/csv";
import { BUYER_CSV_COLUMNS, buyerToCsvRow } from "@/lib/buyerCsv";
import { BUYER_ACTIVITY_OPTIONS, BUYER_ACTIVITY_LABEL, BUYER_ACTIVITY_COLOR, type BuyerActivity } from "@/lib/buyerActivity";
import { format as fmtDate } from "date-fns";
import { getBuyerCompleteness } from "@/lib/buyerCompleteness";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";


const PROPERTY_TYPE_OPTIONS = ["SFH", "MFH 2-4", "MFH 5+", "Commercial", "Land", "Mobile"];
const BUYER_TYPE_OPTIONS = ["Flipper", "Landlord", "Developer", "Section 8", "Hedge Fund", "Airbnb / Rooming House", "Padsplit", "Mobile Homes"];
const BUYER_FREQUENCY_OPTIONS = ["Full-time Buyer", "Part-time Buyer", "Tax Write-off Buyer"];
const STATUS_OPTIONS = [
  { value: "not_vetted", label: "Not Vetted" },
  { value: "vetted", label: "Vetted" },
  { value: "vetted_and_closed", label: "Vetted + Closed" },
  { value: "repeat", label: "Repeat Buyer" },
  { value: "recurring", label: "Recurring Buyer" },
];

function MultiFilter({
  label, options, value, onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const count = value.length;
  function toggle(v: string) {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1">
          {label}
          {count > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{count}</Badge>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="max-h-64 overflow-y-auto space-y-1">
          {options.map((o) => (
            <label key={o.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
              <Checkbox checked={value.includes(o.value)} onCheckedChange={() => toggle(o.value)} />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
        {count > 0 && (
          <button
            onClick={() => onChange([])}
            className="mt-2 w-full text-xs text-muted-foreground hover:text-foreground py-1 border-t border-border"
          >
            Clear
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}


export interface Buyer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  markets: string[];
  property_types: string[];
  price_min: number | null;
  price_max: number | null;
  source: string | null;
  
  deal_count: number;
  deals_purchased: number;
  criteria_notes: string | null;
  created_at: string;
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
  buyer_status?: "not_vetted" | "vetted" | "vetted_and_closed" | "repeat" | "recurring";
  buyer_types?: string[];
  buyer_frequency?: string[];
  other_property_type?: string | null;
  proof_of_funds_files?: string[];
  previous_deals?: string | null;
  experience?: string | null;
  buyer_activity?: BuyerActivity;
  activity_resume_date?: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  not_vetted: "Not Vetted",
  vetted: "Vetted",
  vetted_and_closed: "Vetted + Closed",
  repeat: "Repeat Buyer",
  recurring: "Recurring Buyer",
};
const STATUS_COLOR: Record<string, string> = {
  not_vetted: "bg-muted text-muted-foreground",
  vetted: "bg-green-100 text-green-700 border-green-200",
  vetted_and_closed: "bg-amber-100 text-amber-800 border-amber-300",
  repeat: "bg-blue-100 text-blue-700 border-blue-200",
  recurring: "bg-purple-100 text-purple-700 border-purple-200",
};

export default function Buyers() {
  const { user, isAdmin } = useAuth();
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [active, setActive] = useState<Buyer | null>(null);
  const [activityFilter, setActivityFilter] = useState<"all" | BuyerActivity>("all");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [propertyTypeFilter, setPropertyTypeFilter] = useState<string[]>([]);
  const [buyerTypeFilter, setBuyerTypeFilter] = useState<string[]>([]);
  const [frequencyFilter, setFrequencyFilter] = useState<string[]>([]);
  const [marketFilter, setMarketFilter] = useState("");
  const [priceMinFilter, setPriceMinFilter] = useState("");
  const [priceMaxFilter, setPriceMaxFilter] = useState("");
  const [profileFilter, setProfileFilter] = useState<"all" | "complete" | "incomplete">("all");
  const [pofFilter, setPofFilter] = useState<"all" | "has" | "missing">("all");




  async function load() {
    if (!user) return;
    setLoading(true);
    // When a GHL location is active, show all buyers for that location (including
    // webhook-imported rows with user_id IS NULL). RLS gates by location.
    const activeLoc = getActiveLocationId();
    const base = supabase
      .from("buyers")
      .select("*")
      .eq("is_archived", false)
      .order("created_at", { ascending: false });
    // Admin / super_admin intentionally view tenant data — skip user_id self-filter so they
    // can see webhook-imported rows with user_id=NULL. Recurring regression (3rd time);
    // don't re-add the fallback for admins.
    const q = (activeLoc || isAdmin) ? base : base.eq("user_id", user.id);
    const { data } = await scopeToLocation(q);
    setBuyers((data as any) || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [user]);

  const filtered = useMemo(() => {
    const priceMinNum = priceMinFilter ? Number(priceMinFilter) : null;
    const priceMaxNum = priceMaxFilter ? Number(priceMaxFilter) : null;
    const marketQ = marketFilter.trim().toLowerCase();

    return buyers.filter((b) => {
      if (activityFilter !== "all" && (b.buyer_activity || "currently_buying") !== activityFilter) return false;
      if (statusFilter.length && !statusFilter.includes(b.buyer_status || "not_vetted")) return false;
      if (propertyTypeFilter.length && !propertyTypeFilter.some((p) => (b.property_types || []).includes(p))) return false;
      if (buyerTypeFilter.length && !buyerTypeFilter.some((p) => (b.buyer_types || []).includes(p))) return false;
      if (frequencyFilter.length && !frequencyFilter.some((p) => (b.buyer_frequency || []).includes(p))) return false;
      if (marketQ && !(b.markets || []).some((m) => m.toLowerCase().includes(marketQ))) return false;
      // Price overlap: buyer range [min,max] overlaps filter range [pMin,pMax]
      if (priceMinNum !== null && b.price_max !== null && b.price_max < priceMinNum) return false;
      if (priceMaxNum !== null && b.price_min !== null && b.price_min > priceMaxNum) return false;
      if (profileFilter !== "all") {
        const isComplete = getBuyerCompleteness(b).isComplete;
        if (profileFilter === "complete" && !isComplete) return false;
        if (profileFilter === "incomplete" && isComplete) return false;
      }
      if (pofFilter !== "all") {
        const hasPof = (b.proof_of_funds_files || []).length > 0;
        if (pofFilter === "has" && !hasPof) return false;
        if (pofFilter === "missing" && hasPof) return false;
      }
      const q = search.trim().toLowerCase();
      if (!q) return true;
      const digits = q.replace(/\D/g, "");
      const phoneDigits = (b.phone || "").replace(/\D/g, "");
      return (
        b.name.toLowerCase().includes(q) ||
        (b.first_name || "").toLowerCase().includes(q) ||
        (b.last_name || "").toLowerCase().includes(q) ||
        (b.email || "").toLowerCase().includes(q) ||
        (b.company_name || "").toLowerCase().includes(q) ||
        b.markets.some((m) => m.toLowerCase().includes(q)) ||
        (digits.length >= 3 && phoneDigits.includes(digits))
      );
    });
  }, [buyers, search, activityFilter, statusFilter, propertyTypeFilter, buyerTypeFilter, frequencyFilter, marketFilter, priceMinFilter, priceMaxFilter, profileFilter, pofFilter]);

  const activeFilterCount =
    (activityFilter !== "all" ? 1 : 0) +
    statusFilter.length +
    propertyTypeFilter.length +
    buyerTypeFilter.length +
    frequencyFilter.length +
    (marketFilter.trim() ? 1 : 0) +
    (priceMinFilter ? 1 : 0) +
    (priceMaxFilter ? 1 : 0) +
    (profileFilter !== "all" ? 1 : 0) +
    (pofFilter !== "all" ? 1 : 0);

  function clearAllFilters() {
    setActivityFilter("all");
    setStatusFilter([]);
    setPropertyTypeFilter([]);
    setBuyerTypeFilter([]);
    setFrequencyFilter([]);
    setMarketFilter("");
    setPriceMinFilter("");
    setPriceMaxFilter("");
    setProfileFilter("all");
    setPofFilter("all");
  }


  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "finder" ? "finder" : "rolodex";
  const setTab = (v: string) => {
    const sp = new URLSearchParams(searchParams);
    if (v === "rolodex") sp.delete("tab"); else sp.set("tab", v);
    setSearchParams(sp, { replace: true });
  };

  return (
    <AppLayout>
      <PageHeader
        title="Buyers"
        subtitle="Manage your buyer database and match buyers to deals"
        actions={
          tab === "rolodex" ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  exportToCsv(
                    filtered.map((b) => buyerToCsvRow(b)) as unknown as Record<string, unknown>[],
                    `buyers-${new Date().toISOString().slice(0, 10)}`,
                    [...BUYER_CSV_COLUMNS]
                  )
                }
              >
                <Download className="h-4 w-4 mr-1" /> Export CSV
              </Button>
              <Button variant="outline" onClick={() => setShowImport(true)}>
                <Upload className="h-4 w-4 mr-1" /> Import CSV
              </Button>
              <Button onClick={() => setShowAdd(true)} className="bg-primary hover:bg-primary-hover text-primary-foreground">
                <Plus className="h-4 w-4 mr-1" /> Add Buyer
              </Button>
            </div>
          ) : null
        }
        tabs={
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="rolodex" className="gap-1.5"><UsersIcon className="h-3.5 w-3.5" /> Rolodex</TabsTrigger>
              <TabsTrigger value="finder" className="gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Buyer Finder</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />
      {tab === "finder" ? (
        <div className="p-6 lg:p-8">
          <BuyerFinderPanel onBuyerAdded={load} />
        </div>
      ) : (
      <div className="p-8 space-y-4">

        <div className="flex gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search buyers by name, email, phone, company..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg border border-border bg-card">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mr-1">
            <Filter className="h-3.5 w-3.5" /> Filters
          </div>

          <MultiFilter
            label="Status"
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={setStatusFilter}
          />
          <MultiFilter
            label="Property Type"
            options={PROPERTY_TYPE_OPTIONS.map((o) => ({ value: o, label: o }))}
            value={propertyTypeFilter}
            onChange={setPropertyTypeFilter}
          />
          <MultiFilter
            label="Buyer Type"
            options={BUYER_TYPE_OPTIONS.map((o) => ({ value: o, label: o }))}
            value={buyerTypeFilter}
            onChange={setBuyerTypeFilter}
          />
          <MultiFilter
            label="Frequency"
            options={BUYER_FREQUENCY_OPTIONS.map((o) => ({ value: o, label: o }))}
            value={frequencyFilter}
            onChange={setFrequencyFilter}
          />

          <Input
            placeholder="Market contains…"
            value={marketFilter}
            onChange={(e) => setMarketFilter(e.target.value)}
            className="h-8 w-40 text-xs"
          />
          <Input
            type="number"
            placeholder="Price min"
            value={priceMinFilter}
            onChange={(e) => setPriceMinFilter(e.target.value)}
            className="h-8 w-28 text-xs"
          />
          <Input
            type="number"
            placeholder="Price max"
            value={priceMaxFilter}
            onChange={(e) => setPriceMaxFilter(e.target.value)}
            className="h-8 w-28 text-xs"
          />

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1">
                Profile
                {profileFilter !== "all" && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">1</Badge>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-40 p-2" align="start">
              {(["all", "complete", "incomplete"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setProfileFilter(v)}
                  className={`w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted ${profileFilter === v ? "bg-muted font-medium" : ""}`}
                >
                  {v === "all" ? "All" : v === "complete" ? "Complete" : "Incomplete"}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1">
                POF
                {pofFilter !== "all" && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">1</Badge>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-40 p-2" align="start">
              {(["all", "has", "missing"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setPofFilter(v)}
                  className={`w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted ${pofFilter === v ? "bg-muted font-medium" : ""}`}
                >
                  {v === "all" ? "All" : v === "has" ? "Has POF" : "Missing POF"}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          {activeFilterCount > 0 && (
            <>
              <span className="text-xs text-muted-foreground ml-auto">
                {filtered.length} of {buyers.length}
              </span>
              <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={clearAllFilters}>
                <X className="h-3 w-3" /> Clear all ({activeFilterCount})
              </Button>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground mr-1">Activity:</span>
          {(["all", ...BUYER_ACTIVITY_OPTIONS.map((o) => o.value)] as const).map((v) => (
            <button
              key={v}
              onClick={() => setActivityFilter(v as any)}
              className={`px-2.5 py-1 rounded-full text-[11px] border transition ${
                activityFilter === v
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              {v === "all" ? "All" : BUYER_ACTIVITY_LABEL[v]}
            </button>
          ))}
        </div>


        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <UsersIcon className="h-10 w-10 text-primary" />
            <h3 className="text-lg font-semibold">No buyers yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Build your private cash buyer database. Add buyers manually or import from the system archive.
            </p>
            <Button onClick={() => setShowAdd(true)} className="bg-primary hover:bg-primary-hover">
              <Plus className="h-4 w-4 mr-1" /> Add Your First Buyer
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden bg-card shadow-sm">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Company</th>
                  <th>Profile</th>
                  <th>Status</th>
                  <th>Activity</th>
                  <th>Markets</th>
                  <th>Price Range</th>
                  <th>Property Types</th>
                  
                  <th title="Your personal count. System total combines all operators.">Deals</th>
                  <th>Source</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => {
                  const c = getBuyerCompleteness(b);
                  return (
                  <tr key={b.id} onClick={() => setActive(b)} className="cursor-pointer">
                    <td className="font-medium">{b.name}</td>
                    <td className="text-muted-foreground">{b.company_name || "—"}</td>
                    <td>
                      <TooltipProvider delayDuration={150}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1">
                              {c.isComplete ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                              ) : (
                                <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" />
                              )}
                              <span className={`text-[11px] font-medium ${c.isComplete ? "text-green-700" : "text-muted-foreground"}`}>
                                {c.score}%
                              </span>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            {c.isComplete ? (
                              <p className="text-xs">Complete profile — prioritized in Buyer Finder.</p>
                            ) : (
                              <div className="text-xs">
                                <p className="font-medium mb-1">Missing:</p>
                                <p className="text-muted-foreground">{c.missing.join(", ")}</p>
                              </div>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </td>
                    <td>
                      <Badge variant="outline" className={`text-[10px] rounded ${STATUS_COLOR[b.buyer_status || "not_vetted"]}`}>
                        {STATUS_LABEL[b.buyer_status || "not_vetted"]}
                      </Badge>
                    </td>
                    <td>
                      {(() => {
                        const act = b.buyer_activity || "currently_buying";
                        return (
                          <div className="flex flex-col gap-0.5">
                            <Badge variant="outline" className={`text-[10px] rounded w-fit ${BUYER_ACTIVITY_COLOR[act]}`}>
                              {BUYER_ACTIVITY_LABEL[act]}
                            </Badge>
                            {act === "not_buying_now" && b.activity_resume_date && (
                              <span className="text-[10px] text-muted-foreground">
                                Resumes {fmtDate(new Date(b.activity_resume_date + "T00:00:00"), "MMM d, yyyy")}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="text-muted-foreground">{b.markets.join(", ") || "—"}</td>
                    <td className="text-muted-foreground">
                      {b.price_min || b.price_max
                        ? `$${(b.price_min || 0).toLocaleString()} – $${(b.price_max || 0).toLocaleString()}`
                        : "—"}
                    </td>
                    <td className="text-muted-foreground">{b.property_types.join(", ") || "—"}</td>
                    <td>{b.deals_purchased ?? 0}</td>
                    <td className="text-muted-foreground">{b.source || "—"}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm(`Permanently delete buyer "${b.name}"? This cannot be undone.`)) return;
                          const { error } = await supabase.from("buyers").delete().eq("id", b.id);
                          if (error) { toast.error(error.message); return; }
                          toast.success("Buyer deleted");
                          load();
                        }}
                        className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"
                        title="Delete buyer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}


      <AddBuyerModal open={showAdd} onClose={() => setShowAdd(false)} onCreated={load} />
      <ImportBuyersModal open={showImport} onClose={() => setShowImport(false)} onImported={load} />
      <BuyerDrawer buyer={active} onClose={() => setActive(null)} onUpdated={load} />
    </AppLayout>
  );
}
