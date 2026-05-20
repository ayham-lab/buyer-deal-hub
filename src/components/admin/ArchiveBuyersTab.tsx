// Super-admin only (standalone) CRUD over the global archive_buyers table.
// Server-side search, filters, sort, pagination — built for 10k+ rows.
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2, Plus, Trash2, Save, X, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

interface Row {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  state: string | null;
  preferred_markets: string[];
  price_min: number | null;
  price_max: number | null;
  property_types: string[];
  phone: string | null;
  email: string | null;
  notes: string | null;
  is_active: boolean;
  quality_tier: string | null;
  status: "not_vetted" | "vetted" | "vetted_and_closed" | "repeat" | "recurring" | null;
  status_override_by_admin: boolean;
  system_deals_purchased: number;
  sources: any;
  created_at: string;
}

const empty: Partial<Row> = {
  full_name: "", first_name: "", last_name: "", city: "", state: "",
  preferred_markets: [], price_min: null, price_max: null,
  property_types: [], phone: "", email: "", notes: "", is_active: true,
};

const US_STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware",
  "Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky",
  "Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi",
  "Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico",
  "New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania",
  "Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont",
  "Virginia","Washington","West Virginia","Wisconsin","Wyoming","District of Columbia",
];
const STATUS_OPTIONS: { value: NonNullable<Row["status"]>; label: string }[] = [
  { value: "not_vetted",        label: "Not Vetted" },
  { value: "vetted",            label: "Vetted" },
  { value: "vetted_and_closed", label: "Vetted + Closed" },
  { value: "repeat",            label: "Repeat Buyer" },
  { value: "recurring",         label: "Recurring Buyer" },
];
const STATUS_LABEL: Record<string, string> = Object.fromEntries(STATUS_OPTIONS.map(s => [s.value, s.label]));
const STATUS_COLOR: Record<string, string> = {
  not_vetted: "bg-muted text-muted-foreground",
  vetted: "bg-green-100 text-green-700 border-green-200",
  vetted_and_closed: "bg-amber-100 text-amber-800 border-amber-300",
  repeat: "bg-blue-100 text-blue-700 border-blue-200",
  recurring: "bg-purple-100 text-purple-700 border-purple-200",
};
// Legacy filter keys retained for back-compat on quality_tier
const QUALITY_TIERS = ["VIP BUYER", "Vetted", "Experienced", "Purchased a deal", "none"];
const PAGE_SIZE = 50;

