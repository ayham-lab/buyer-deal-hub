import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Upload, Search, Check, X, Minus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useActiveLocation } from "@/contexts/LocationContext";

// ---------- Field definitions ----------
type FieldKey =
  | "owner_type"
  | "property_address" | "property_city" | "property_state" | "property_zip" | "property_county"
  | "owner1_first" | "owner1_last" | "owner2_first" | "owner2_last"
  | "mailing_address" | "mailing_city" | "mailing_state" | "mailing_zip"
  | "email1" | "email2" | "email3"
  | "phone1" | "phone2" | "phone3" | "phone4" | "phone5";

const FIELDS: { key: FieldKey; label: string; required?: boolean }[] = [
  { key: "owner_type",       label: "Owner Type (filter)", required: true },
  { key: "property_address", label: "Property Address", required: true },
  { key: "property_city",    label: "Property City" },
  { key: "property_state",   label: "Property State" },
  { key: "property_zip",     label: "Property Zip" },
  { key: "property_county",  label: "County" },
  { key: "owner1_first",     label: "Owner 1 First Name" },
  { key: "owner1_last",      label: "Owner 1 Last Name" },
  { key: "owner2_first",     label: "Owner 2 First Name" },
  { key: "owner2_last",      label: "Owner 2 Last Name" },
  { key: "mailing_address",  label: "Mailing Address" },
  { key: "mailing_city",     label: "Mailing City" },
  { key: "mailing_state",    label: "Mailing State" },
  { key: "mailing_zip",      label: "Mailing Zip" },
  { key: "email1",           label: "Email 1" },
  { key: "email2",           label: "Email 2" },
  { key: "email3",           label: "Email 3" },
  { key: "phone1",           label: "Phone 1" },
  { key: "phone2",           label: "Phone 2" },
  { key: "phone3",           label: "Phone 3" },
  { key: "phone4",           label: "Phone 4" },
  { key: "phone5",           label: "Phone 5" },
];

// Exact target column names from the user's source CSV (auto-mapped).
const AUTO_ALIASES: Record<FieldKey, string[]> = {
  owner_type:       ["owner type"],
  property_address: ["address", "property address"],
  property_city:    ["city", "property city"],
  property_state:   ["state", "property state"],
  property_zip:     ["zip", "property zip", "zipcode", "zip code"],
  property_county:  ["county"],
  owner1_first:     ["owner 1 first name", "owner 1 first"],
  owner1_last:      ["owner 1 last name", "owner 1 last"],
  owner2_first:     ["owner 2 first name", "owner 2 first"],
  owner2_last:      ["owner 2 last name", "owner 2 last"],
  mailing_address:  ["owner mailing address", "mailing address"],
  mailing_city:     ["owner mailing city", "mailing city"],
  mailing_state:    ["owner mailing state", "mailing state"],
  mailing_zip:      ["owner mailing zip", "mailing zip"],
  email1:           ["skiptrace:emails.0.email", "email 1", "email1", "email"],
  email2:           ["skiptrace:emails.1.email", "email 2", "email2"],
  email3:           ["skiptrace:emails.2.email", "email 3", "email3"],
  phone1:           ["skiptrace:phonenumbers.0.number", "phone 1", "phone1", "phone"],
  phone2:           ["skiptrace:phonenumbers.1.number", "phone 2", "phone2"],
  phone3:           ["skiptrace:phonenumbers.2.number", "phone 3", "phone3"],
  phone4:           ["skiptrace:phonenumbers.3.number", "phone 4", "phone4"],
  phone5:           ["skiptrace:phonenumbers.4.number", "phone 5", "phone5"],
};

// ---------- CSV parsing ----------
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let val = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { val += '"'; i++; }
        else inQuotes = false;
      } else val += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { cur.push(val); val = ""; }
      else if (c === "\n") { cur.push(val); rows.push(cur); cur = []; val = ""; }
      else if (c === "\r") { /* skip */ }
      else val += c;
    }
  }
  if (val.length > 0 || cur.length > 0) { cur.push(val); rows.push(cur); }
  return rows.filter(r => r.some(v => v && v.trim() !== ""));
}

