import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Upload, Search, Check, X, Minus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useActiveLocation } from "@/contexts/LocationContext";

// Expected CSV columns (case-insensitive, flexible aliases):
// Owner 1 first, Owner 1 last, address, city, state, zip,
// mailing address, mailing city, mailing state, mailing zip,
// Phone 1..Phone 5, email 1, email 2, buyer type
const HEADER_ALIASES: Record<string, string[]> = {
  owner1_first: ["owner 1 first", "owner1_first", "owner first", "first name", "first"],
  owner1_last:  ["owner 1 last", "owner1_last", "owner last", "last name", "last"],
  property_address: ["address", "property address", "property_address", "site address"],
  property_city:    ["city", "property city", "property_city"],
  property_state:   ["state", "property state", "property_state"],
  property_zip:     ["zip", "property zip", "zipcode", "zip code", "property_zip"],
  mailing_address:  ["mailing address", "mailing_address", "mail address"],
  mailing_city:     ["mailing city", "mailing_city"],
  mailing_state:    ["mailing state", "mailing_state"],
  mailing_zip:      ["mailing zip", "mailing_zip", "mail zip"],
  phone1: ["phone 1", "phone1", "phone"],
  phone2: ["phone 2", "phone2"],
  phone3: ["phone 3", "phone3"],
  phone4: ["phone 4", "phone4"],
  phone5: ["phone 5", "phone5"],
  email1: ["email 1", "email1", "email"],
  email2: ["email 2", "email2"],
  buyer_type: ["buyer type", "buyer_type", "type"],
};

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

function mapHeaders(header: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const lowered = header.map(h => h.trim().toLowerCase());
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = lowered.findIndex(h => aliases.includes(h));
    if (idx !== -1) map[key] = idx;
  }
  return map;
}

function normalizeBuyerType(v: string | undefined): "individual_investor" | "company_investor" | null {
  if (!v) return null;
  const s = v.trim().toLowerCase();
  if (!s) return null;
  if (s.includes("compan") || s.includes("llc") || s.includes("corp") || s.includes("inc")) return "company_investor";
  if (s.includes("individ") || s.includes("person")) return "individual_investor";
  return null;
}

