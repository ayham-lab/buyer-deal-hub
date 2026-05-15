// Bulk CSV/XLSX import for archive_buyers (super-admin only).
import { useMemo, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, Download, RotateCcw, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

type FieldKey =
  | "skip" | "first_name" | "last_name" | "full_name" | "email"
  | "phone" | "phone2" | "city" | "state" | "city_state"
  | "markets" | "property_types" | "price_min" | "price_max"
  | "notes" | "company_name";

const FIELD_LABELS: Record<FieldKey, string> = {
  skip: "Skip this column",
  first_name: "First Name",
  last_name: "Last Name",
  full_name: "Full Name",
  email: "Email",
  phone: "Phone",
  phone2: "Phone 2 (alt)",
  city: "City",
  state: "State",
  city_state: 'City+State ("Philadelphia, PA")',
  markets: "Markets (comma-sep)",
  property_types: "Property Types (comma-sep)",
  price_min: "Min Price",
  price_max: "Max Price",
  notes: "Notes",
  company_name: "Company Name",
};

const FIELD_ORDER: FieldKey[] = [
  "skip", "first_name", "last_name", "full_name", "company_name",
  "email", "phone", "phone2", "city", "state", "city_state",
  "markets", "property_types", "price_min", "price_max", "notes",
];

function autoDetect(header: string): FieldKey {
  const h = header.trim().toLowerCase().replace(/[_\-\s]+/g, " ");
  if (/^(email|e mail|email address)$/.test(h)) return "email";
  if (/(^|\s)(phone|cell|mobile|tel|telephone|phone number|primary phone)(\s|$)/.test(h)) return "phone";
  if (/(phone\s*2|alt(ernate)?\s*phone|secondary phone|phone b)/.test(h)) return "phone2";
  if (/^(first|first name|fname|given)$/.test(h)) return "first_name";
  if (/^(last|last name|lname|surname|family)$/.test(h)) return "last_name";
  if (/^(full name|name|contact|contact name|buyer name)$/.test(h)) return "full_name";
  if (/^(company|company name|business|organization|org)$/.test(h)) return "company_name";
  if (/^(city)$/.test(h)) return "city";
  if (/^(state|st|region)$/.test(h)) return "state";
  if (/(city.*state|location|market)/.test(h) && !/markets/.test(h)) return "city_state";
  if (/(markets|preferred markets|areas|territor|counties|cities)/.test(h)) return "markets";
  if (/(property type|asset type|product type|property|asset)/.test(h)) return "property_types";
  if (/(min price|price min|min budget|low|min)/.test(h)) return "price_min";
  if (/(max price|price max|max budget|high|max|budget)/.test(h)) return "price_max";
  if (/(notes|comments|criteria|description|memo)/.test(h)) return "notes";
  return "skip";
}

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  if (digits.length === 10) return digits;
  return null;
}

function parsePrice(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return Math.round(raw);
  const s = String(raw).trim().toLowerCase().replace(/[$,\s]/g, "");
  const m = s.match(/^([\d.]+)\s*([km]?)$/);
  if (!m) {
    const n = Number(s);
    return isNaN(n) ? null : Math.round(n);
  }
  const n = Number(m[1]);
  if (isNaN(n)) return null;
  if (m[2] === "k") return Math.round(n * 1000);
  if (m[2] === "m") return Math.round(n * 1_000_000);
  return Math.round(n);
}

const splitList = (v: string | null | undefined): string[] =>
  (v || "").split(/[;,|]/).map((s) => s.trim()).filter(Boolean);

const PROPERTY_TYPE_MAP: Record<string, string> = {
  "sfh": "SFH", "single family": "SFH", "single-family": "SFH", "sf": "SFH",
  "mfh": "MFH", "multi": "MFH", "multifamily": "MFH", "multi family": "MFH", "multi-family": "MFH",
  "commercial": "Commercial", "land": "Land", "lot": "Land",
  "mobile": "Mobile", "manufactured": "Mobile", "mobile home": "Mobile",
};
function normalizePropertyType(s: string): string {
  const k = s.trim().toLowerCase();
  return PROPERTY_TYPE_MAP[k] || s.trim();
}