function autoMap(header: string[]): Record<FieldKey, number | null> {
  const lowered = header.map(h => h.trim().toLowerCase());
  const map = {} as Record<FieldKey, number | null>;
  for (const f of FIELDS) {
    const aliases = AUTO_ALIASES[f.key];
    const idx = lowered.findIndex(h => aliases.includes(h));
    map[f.key] = idx === -1 ? null : idx;
  }
  return map;
}

// Owner Type must classify as one of the two accepted combos.
// Accepts comma/space/pipe separated tags in any order.
function classifyOwnerType(raw: string | null): "individual_investor" | "company_investor" | null {
  if (!raw) return null;
  const tags = raw.toUpperCase().split(/[,\s|/]+/).map(t => t.trim()).filter(Boolean);
  const set = new Set(tags);
  const hasInvestor = set.has("INVESTOR");
  const hasIndividual = set.has("INDIVIDUAL");
  const hasCompany = set.has("COMPANY");
  if (hasIndividual && hasInvestor) return "individual_investor";
  if (hasCompany && (hasInvestor || hasIndividual)) return "company_investor";
  return null;
}

// ---------- Types ----------
type SkiptraceBuyer = {
  id: string;
  owner1_first: string | null;
  owner1_last: string | null;
  owner2_first: string | null;
  owner2_last: string | null;
  property_address: string;
  property_city: string | null;
  property_state: string | null;
  property_zip: string | null;
  property_county: string | null;
  mailing_address: string | null;
  mailing_city: string | null;
  mailing_state: string | null;
  mailing_zip: string | null;
  email1: string | null;
  email2: string | null;
  email3: string | null;
  buyer_type: "individual_investor" | "company_investor" | null;
  first_uploaded_at: string;
  updated_at: string;
};
type Phone = {
  id: string;
  buyer_id: string;
  phone: string;
  status: "untried" | "works" | "wrong_number";
  position: number | null;
};

type PendingUpload = {
  fileName: string;
  header: string[];
  dataRows: string[][];
  mapping: Record<FieldKey, number | null>;
};