type SkiptraceBuyer = {
  id: string;
  owner1_first: string | null;
  owner1_last: string | null;
  property_address: string;
  property_city: string | null;
  property_state: string | null;
  property_zip: string | null;
  mailing_address: string | null;
  mailing_city: string | null;
  mailing_state: string | null;
  mailing_zip: string | null;
  email1: string | null;
  email2: string | null;
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

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.length < 2) throw new Error("CSV has no data rows");
      const header = parsed[0];
      const idx = mapHeaders(header);
      if (idx.property_address === undefined) {
        throw new Error("CSV is missing an 'address' column");
      }

      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;

      const { data: batchRes, error: batchErr } = await supabase
        .from("skiptrace_upload_batches" as any)
        .insert({
          uploaded_by_user: uid,
          uploaded_by_location: activeLocationId,
          filename: file.name,
          row_count: parsed.length - 1,
        })
        .select()
        .single();
      if (batchErr) throw batchErr;
      const batchId = (batchRes as any).id as string;

      let inserted = 0;
      let updated = 0;
      const get = (row: string[], key: string) => {
        const i = idx[key];
        if (i === undefined) return null;
        const v = row[i]?.trim();
        return v ? v : null;
      };

      for (let r = 1; r < parsed.length; r++) {
        const row = parsed[r];
        const property_address = get(row, "property_address");
        if (!property_address) continue;

        const buyerPayload = {
          owner1_first: get(row, "owner1_first"),
          owner1_last: get(row, "owner1_last"),
          property_address,
          property_city: get(row, "property_city"),
          property_state: get(row, "property_state"),
          property_zip: get(row, "property_zip"),
          mailing_address: get(row, "mailing_address"),
          mailing_city: get(row, "mailing_city"),
          mailing_state: get(row, "mailing_state"),
          mailing_zip: get(row, "mailing_zip"),
          email1: get(row, "email1"),
          email2: get(row, "email2"),
          buyer_type: normalizeBuyerType(get(row, "buyer_type") || undefined),
          last_source_batch_id: batchId,
          last_source_location_id: activeLocationId,
        };

        // Dedup on property_address_key (generated). Use upsert via lookup.
        const addrKey = property_address.trim().toLowerCase().replace(/\s+/g, " ");
        const { data: existingRaw } = await supabase
          .from("skiptrace_buyers" as any)
          .select("id")
          .eq("property_address_key" as any, addrKey)
          .maybeSingle();
        const existing = existingRaw as { id: string } | null;

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

        // Phones: append any new ones (unique on buyer_id + phone_digits)
        const phones = [1, 2, 3, 4, 5]
          .map(n => ({ position: n, phone: get(row, `phone${n}`) }))
          .filter(p => p.phone) as { position: number; phone: string }[];

        if (phones.length) {
          const payload = phones.map(p => ({
            buyer_id: buyerId,
            phone: p.phone,
            position: p.position,
          }));
          // Best-effort insert; unique index dedupes existing
          await supabase.from("skiptrace_buyer_phones" as any).insert(payload);
        }
      }

      await supabase
        .from("skiptrace_upload_batches" as any)
        .update({ inserted_count: inserted, updated_count: updated })
        .eq("id", batchId);

      toast({
        title: "Upload complete",
        description: `${inserted} new investors added, ${updated} updated.`,
      });
      await load();
    } catch (e: any) {
      console.error("Skiptrace upload failed:", e);
      toast({ title: "Upload failed", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
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
        r.property_city?.toLowerCase().includes(s) ||
        r.email1?.toLowerCase().includes(s) ||
        r.email2?.toLowerCase().includes(s)
      );
    });
  }, [rows, q, stateFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex-1">
          <h3 className="text-lg font-semibold">Skiptraced Investor Database</h3>
          <p className="text-sm text-muted-foreground">
            Global pool of investor records used by buyer-match. Re-uploads dedup on property address.
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
          }}
        />
        <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
          Upload CSV
        </Button>
      </div>

      <div className="text-xs text-muted-foreground bg-muted/40 border border-border rounded p-3">
        Expected columns (case-insensitive): <code>Owner 1 first</code>, <code>Owner 1 last</code>,
        <code> address</code>, <code>city</code>, <code>state</code>, <code>zip</code>,
        <code> mailing address</code>, <code>mailing city</code>, <code>mailing state</code>, <code>mailing zip</code>,
        <code> Phone 1..Phone 5</code>, <code>email 1</code>, <code>email 2</code>,
        <code> buyer type</code> (individual investor / company investor).
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
              <th className="p-2">Owner</th>
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
              return (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="p-2 font-medium">
                    {[r.owner1_first, r.owner1_last].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td className="p-2">
                    <div>{r.property_address}</div>
                    <div className="text-xs text-muted-foreground">
                      {[r.property_city, r.property_state, r.property_zip].filter(Boolean).join(", ")}
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
                              <button
                                title="Mark works"
                                className="p-0.5 hover:bg-muted rounded"
                                onClick={() => setPhoneStatus(p.id, "works")}
                              ><Check className="h-3 w-3" /></button>
                              <button
                                title="Mark wrong number"
                                className="p-0.5 hover:bg-muted rounded"
                                onClick={() => setPhoneStatus(p.id, "wrong_number")}
                              ><X className="h-3 w-3" /></button>
                              <button
                                title="Reset"
                                className="p-0.5 hover:bg-muted rounded"
                                onClick={() => setPhoneStatus(p.id, "untried")}
                              ><Minus className="h-3 w-3" /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="p-2 text-xs">
                    {[r.email1, r.email2].filter(Boolean).join(", ") || <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="p-2 text-xs capitalize">
                    {r.buyer_type ? r.buyer_type.replace("_", " ") : "—"}
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
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="text-center p-6 text-muted-foreground">
                {loading ? "Loading…" : "No skiptrace investors yet. Upload a CSV to get started."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default SkiptraceBuyersTab;