interface ParsedFile {
  headers: string[];
  rows: Record<string, any>[];
  fileName: string;
}

interface NormalizedRow {
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  preferred_markets: string[];
  property_types: string[];
  price_min: number | null;
  price_max: number | null;
  notes: string | null;
  source_tag: string | null;
}

interface SkippedRow {
  rowNum: number;
  reason: string;
  raw: Record<string, any>;
}

export function ImportBuyersTab() {
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<Record<string, FieldKey>>({});
  const [sourceTag, setSourceTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [report, setReport] = useState<{
    inserted: number; merged: number; skipped: SkippedRow[]; total: number;
  } | null>(null);

  function reset() {
    setParsed(null); setMapping({}); setSourceTag(""); setReport(null);
    setProgress({ done: 0, total: 0 });
  }

  function onFile(file: File) {
    setReport(null);
    const ext = file.name.split(".").pop()?.toLowerCase();
    setSourceTag(file.name.replace(/\.[^.]+$/, ""));
    if (ext === "csv") {
      Papa.parse<Record<string, any>>(file, {
        header: true, skipEmptyLines: true,
        transformHeader: (h) => h.trim(),
        complete: (res) => {
          const headers = res.meta.fields || [];
          const rows = res.data.filter((r) => Object.values(r).some((v) => v != null && v !== ""));
          ingest({ headers, rows, fileName: file.name });
        },
        error: (e) => toast.error("CSV parse error: " + e.message),
      });
    } else if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const wb = XLSX.read(ev.target?.result, { type: "array" });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "", raw: false });
          const headers = json[0] ? Object.keys(json[0]) : [];
          const rows = json.filter((r) => Object.values(r).some((v) => v != null && v !== ""));
          ingest({ headers, rows, fileName: file.name });
        } catch (e: any) {
          toast.error("XLSX parse error: " + e.message);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      toast.error("Please upload a .csv or .xlsx file");
    }
  }

  function ingest(p: ParsedFile) {
    setParsed(p);
    const m: Record<string, FieldKey> = {};
    p.headers.forEach((h) => { m[h] = autoDetect(h); });
    setMapping(m);
  }

  // Group columns by field key (handle 2 phone columns, etc.)
  function buildRow(raw: Record<string, any>, rowNum: number): NormalizedRow | { skip: string } {
    const get = (key: FieldKey): string[] =>
      Object.entries(mapping)
        .filter(([_, v]) => v === key)
        .map(([h]) => String(raw[h] ?? "").trim())
        .filter(Boolean);

    const first = get("first_name")[0] || "";
    const last = get("last_name")[0] || "";
    const full = get("full_name")[0] || "";
    const company = get("company_name")[0] || "";
    let firstOut = first, lastOut = last;
    if (!firstOut && !lastOut && full) {
      const parts = full.trim().split(/\s+/);
      firstOut = parts[0] || "";
      lastOut = parts.slice(1).join(" ") || "";
    }

    const email = (get("email")[0] || "").toLowerCase() || null;
    const phoneRaw = get("phone")[0] || get("phone2")[0] || "";
    const phone = normalizePhone(phoneRaw);

    let city = get("city")[0] || null;
    let state = get("state")[0] || null;
    const cityState = get("city_state")[0];
    if (cityState && (!city || !state)) {
      const parts = cityState.split(",").map((s) => s.trim());
      if (parts.length >= 2) {
        city = city || parts[0] || null;
        state = state || parts[1] || null;
      }
    }
    if (state) state = state.toUpperCase().slice(0, 2);

    const markets = uniqueClean([
      ...get("markets").flatMap(splitList),
      ...(cityState ? [cityState] : []),
      ...(city && state ? [`${city}, ${state}`] : []),
    ]);
    const propertyTypes = uniqueClean(get("property_types").flatMap(splitList).map(normalizePropertyType));

    const priceMin = parsePrice(get("price_min")[0]);
    const priceMax = parsePrice(get("price_max")[0]);
    const notes = get("notes").join(" | ") || null;

    // Validate
    if (!phone) return { skip: phoneRaw ? "malformed phone" : "missing phone" };
    if (!firstOut && !lastOut && !full && !company) return { skip: "missing name" };

    return {
      first_name: firstOut || null,
      last_name: lastOut || null,
      full_name: full || (firstOut || lastOut ? `${firstOut} ${lastOut}`.trim() : company || null),
      email,
      phone,
      city,
      state,
      preferred_markets: markets,
      property_types: propertyTypes,
      price_min: priceMin,
      price_max: priceMax,
      notes,
      source_tag: sourceTag || null,
    };
  }

  function uniqueClean(arr: string[]): string[] {
    return Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));
  }

  const validation = useMemo(() => {
    if (!parsed) return null;
    const valid: NormalizedRow[] = [];
    const skipped: SkippedRow[] = [];
    parsed.rows.forEach((r, i) => {
      const out = buildRow(r, i + 2);
      if ("skip" in out) skipped.push({ rowNum: i + 2, reason: out.skip, raw: r });
      else valid.push(out);
    });
    return { valid, skipped };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, mapping, sourceTag]);

  async function runImport() {
    if (!validation || !validation.valid.length) {
      toast.error("No valid rows to import");
      return;
    }
    setBusy(true);
    const total = validation.valid.length;
    setProgress({ done: 0, total });
    let inserted = 0, merged = 0;
    const batchSize = 500;
    try {
      for (let i = 0; i < validation.valid.length; i += batchSize) {
        const chunk = validation.valid.slice(i, i + batchSize);
        const { data, error } = await supabase.functions.invoke("import-archive-buyers", {
          body: { rows: chunk },
        });
        if (error) throw new Error(error.message);
        if ((data as any)?.error) throw new Error((data as any).error);
        inserted += (data as any)?.inserted || 0;
        merged += (data as any)?.merged || 0;
        setProgress({ done: Math.min(i + chunk.length, total), total });
      }
      setReport({ inserted, merged, skipped: validation.skipped, total: parsed!.rows.length });
      toast.success(`Imported: ${inserted} new, ${merged} merged`);
    } catch (e: any) {
      toast.error("Import failed: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  function downloadSkipped() {
    if (!report?.skipped.length) return;
    const headers = parsed?.headers || [];
    const csv = Papa.unparse({
      fields: ["__row", "__reason", ...headers],
      data: report.skipped.map((s) => ({
        __row: s.rowNum, __reason: s.reason,
        ...Object.fromEntries(headers.map((h) => [h, s.raw[h] ?? ""])),
      })),
    });
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "skipped-rows.csv";
    a.click();
  }

  // ---------------- RENDER ----------------

  if (report) {
    return (
      <div className="space-y-4">
        <div className="bg-card border border-border rounded-lg p-6 space-y-4">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <CheckCircle2 className="h-5 w-5 text-green-500" /> Import complete
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Total rows" value={report.total} />
            <Stat label="Inserted" value={report.inserted} tone="success" />
            <Stat label="Merged" value={report.merged} tone="info" />
            <Stat label="Skipped" value={report.skipped.length} tone={report.skipped.length ? "warn" : undefined} />
          </div>
          <div className="flex gap-2">
            {report.skipped.length > 0 && (
              <Button variant="outline" onClick={downloadSkipped}>
                <Download className="h-4 w-4 mr-2" /> Download skipped rows
              </Button>
            )}
            <Button onClick={reset}>
              <RotateCcw className="h-4 w-4 mr-2" /> Import another file
            </Button>
          </div>
          {report.skipped.length > 0 && (
            <div className="rounded border border-border max-h-64 overflow-auto">
              <table className="data-table w-full text-xs">
                <thead><tr><th>Row</th><th>Reason</th><th>Preview</th></tr></thead>
                <tbody>
                  {report.skipped.slice(0, 200).map((s) => (
                    <tr key={s.rowNum}>
                      <td>{s.rowNum}</td>
                      <td><Badge variant="outline">{s.reason}</Badge></td>
                      <td className="truncate max-w-[400px]">{Object.values(s.raw).slice(0, 4).join(" · ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!parsed) {
    return (
      <div className="space-y-4">
        <label className="border-2 border-dashed border-border rounded-lg p-12 flex flex-col items-center gap-3 cursor-pointer hover:bg-muted/40 transition">
          <Upload className="h-8 w-8 text-muted-foreground" />
          <div className="text-sm font-medium">Drop CSV or XLSX file here, or click to browse</div>
          <div className="text-xs text-muted-foreground">Up to 10,000 rows. Dedupe by email/phone happens automatically.</div>
          <Input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
        </label>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <FileSpreadsheet className="h-4 w-4 text-primary" />
          <span className="font-medium">{parsed.fileName}</span>
          <Badge variant="secondary">{parsed.rows.length} rows</Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={reset}>Cancel</Button>
      </div>

      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <div className="text-sm font-semibold">Source tag (added to each buyer's sources array)</div>
        <Input value={sourceTag} onChange={(e) => setSourceTag(e.target.value)} placeholder="e.g. National-Cash-Buyers-2024" />
      </div>

      {/* Column mapper */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-2">
        <div className="text-sm font-semibold">Column mapping</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {parsed.headers.map((h) => (
            <div key={h} className="flex items-center gap-2 text-sm">
              <div className="flex-1 truncate font-mono text-xs bg-muted/40 px-2 py-1.5 rounded">{h}</div>
              <Select value={mapping[h] || "skip"} onValueChange={(v) => setMapping({ ...mapping, [h]: v as FieldKey })}>
                <SelectTrigger className="w-[220px] h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIELD_ORDER.map((k) => (
                    <SelectItem key={k} value={k}>{FIELD_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-2">
        <div className="text-sm font-semibold">Preview (first 5 rows)</div>
        <div className="overflow-auto rounded border border-border">
          <table className="data-table w-full text-xs">
            <thead>
              <tr>{parsed.headers.map((h) => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {parsed.rows.slice(0, 5).map((r, i) => (
                <tr key={i}>
                  {parsed.headers.map((h) => <td key={h} className="truncate max-w-[160px]">{String(r[h] ?? "")}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Validation */}
      {validation && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <div className="text-sm font-semibold">Validation</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Stat label="Will import" value={validation.valid.length} tone="success" />
            <Stat label="Will skip" value={validation.skipped.length} tone={validation.skipped.length ? "warn" : undefined} />
            <Stat label="Total in file" value={parsed.rows.length} />
          </div>
          {validation.skipped.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> Show first 20 skipped rows
              </summary>
              <div className="mt-2 max-h-48 overflow-auto rounded border border-border">
                <table className="data-table w-full"><tbody>
                  {validation.skipped.slice(0, 20).map((s) => (
                    <tr key={s.rowNum}>
                      <td className="w-12">{s.rowNum}</td>
                      <td className="w-32"><Badge variant="outline">{s.reason}</Badge></td>
                      <td className="truncate">{Object.values(s.raw).slice(0, 4).join(" · ")}</td>
                    </tr>
                  ))}
                </tbody></table>
              </div>
            </details>
          )}
        </div>
      )}

      {busy && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-2">
          <div className="text-sm">Importing… {progress.done} / {progress.total}</div>
          <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} />
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={reset} disabled={busy}>Reset</Button>
        <Button onClick={runImport} disabled={busy || !validation?.valid.length}>
          {busy ? "Importing…" : `Import ${validation?.valid.length || 0} buyers`}
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "success" | "warn" | "info" }) {
  const color =
    tone === "success" ? "text-green-500" :
    tone === "warn" ? "text-amber-500" :
    tone === "info" ? "text-blue-500" : "";
  return (
    <div className="rounded border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${color}`}>{value.toLocaleString()}</div>
    </div>
  );
}