function arr(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

type SortKey = "newest" | "oldest" | "name_asc" | "name_desc" | "tier_desc";

export function ArchiveBuyersTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Partial<Row>>({ ...empty });
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Row>>({});

  // Filters
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 300);
  const [stateF, setStateF] = useState<string>("__any__");
  const [tiers, setTiers] = useState<string[]>([]);
  const [hasEmail, setHasEmail] = useState<"any" | "yes" | "no">("any");
  const [hasPhone, setHasPhone] = useState<"any" | "yes" | "no">("any");
  const [sourceTags, setSourceTags] = useState<string[]>([]);
  const [allSources, setAllSources] = useState<string[]>([]);
  const [sort, setSort] = useState<SortKey>("newest");
  const [page, setPage] = useState(0);

  // Reset to first page whenever filters change
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, stateF, tiers.join("|"), hasEmail, hasPhone, sourceTags.join("|"), sort]);

  // Load source tags once
  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("archive_buyer_distinct_sources" as any);
      if (data) setAllSources((data as any[]).map((r) => r.source).filter(Boolean));
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("archive_buyers")
      .select("*", { count: "exact" });

    // Search across name/email/phone
    const s = debouncedSearch.trim();
    if (s) {
      const esc = s.replace(/[%_]/g, (m) => `\\${m}`);
      const like = `%${esc}%`;
      const phoneDigits = s.replace(/\D/g, "");
      const ors: string[] = [
        `full_name.ilike.${like}`,
        `first_name.ilike.${like}`,
        `last_name.ilike.${like}`,
        `email.ilike.${like}`,
      ];
      if (phoneDigits.length >= 3) {
        ors.push(`phone.ilike.%${phoneDigits}%`);
        ors.push(`phone_2.ilike.%${phoneDigits}%`);
      }
      q = q.or(ors.join(","));
    }

    // State filter
    if (stateF === "__national__") {
      q = q.eq("national", true);
    } else if (stateF === "__none__") {
      q = q.is("state", null);
    } else if (stateF !== "__any__") {
      q = q.eq("state", stateF);
    }

    // Quality tier multi-select
    if (tiers.length > 0) {
      const has_none = tiers.includes("none");
      const real = tiers.filter((t) => t !== "none");
      if (has_none && real.length > 0) {
        const orParts = real.map((t) => `quality_tier.eq.${t}`).concat("quality_tier.is.null");
        q = q.or(orParts.join(","));
      } else if (has_none) {
        q = q.is("quality_tier", null);
      } else {
        q = q.in("quality_tier", real);
      }
    }

    // Email / phone presence
    if (hasEmail === "yes") q = q.not("email", "is", null).neq("email", "");
    else if (hasEmail === "no") q = q.or("email.is.null,email.eq.");
    if (hasPhone === "yes") q = q.not("phone", "is", null).neq("phone", "");
    else if (hasPhone === "no") q = q.or("phone.is.null,phone.eq.");

    // Source tags (jsonb contains any of the selected)
    if (sourceTags.length > 0) {
      // Use OR of contains for each tag
      const orParts = sourceTags.map((t) => `sources.cs.${JSON.stringify([t])}`);
      q = q.or(orParts.join(","));
    }

    // Sort
    if (sort === "newest") q = q.order("created_at", { ascending: false });
    else if (sort === "oldest") q = q.order("created_at", { ascending: true });
    else if (sort === "name_asc") q = q.order("full_name", { ascending: true, nullsFirst: false }).order("last_name", { ascending: true, nullsFirst: false });
    else if (sort === "name_desc") q = q.order("full_name", { ascending: false, nullsFirst: false }).order("last_name", { ascending: false, nullsFirst: false });
    else if (sort === "tier_desc") q = q.order("quality_tier", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });

    // Pagination
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    q = q.range(from, to);

    const { data, error, count } = await q;
    if (error) toast.error(error.message);
    setRows((data as any) || []);
    setTotal(count ?? 0);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [
    debouncedSearch, stateF, tiers.join("|"), hasEmail, hasPhone, sourceTags.join("|"), sort, page,
  ]);

  async function add() {
    const payload = {
      ...draft,
      preferred_markets: draft.preferred_markets ?? [],
      property_types: draft.property_types ?? [],
    };
    const { error } = await supabase.from("archive_buyers").insert(payload as any);
    if (error) return toast.error(error.message);
    toast.success("Buyer added");
    setDraft({ ...empty });
    load();
  }

  async function save(id: string) {
    const { error } = await supabase
      .from("archive_buyers")
      .update(editDraft as any)
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    setEditId(null);
    setEditDraft({});
    load();
  }

  async function toggleActive(r: Row) {
    const { error } = await supabase
      .from("archive_buyers")
      .update({ is_active: !r.is_active })
      .eq("id", r.id);
    if (error) return toast.error(error.message);
    load();
  }

  async function del(id: string) {
    if (!confirm("Delete this archive buyer?")) return;
    const { error } = await supabase.from("archive_buyers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  }

  function clearFilters() {
    setSearch(""); setStateF("__any__"); setTiers([]);
    setHasEmail("any"); setHasPhone("any"); setSourceTags([]); setSort("newest");
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeFilterCount =
    (debouncedSearch ? 1 : 0) +
    (stateF !== "__any__" ? 1 : 0) +
    (tiers.length > 0 ? 1 : 0) +
    (hasEmail !== "any" ? 1 : 0) +
    (hasPhone !== "any" ? 1 : 0) +
    (sourceTags.length > 0 ? 1 : 0);

  return (
    <div className="space-y-6">
      {/* Add form */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <div className="text-sm font-semibold flex items-center gap-2">
          <Plus className="h-4 w-4" /> Add archive buyer
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Input placeholder="First name" value={draft.first_name || ""} onChange={(e) => setDraft({ ...draft, first_name: e.target.value })} />
          <Input placeholder="Last name" value={draft.last_name || ""} onChange={(e) => setDraft({ ...draft, last_name: e.target.value })} />
          <Input placeholder="Full name (optional)" value={draft.full_name || ""} onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} />
          <Input placeholder="Email" value={draft.email || ""} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
          <Input placeholder="Phone" value={draft.phone || ""} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
          <Input placeholder="City" value={draft.city || ""} onChange={(e) => setDraft({ ...draft, city: e.target.value })} />
          <Input placeholder="State" value={draft.state || ""} onChange={(e) => setDraft({ ...draft, state: e.target.value })} />
          <Input placeholder="Markets (comma-sep)" onChange={(e) => setDraft({ ...draft, preferred_markets: arr(e.target.value) })} />
          <Input placeholder="Property types (comma-sep)" onChange={(e) => setDraft({ ...draft, property_types: arr(e.target.value) })} />
          <Input placeholder="Min price" type="number" value={draft.price_min ?? ""} onChange={(e) => setDraft({ ...draft, price_min: e.target.value ? Number(e.target.value) : null })} />
          <Input placeholder="Max price" type="number" value={draft.price_max ?? ""} onChange={(e) => setDraft({ ...draft, price_max: e.target.value ? Number(e.target.value) : null })} />
          <Input placeholder="Notes" value={draft.notes || ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={add}>Add buyer</Button>
        </div>
      </div>

      {/* Search + filter bar */}
      <div className="bg-card border border-border rounded-lg p-3 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search buyers by name, email, phone, company..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          {/* State */}
          <Select value={stateF} onValueChange={setStateF}>
            <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="State" /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="__any__">All states</SelectItem>
              <SelectItem value="__national__">National / Any</SelectItem>
              <SelectItem value="__none__">No state set</SelectItem>
              {US_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Quality tier */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9">
                Quality{tiers.length > 0 ? ` (${tiers.length})` : ""}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {QUALITY_TIERS.map((t) => (
                <DropdownMenuCheckboxItem
                  key={t}
                  checked={tiers.includes(t)}
                  onCheckedChange={(c) => setTiers(c ? [...tiers, t] : tiers.filter((x) => x !== t))}
                >{t}</DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Has email */}
          <Select value={hasEmail} onValueChange={(v: any) => setHasEmail(v)}>
            <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Email: Any</SelectItem>
              <SelectItem value="yes">Has email</SelectItem>
              <SelectItem value="no">No email</SelectItem>
            </SelectContent>
          </Select>

          {/* Has phone */}
          <Select value={hasPhone} onValueChange={(v: any) => setHasPhone(v)}>
            <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Phone: Any</SelectItem>
              <SelectItem value="yes">Has phone</SelectItem>
              <SelectItem value="no">No phone</SelectItem>
            </SelectContent>
          </Select>

          {/* Source tags */}
          {allSources.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9">
                  Source{sourceTags.length > 0 ? ` (${sourceTags.length})` : ""}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="max-h-72 overflow-auto">
                {allSources.map((t) => (
                  <DropdownMenuCheckboxItem
                    key={t}
                    checked={sourceTags.includes(t)}
                    onCheckedChange={(c) => setSourceTags(c ? [...sourceTags, t] : sourceTags.filter((x) => x !== t))}
                  >{t}</DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Sort */}
          <Select value={sort} onValueChange={(v: any) => setSort(v)}>
            <SelectTrigger className="h-9 w-[180px] ml-auto"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="name_asc">Name A–Z</SelectItem>
              <SelectItem value="name_desc">Name Z–A</SelectItem>
              <SelectItem value="tier_desc">Quality tier ↓</SelectItem>
            </SelectContent>
          </Select>

          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" className="h-9" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div>Showing {rows.length === 0 ? 0 : page * PAGE_SIZE + 1}–{page * PAGE_SIZE + rows.length} of {total.toLocaleString()} buyers</div>
          {loading && <Loader2 className="h-3 w-3 animate-spin" />}
        </div>
      </div>

      {/* List */}
      {loading && rows.length === 0 ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>Name</th><th>Tier</th><th>Location</th><th>Markets</th><th>Price</th>
                <th>Email / Phone</th><th>Active</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isEdit = editId === r.id;
                const ed = isEdit ? editDraft : r;
                return (
                  <tr key={r.id}>
                    <td>
                      {isEdit ? (
                        <div className="flex flex-col gap-1">
                          <Input className="h-7" placeholder="First" value={ed.first_name || ""} onChange={(e) => setEditDraft({ ...editDraft, first_name: e.target.value })} />
                          <Input className="h-7" placeholder="Last" value={ed.last_name || ""} onChange={(e) => setEditDraft({ ...editDraft, last_name: e.target.value })} />
                        </div>
                      ) : (
                        <span className="font-medium">
                          {r.full_name || [r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}
                        </span>
                      )}
                    </td>
                    <td className="text-xs">
                      {r.quality_tier ? <Badge variant="secondary" className="text-[10px]">{r.quality_tier}</Badge> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="text-xs">
                      {isEdit ? (
                        <div className="flex gap-1">
                          <Input className="h-7 w-24" placeholder="City" value={ed.city || ""} onChange={(e) => setEditDraft({ ...editDraft, city: e.target.value })} />
                          <Input className="h-7 w-24" placeholder="State" value={ed.state || ""} onChange={(e) => setEditDraft({ ...editDraft, state: e.target.value })} />
                        </div>
                      ) : (
                        <>{[r.city, r.state].filter(Boolean).join(", ") || "—"}</>
                      )}
                    </td>
                    <td className="text-xs max-w-[180px]">
                      {isEdit ? (
                        <Input className="h-7" placeholder="comma-sep" defaultValue={(r.preferred_markets || []).join(", ")} onChange={(e) => setEditDraft({ ...editDraft, preferred_markets: arr(e.target.value) })} />
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {(r.preferred_markets || []).slice(0, 3).map((m) => <Badge key={m} variant="secondary" className="text-[10px]">{m}</Badge>)}
                          {r.preferred_markets.length > 3 && <Badge variant="outline" className="text-[10px]">+{r.preferred_markets.length - 3}</Badge>}
                        </div>
                      )}
                    </td>
                    <td className="text-xs">
                      {isEdit ? (
                        <div className="flex gap-1">
                          <Input className="h-7 w-20" type="number" placeholder="min" defaultValue={r.price_min ?? ""} onChange={(e) => setEditDraft({ ...editDraft, price_min: e.target.value ? Number(e.target.value) : null })} />
                          <Input className="h-7 w-20" type="number" placeholder="max" defaultValue={r.price_max ?? ""} onChange={(e) => setEditDraft({ ...editDraft, price_max: e.target.value ? Number(e.target.value) : null })} />
                        </div>
                      ) : (
                        <>{r.price_min || "—"} – {r.price_max || "—"}</>
                      )}
                    </td>
                    <td className="text-xs">
                      {isEdit ? (
                        <div className="flex flex-col gap-1">
                          <Input className="h-7" placeholder="email" value={ed.email || ""} onChange={(e) => setEditDraft({ ...editDraft, email: e.target.value })} />
                          <Input className="h-7" placeholder="phone" value={ed.phone || ""} onChange={(e) => setEditDraft({ ...editDraft, phone: e.target.value })} />
                        </div>
                      ) : (
                        <div className="text-muted-foreground">
                          <div>{r.email || "—"}</div>
                          <div>{r.phone || "—"}</div>
                        </div>
                      )}
                    </td>
                    <td>
                      <Switch checked={r.is_active} onCheckedChange={() => toggleActive(r)} />
                    </td>
                    <td className="text-right">
                      {isEdit ? (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" onClick={() => save(r.id)}><Save className="h-3 w-3" /></Button>
                          <Button size="sm" variant="outline" onClick={() => { setEditId(null); setEditDraft({}); }}><X className="h-3 w-3" /></Button>
                        </div>
                      ) : (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="outline" onClick={() => { setEditId(r.id); setEditDraft({ ...r }); }}>Edit</Button>
                          <Button size="sm" variant="outline" onClick={() => del(r.id)}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && !loading && (
                <tr><td colSpan={8} className="text-center py-6 text-muted-foreground">No buyers match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              <ChevronLeft className="h-3 w-3 mr-1" /> Prev
            </Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