export function SkiptraceBuyersTab() {
  const { toast } = useToast();
  const { activeLocation } = useActiveLocation();
  const activeLocationId = activeLocation?.locationId ?? null;
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<SkiptraceBuyer[]>([]);
  const [phonesByBuyer, setPhonesByBuyer] = useState<Record<string, Phone[]>>({});
  const [q, setQ] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [pending, setPending] = useState<PendingUpload | null>(null);

  async function load() {
    setLoading(true);
    const { data: bs } = await supabase
      .from("skiptrace_buyers" as any)
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1000);
    const buyers = (bs || []) as unknown as SkiptraceBuyer[];
    setRows(buyers);
    const ids = buyers.map(b => b.id);
    if (ids.length) {
      const { data: ph } = await supabase
        .from("skiptrace_buyer_phones" as any)
        .select("*")
        .in("buyer_id", ids);
      const map: Record<string, Phone[]> = {};
      ((ph || []) as unknown as Phone[]).forEach(p => {
        (map[p.buyer_id] ||= []).push(p);
      });
      Object.values(map).forEach(list => list.sort((a, b) => (a.position ?? 99) - (b.position ?? 99)));
      setPhonesByBuyer(map);
    } else {
      setPhonesByBuyer({});
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  // Step 1: parse CSV and open mapping dialog
  async function handleFileChosen(file: File) {
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.length < 2) throw new Error("CSV has no data rows");
      const header = parsed[0];
      const dataRows = parsed.slice(1);
      const mapping = autoMap(header);
      setPending({ fileName: file.name, header, dataRows, mapping });
    } catch (e: any) {
      toast({ title: "Couldn't read CSV", description: e?.message || String(e), variant: "destructive" });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // Step 2: confirm mapping and ingest
  async function ingest() {
    if (!pending) return;
    const { mapping, dataRows, fileName } = pending;
    if (mapping.owner_type === null) {
      toast({ title: "Owner Type required", description: "Map a column to Owner Type before importing.", variant: "destructive" });
      return;
    }
    if (mapping.property_address === null) {
      toast({ title: "Property Address required", description: "Map a column to Property Address before importing.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;

      const { data: batchRes, error: batchErr } = await supabase
        .from("skiptrace_upload_batches" as any)
        .insert({
          uploaded_by_user: uid,
          uploaded_by_location: activeLocationId,
          filename: fileName,
          row_count: dataRows.length,
        })
        .select()
        .single();
      if (batchErr) throw batchErr;
      const batchId = (batchRes as any).id as string;

      const get = (row: string[], key: FieldKey) => {
        const i = mapping[key];
        if (i === null || i === undefined) return null;
        const v = row[i]?.trim();
        return v ? v : null;
      };

      let inserted = 0, updated = 0, skipped = 0;

      for (const row of dataRows) {
        const buyerType = classifyOwnerType(get(row, "owner_type"));
        if (!buyerType) { skipped++; continue; }

        const property_address = get(row, "property_address");
        if (!property_address) { skipped++; continue; }

        const buyerPayload = {
          owner1_first: get(row, "owner1_first"),
          owner1_last:  get(row, "owner1_last"),
          owner2_first: get(row, "owner2_first"),
          owner2_last:  get(row, "owner2_last"),
          property_address,
          property_city:  get(row, "property_city"),
          property_state: get(row, "property_state"),
          property_zip:   get(row, "property_zip"),
          property_county: get(row, "property_county"),
          mailing_address: get(row, "mailing_address"),
          mailing_city:    get(row, "mailing_city"),
          mailing_state:   get(row, "mailing_state"),
          mailing_zip:     get(row, "mailing_zip"),
          email1: get(row, "email1"),
          email2: get(row, "email2"),
          email3: get(row, "email3"),
          buyer_type: buyerType,
          last_source_batch_id: batchId,
          last_source_location_id: activeLocationId,
        };

        const addrKey = property_address.trim().toLowerCase().replace(/\s+/g, " ");
        const { data: existingRaw } = await (supabase as any)
          .from("skiptrace_buyers")
          .select("id")
          .eq("property_address_key", addrKey)
          .maybeSingle();
        const existing = existingRaw as unknown as { id: string } | null;

        let buyerId: string;
        if (existing?.id) {
          buyerId = existing.id;
          const { error: upErr } = await supabase
            .from("skiptrace_buyers" as any)
            .update(buyerPayload)
            .eq("id", buyerId);
          if (upErr) throw upErr;
          updated++;
        } else {
          const { data: ins, error: insErr } = await supabase
            .from("skiptrace_buyers" as any)
            .insert({
              ...buyerPayload,
              source_batch_id: batchId,
              source_location_id: activeLocationId,
            })
            .select("id")
            .single();
          if (insErr) throw insErr;
          buyerId = (ins as any).id;
          inserted++;
        }

        const phones = [1, 2, 3, 4, 5]
          .map(n => ({ position: n, phone: get(row, `phone${n}` as FieldKey) }))
          .filter(p => p.phone) as { position: number; phone: string }[];

        if (phones.length) {
          const payload = phones.map(p => ({
            buyer_id: buyerId,
            phone: p.phone,
            position: p.position,
          }));
          await supabase.from("skiptrace_buyer_phones" as any).insert(payload);
        }
      }

      await supabase
        .from("skiptrace_upload_batches" as any)
        .update({ inserted_count: inserted, updated_count: updated })
        .eq("id", batchId);

      toast({
        title: "Upload complete",
        description: `${inserted} added, ${updated} updated, ${skipped} skipped (wrong Owner Type or missing address).`,
      });
      setPending(null);
      await load();
    } catch (e: any) {
      console.error("Skiptrace upload failed:", e);
      toast({ title: "Upload failed", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  async function setPhoneStatus(phoneId: string, status: Phone["status"]) {
    const { data: userRes } = await supabase.auth.getUser();
    const { error, data } = await supabase
      .from("skiptrace_buyer_phones" as any)
      .update({
        status,
        last_marked_by: userRes?.user?.id,
        last_marked_at: new Date().toISOString(),
      })
      .eq("id", phoneId)
      .select();
    if (error || !data || data.length === 0) {
      toast({ title: "Couldn't update", description: error?.message || "No rows updated", variant: "destructive" });
      return;
    }
    setPhonesByBuyer(prev => {
      const next = { ...prev };
      for (const bid of Object.keys(next)) {
        next[bid] = next[bid].map(p => (p.id === phoneId ? { ...p, status } : p));
      }
      return next;
    });
  }

  const states = useMemo(
    () => Array.from(new Set(rows.map(r => r.property_state).filter(Boolean))).sort() as string[],
    [rows]
  );
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter(r => {
      if (stateFilter !== "all" && r.property_state !== stateFilter) return false;
      if (!s) return true;
      return (
        r.property_address?.toLowerCase().includes(s) ||
        r.owner1_first?.toLowerCase().includes(s) ||
        r.owner1_last?.toLowerCase().includes(s) ||
        r.owner2_first?.toLowerCase().includes(s) ||
        r.owner2_last?.toLowerCase().includes(s) ||
        r.property_city?.toLowerCase().includes(s) ||
        r.email1?.toLowerCase().includes(s) ||
        r.email2?.toLowerCase().includes(s)
      );
    });
  }, [rows, q, stateFilter]);

  // Preview counts in the mapping dialog
  const previewStats = useMemo(() => {
    if (!pending) return null;
    const { mapping, dataRows } = pending;
    if (mapping.owner_type === null) return null;
    let accepted = 0, skipped = 0;
    for (const row of dataRows) {
      const v = mapping.owner_type !== null ? (row[mapping.owner_type] || "").trim() : "";
      if (classifyOwnerType(v || null)) accepted++; else skipped++;
    }
    return { accepted, skipped, total: dataRows.length };
  }, [pending]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex-1">
          <h3 className="text-lg font-semibold">Skiptraced Investor Database</h3>
          <p className="text-sm text-muted-foreground">
            Global pool of investor records used by buyer-match. Re-uploads dedup on property address.
            Only rows whose Owner Type is <code>INDIVIDUAL,INVESTOR</code> or <code>COMPANY,INVESTOR</code> are ingested.
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFileChosen(f);
          }}
        />
        <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
          Upload CSV
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search owner, address, city, email…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={stateFilter} onValueChange={setStateFilter}>
          <SelectTrigger className="md:w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All states</SelectItem>
            {states.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
        </Button>
      </div>

      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="p-2">Owner(s)</th>
              <th className="p-2">Property</th>
              <th className="p-2">Mailing</th>
              <th className="p-2">Phones</th>
              <th className="p-2">Emails</th>
              <th className="p-2">Type</th>
              <th className="p-2">Added</th>
              <th className="p-2">Updated</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const phones = phonesByBuyer[r.id] || [];
              const owner1 = [r.owner1_first, r.owner1_last].filter(Boolean).join(" ");
              const owner2 = [r.owner2_first, r.owner2_last].filter(Boolean).join(" ");
              return (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="p-2 font-medium">
                    <div>{owner1 || "—"}</div>
                    {owner2 && <div className="text-xs text-muted-foreground">{owner2}</div>}
                  </td>
                  <td className="p-2">
                    <div>{r.property_address}</div>
                    <div className="text-xs text-muted-foreground">
                      {[r.property_city, r.property_state, r.property_zip].filter(Boolean).join(", ")}
                      {r.property_county ? ` · ${r.property_county}` : ""}
                    </div>
                  </td>
                  <td className="p-2 text-xs text-muted-foreground">
                    {r.mailing_address ? (
                      <>
                        <div>{r.mailing_address}</div>
                        <div>{[r.mailing_city, r.mailing_state, r.mailing_zip].filter(Boolean).join(", ")}</div>
                      </>
                    ) : "—"}
                  </td>
                  <td className="p-2">
                    {phones.length === 0 ? <span className="text-muted-foreground">—</span> : (
                      <div className="space-y-1">
                        {phones.map(p => (
                          <div key={p.id} className="flex items-center gap-1.5">
                            <span className="font-mono text-xs">{p.phone}</span>
                            <Badge
                              variant={
                                p.status === "works" ? "default"
                                : p.status === "wrong_number" ? "destructive"
                                : "outline"
                              }
                              className="text-[10px] px-1.5 py-0"
                            >
                              {p.status === "works" ? "✓" : p.status === "wrong_number" ? "✗" : "—"}
                            </Badge>
                            <div className="flex gap-0.5">
                              <button title="Mark works" className="p-0.5 hover:bg-muted rounded"
                                onClick={() => setPhoneStatus(p.id, "works")}><Check className="h-3 w-3" /></button>
                              <button title="Mark wrong number" className="p-0.5 hover:bg-muted rounded"
                                onClick={() => setPhoneStatus(p.id, "wrong_number")}><X className="h-3 w-3" /></button>
                              <button title="Reset" className="p-0.5 hover:bg-muted rounded"
                                onClick={() => setPhoneStatus(p.id, "untried")}><Minus className="h-3 w-3" /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="p-2 text-xs">
                    {[r.email1, r.email2, r.email3].filter(Boolean).map((e, i) => (
                      <div key={i}>{e}</div>
                    )) || "—"}
                  </td>
                  <td className="p-2">
                    {r.buyer_type === "individual_investor" && <Badge variant="outline">Individual</Badge>}
                    {r.buyer_type === "company_investor" && <Badge variant="secondary">Company</Badge>}
                  </td>
                  <td className="p-2 text-xs text-muted-foreground">
                    {new Date(r.first_uploaded_at).toLocaleDateString()}
                  </td>
                  <td className="p-2 text-xs text-muted-foreground">
                    {new Date(r.updated_at).toLocaleDateString()}
                  </td>
                </tr>
              );
            })}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No records.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ---------- Mapping dialog ---------- */}
      <Dialog open={!!pending} onOpenChange={(o) => !o && !uploading && setPending(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Map CSV Columns</DialogTitle>
            <DialogDescription>
              Confirm which CSV column feeds each field. Auto-mapped where possible.
              Rows whose Owner Type is not <code>INDIVIDUAL,INVESTOR</code> or
              <code> COMPANY,INVESTOR</code> will be skipped.
            </DialogDescription>
          </DialogHeader>

          {pending && (
            <div className="space-y-4">
              <div className="text-xs text-muted-foreground">
                <span className="font-medium">{pending.fileName}</span> · {pending.dataRows.length} rows
                {previewStats && (
                  <> · <span className="text-foreground">{previewStats.accepted}</span> accepted
                  · <span className="text-foreground">{previewStats.skipped}</span> will be skipped</>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {FIELDS.map(f => (
                  <div key={f.key} className="flex items-center gap-2">
                    <label className="text-sm w-44 shrink-0">
                      {f.label}{f.required && <span className="text-destructive"> *</span>}
                    </label>
                    <Select
                      value={pending.mapping[f.key] === null ? "__none__" : String(pending.mapping[f.key])}
                      onValueChange={(v) =>
                        setPending(p => p ? ({
                          ...p,
                          mapping: { ...p.mapping, [f.key]: v === "__none__" ? null : Number(v) },
                        }) : p)
                      }
                    >
                      <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Not mapped —</SelectItem>
                        {pending.header.map((h, i) => (
                          <SelectItem key={i} value={String(i)}>{h || `(column ${i + 1})`}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)} disabled={uploading}>Cancel</Button>
            <Button onClick={ingest} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
