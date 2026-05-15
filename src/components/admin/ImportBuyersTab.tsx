// Bulk CSV/XLSX import for archive_buyers (super-admin only).
// Supports multi-sheet workbooks (e.g. one tab per US state).
import { useMemo, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, Download, RotateCcw, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

// ---------------- Field types ----------------

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
  phone: "Phone (auto-splits commas → Phone 2)",
  phone2: "Phone 2 (alt)",
  city: "City",
  state: "State",
  city_state: 'City+State ("Philadelphia, PA")',
  markets: "Markets / Interested Area (comma-sep)",
  property_types: "Property Types (comma-sep)",
  price_min: "Min Price",
  price_max: "Max Price",
  notes: "Notes / Mailing Address",
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
  if (/(additional contact|alt(ernate)? phone|secondary phone|phone\s*2|phone b)/.test(h)) return "phone2";
  if (/(^|\s)(phone|cell|mobile|tel|telephone|phone number|primary phone)(\s|$)/.test(h)) return "phone";
  if (/^(first|first name|fname|given)$/.test(h)) return "first_name";
  if (/^(last|last name|lname|surname|family)$/.test(h)) return "last_name";
  if (/^(full name|name|contact|contact name|buyer name)$/.test(h)) return "full_name";
  if (/^(company|company name|business|organization|org)$/.test(h)) return "company_name";
  if (/^(city)$/.test(h)) return "city";
  if (/^(state|st|region)$/.test(h)) return "state";
  if (/(city.*state|location)/.test(h) && !/markets/.test(h)) return "city_state";
  if (/(interested area|markets|preferred markets|areas|territor|counties|cities)/.test(h)) return "markets";
  if (/^type$|property type|asset type|product type/.test(h)) return "property_types";
  if (/(min price|price min|min budget|^min$)/.test(h)) return "price_min";
  if (/(max price|price max|max budget|^max$|^budget$)/.test(h)) return "price_max";
  if (/(mailing address|address|notes|comments|criteria|description|memo)/.test(h)) return "notes";
  return "skip";
}

// ---------------- Normalizers ----------------

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  if (digits.length === 10) return digits;
  return null;
}

function splitPhoneCell(raw: string | null | undefined): { primary: string | null; secondary: string | null } {
  if (!raw) return { primary: null, secondary: null };
  const parts = String(raw).split(/[,;\/]+|\s+\/\s+/).map((s) => s.trim()).filter(Boolean);
  return { primary: normalizePhone(parts[0]), secondary: parts[1] ? normalizePhone(parts[1]) : null };
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
  sfh: "SFH", "single family": "SFH", "single-family": "SFH", sf: "SFH",
  mfh: "MFH", multi: "MFH", multifamily: "MFH", "multi family": "MFH", "multi-family": "MFH",
  commercial: "Commercial", land: "Land", lot: "Land",
  mobile: "Mobile", manufactured: "Mobile", "mobile home": "Mobile",
};
function normalizePropertyType(s: string): string {
  return PROPERTY_TYPE_MAP[s.trim().toLowerCase()] || s.trim();
}

// ---------------- US states ----------------

const US_STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};
const stateAbbrev = (name: string): string | null => {
  const k = name.trim().toUpperCase();
  return US_STATE_NAMES[k] ? k : null;
};

// ---------------- Types ----------------

interface SheetData { name: string; headers: string[]; rows: Record<string, any>[] }
interface ParsedFile {
  fileName: string;
  sheets: SheetData[];
  isMultiSheet: boolean;
  statesDetected: boolean; // >= 60% of sheet names are state abbrevs
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

interface SkippedRow { sheet: string; rowNum: number; reason: string; raw: Record<string, any> }
interface SheetReport { sheet: string; total: number; valid: number; inserted: number; merged: number; skipped: number }

// ---------------- Component ----------------

export function ImportBuyersTab() {
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<Record<string, FieldKey>>({});
  const [sourceTag, setSourceTag] = useState("");
  const [importAllSheets, setImportAllSheets] = useState(true);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [autoStateFromTab, setAutoStateFromTab] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{
    sheetName: string; sheetIdx: number; sheetTotal: number; done: number; total: number;
  }>({ sheetName: "", sheetIdx: 0, sheetTotal: 0, done: 0, total: 0 });
  const [report, setReport] = useState<{
    inserted: number; merged: number; skipped: SkippedRow[]; total: number; perSheet: SheetReport[];
  } | null>(null);

  function reset() {
    setParsed(null); setMapping({}); setSourceTag(""); setReport(null);
    setImportAllSheets(true); setSelectedSheet(""); setAutoStateFromTab(true);
    setProgress({ sheetName: "", sheetIdx: 0, sheetTotal: 0, done: 0, total: 0 });
  }

  function ingest(p: ParsedFile) {
    setParsed(p);
    setSelectedSheet(p.sheets[0]?.name || "");
    // Pick mapping headers from first non-empty sheet
    const firstWithRows = p.sheets.find((s) => s.rows.length > 0) || p.sheets[0];
    const m: Record<string, FieldKey> = {};
    (firstWithRows?.headers || []).forEach((h) => { m[h] = autoDetect(h); });
    setMapping(m);
    // Default toggles
    setImportAllSheets(p.statesDetected || p.sheets.length === 1);
    setAutoStateFromTab(p.statesDetected);
  }

  function onFile(file: File) {
    setReport(null);
    setSourceTag(file.name.replace(/\.[^.]+$/, ""));
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "csv") {
      Papa.parse<Record<string, any>>(file, {
        header: true, skipEmptyLines: true,
        transformHeader: (h) => h.trim(),
        complete: (res) => {
          const headers = res.meta.fields || [];
          const rows = res.data.filter((r) => Object.values(r).some((v) => v != null && v !== ""));
          ingest({
            fileName: file.name,
            sheets: [{ name: "(csv)", headers, rows }],
            isMultiSheet: false,
            statesDetected: false,
          });
        },
        error: (e) => toast.error("CSV parse error: " + e.message),
      });
    } else if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const wb = XLSX.read(ev.target?.result, { type: "array" });
          const sheets: SheetData[] = wb.SheetNames.map((name) => {
            const sheet = wb.Sheets[name];
            const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "", raw: false });
            const rows = json.filter((r) => Object.values(r).some((v) => v != null && v !== ""));
            const headers = rows[0] ? Object.keys(rows[0]) : (json[0] ? Object.keys(json[0]) : []);
            return { name, headers, rows };
          });
          const stateMatches = sheets.filter((s) => stateAbbrev(s.name)).length;
          const statesDetected = sheets.length >= 2 && stateMatches / sheets.length >= 0.6;
          ingest({
            fileName: file.name,
            sheets,
            isMultiSheet: sheets.length > 1,
            statesDetected,
          });
        } catch (e: any) {
          toast.error("XLSX parse error: " + e.message);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      toast.error("Please upload a .csv or .xlsx file");
    }
  }

  // Build a normalized row from raw + sheet context.
  function buildRow(raw: Record<string, any>, sheet: SheetData): NormalizedRow | { skip: string } {
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

    // Phone: mapped phone cell can contain "555-1, 555-2" → split. Phone 2 column also supported.
    const phoneCell = get("phone")[0] || "";
    const phone2Cell = get("phone2")[0] || "";
    const split = splitPhoneCell(phoneCell);
    let phone = split.primary;
    let phone2 = split.secondary;
    if (!phone2 && phone2Cell) phone2 = normalizePhone(phone2Cell);
    if (!phone && phone2) { phone = phone2; phone2 = null; }
    const phoneRawForReport = phoneCell || phone2Cell;

    // State
    let state = get("state")[0] || null;
    let city = get("city")[0] || null;
    const cityState = get("city_state")[0];
    if (cityState && (!city || !state)) {
      const parts = cityState.split(",").map((s) => s.trim());
      if (parts.length >= 2) { city = city || parts[0] || null; state = state || parts[1] || null; }
    }

    // Auto-state from sheet/tab name (overrides only if empty)
    let stateFullFromTab: string | null = null;
    if (autoStateFromTab && parsed?.isMultiSheet) {
      const ab = stateAbbrev(sheet.name);
      if (ab) stateFullFromTab = US_STATE_NAMES[ab];
    }
    if (!state && stateFullFromTab) state = stateFullFromTab;
    if (state && state.length > 2) {
      // Keep full name as-is for the row's state field; archive_buyers.state is text.
    } else if (state) {
      state = state.toUpperCase().slice(0, 2);
    }

    const markets = uniqueClean([
      ...get("markets").flatMap(splitList),
      ...(cityState ? [cityState] : []),
      ...(city && state ? [`${city}, ${state}`] : []),
      ...(stateFullFromTab ? [stateFullFromTab] : []),
    ]);
    const propertyTypes = uniqueClean(get("property_types").flatMap(splitList).map(normalizePropertyType));

    const priceMin = parsePrice(get("price_min")[0]);
    const priceMax = parsePrice(get("price_max")[0]);
    const notes = get("notes").join(" | ") || null;

    if (!phone) return { skip: phoneRawForReport ? "malformed phone" : "missing phone" };
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
      notes: [notes, phone2 ? `Alt phone: ${phone2}` : null].filter(Boolean).join(" | ") || null,
      source_tag: sourceTag || null,
    };
  }

  function uniqueClean(arr: string[]): string[] {
    return Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));
  }

  // Sheets to process based on toggle
  const activeSheets = useMemo<SheetData[]>(() => {
    if (!parsed) return [];
    if (!parsed.isMultiSheet || importAllSheets) return parsed.sheets.filter((s) => s.rows.length > 0);
    const one = parsed.sheets.find((s) => s.name === selectedSheet);
    return one ? [one] : [];
  }, [parsed, importAllSheets, selectedSheet]);

  // Validation (across selected sheets)
  const validation = useMemo(() => {
    if (!parsed) return null;
    const perSheet: { sheet: string; valid: NormalizedRow[]; skipped: SkippedRow[]; total: number }[] = [];
    let totalValid = 0, totalSkipped = 0, totalRows = 0;
    for (const sh of activeSheets) {
      const valid: NormalizedRow[] = [];
      const skipped: SkippedRow[] = [];
      sh.rows.forEach((r, i) => {
        const out = buildRow(r, sh);
        if ("skip" in out) skipped.push({ sheet: sh.name, rowNum: i + 2, reason: out.skip, raw: r });
        else valid.push(out);
      });
      perSheet.push({ sheet: sh.name, valid, skipped, total: sh.rows.length });
      totalValid += valid.length; totalSkipped += skipped.length; totalRows += sh.rows.length;
    }
    return { perSheet, totalValid, totalSkipped, totalRows };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, mapping, sourceTag, activeSheets, autoStateFromTab]);

  async function runImport() {
    if (!validation || validation.totalValid === 0) {
      toast.error("No valid rows to import");
      return;
    }
    setBusy(true);
    const sheetCount = validation.perSheet.length;
    const allSkipped: SkippedRow[] = [];
    const perSheetReport: SheetReport[] = [];
    let totalInserted = 0, totalMerged = 0;

    try {
      for (let si = 0; si < sheetCount; si++) {
        const s = validation.perSheet[si];
        let sInserted = 0, sMerged = 0;
        const batchSize = 500;
        for (let i = 0; i < s.valid.length; i += batchSize) {
          const chunk = s.valid.slice(i, i + batchSize);
          setProgress({
            sheetName: s.sheet, sheetIdx: si + 1, sheetTotal: sheetCount,
            done: i, total: s.valid.length,
          });
          const { data, error } = await supabase.functions.invoke("import-archive-buyers", {
            body: { rows: chunk },
          });
          if (error) throw new Error(error.message);
          if ((data as any)?.error) throw new Error((data as any).error);
          sInserted += (data as any)?.inserted || 0;
          sMerged += (data as any)?.merged || 0;
        }
        setProgress({
          sheetName: s.sheet, sheetIdx: si + 1, sheetTotal: sheetCount,
          done: s.valid.length, total: s.valid.length,
        });
        totalInserted += sInserted; totalMerged += sMerged;
        allSkipped.push(...s.skipped);
        perSheetReport.push({
          sheet: s.sheet, total: s.total, valid: s.valid.length,
          inserted: sInserted, merged: sMerged, skipped: s.skipped.length,
        });
      }
      setReport({
        inserted: totalInserted, merged: totalMerged, skipped: allSkipped,
        total: validation.totalRows, perSheet: perSheetReport,
      });
      toast.success(`Imported: ${totalInserted} new, ${totalMerged} merged across ${sheetCount} sheet${sheetCount === 1 ? "" : "s"}`);
    } catch (e: any) {
      toast.error("Import failed: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  function downloadSkipped() {
    if (!report?.skipped.length) return;
    const allHeaders = Array.from(new Set(report.skipped.flatMap((s) => Object.keys(s.raw))));
    const csv = Papa.unparse({
      fields: ["__sheet", "__row", "__reason", ...allHeaders],
      data: report.skipped.map((s) => ({
        __sheet: s.sheet, __row: s.rowNum, __reason: s.reason,
        ...Object.fromEntries(allHeaders.map((h) => [h, s.raw[h] ?? ""])),
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
          {report.perSheet.length > 1 && (
            <div className="rounded border border-border max-h-64 overflow-auto">
              <table className="data-table w-full text-xs">
                <thead><tr><th>Sheet</th><th>Rows</th><th>Inserted</th><th>Merged</th><th>Skipped</th></tr></thead>
                <tbody>
                  {report.perSheet.map((p) => (
                    <tr key={p.sheet}>
                      <td className="font-mono">{p.sheet}</td>
                      <td>{p.total}</td>
                      <td className="text-green-500">{p.inserted}</td>
                      <td className="text-blue-500">{p.merged}</td>
                      <td className={p.skipped ? "text-amber-500" : ""}>{p.skipped}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
        </div>
      </div>
    );
  }

  if (!parsed) {
    return (
      <label className="border-2 border-dashed border-border rounded-lg p-12 flex flex-col items-center gap-3 cursor-pointer hover:bg-muted/40 transition">
        <Upload className="h-8 w-8 text-muted-foreground" />
        <div className="text-sm font-medium">Drop CSV or XLSX file here, or click to browse</div>
        <div className="text-xs text-muted-foreground">Multi-sheet workbooks supported. Dedupe by email/phone is automatic.</div>
        <Input
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
      </label>
    );
  }

  // Mapping headers come from first non-empty sheet
  const mappingHeaders = parsed.sheets.find((s) => s.rows.length > 0)?.headers
    || parsed.sheets[0]?.headers || [];
  const previewSheet = (parsed.isMultiSheet && !importAllSheets)
    ? parsed.sheets.find((s) => s.name === selectedSheet) || parsed.sheets[0]
    : parsed.sheets.find((s) => s.rows.length > 0) || parsed.sheets[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <FileSpreadsheet className="h-4 w-4 text-primary" />
          <span className="font-medium">{parsed.fileName}</span>
          <Badge variant="secondary">
            {parsed.sheets.length} sheet{parsed.sheets.length === 1 ? "" : "s"} · {parsed.sheets.reduce((a, s) => a + s.rows.length, 0)} rows
          </Badge>
          {parsed.statesDetected && <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/30">US states detected</Badge>}
        </div>
        <Button variant="ghost" size="sm" onClick={reset}>Cancel</Button>
      </div>

      {/* Sheet selector for multi-sheet workbooks */}
      {parsed.isMultiSheet && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Sheets ({parsed.sheets.length})</div>
            <div className="flex items-center gap-2 text-sm">
              <Switch checked={importAllSheets} onCheckedChange={setImportAllSheets} />
              <span>Import all sheets</span>
            </div>
          </div>
          {!importAllSheets && (
            <Select value={selectedSheet} onValueChange={setSelectedSheet}>
              <SelectTrigger className="w-full md:w-[320px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {parsed.sheets.map((s) => (
                  <SelectItem key={s.name} value={s.name}>
                    {s.name} ({s.rows.length} rows{stateAbbrev(s.name) ? ` · ${US_STATE_NAMES[s.name]}` : ""})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="max-h-32 overflow-auto rounded border border-border text-xs">
            <table className="data-table w-full">
              <tbody>
                {parsed.sheets.map((s) => (
                  <tr key={s.name}>
                    <td className="font-mono w-16">{s.name}</td>
                    <td className="text-muted-foreground">{stateAbbrev(s.name) ? US_STATE_NAMES[s.name] : ""}</td>
                    <td className="text-right">{s.rows.length} rows</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsed.statesDetected && (
            <div className="flex items-center gap-2 text-sm pt-1 border-t border-border">
              <Switch checked={autoStateFromTab} onCheckedChange={setAutoStateFromTab} />
              <span>Auto-fill State from tab name (e.g. FL → Florida)</span>
            </div>
          )}
        </div>
      )}

      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <div className="text-sm font-semibold">Source tag (added to each buyer's sources array)</div>
        <Input value={sourceTag} onChange={(e) => setSourceTag(e.target.value)} placeholder="e.g. National-Cash-Buyers-2024" />
      </div>

      {/* Column mapper */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-2">
        <div className="text-sm font-semibold">
          Column mapping {parsed.isMultiSheet && <span className="text-xs text-muted-foreground font-normal">(applied to all sheets)</span>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {mappingHeaders.map((h) => (
            <div key={h} className="flex items-center gap-2 text-sm">
              <div className="flex-1 truncate font-mono text-xs bg-muted/40 px-2 py-1.5 rounded">{h}</div>
              <Select value={mapping[h] || "skip"} onValueChange={(v) => setMapping({ ...mapping, [h]: v as FieldKey })}>
                <SelectTrigger className="w-[260px] h-8"><SelectValue /></SelectTrigger>
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
        <div className="text-sm font-semibold">
          Preview — sheet <span className="font-mono">{previewSheet?.name}</span> (first 5 rows)
        </div>
        <div className="overflow-auto rounded border border-border">
          <table className="data-table w-full text-xs">
            <thead>
              <tr>{(previewSheet?.headers || []).map((h) => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {(previewSheet?.rows || []).slice(0, 5).map((r, i) => (
                <tr key={i}>
                  {(previewSheet?.headers || []).map((h) => <td key={h} className="truncate max-w-[160px]">{String(r[h] ?? "")}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Validation */}
      {validation && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <div className="text-sm font-semibold">Validation across {validation.perSheet.length} sheet{validation.perSheet.length === 1 ? "" : "s"}</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Stat label="Will import" value={validation.totalValid} tone="success" />
            <Stat label="Will skip" value={validation.totalSkipped} tone={validation.totalSkipped ? "warn" : undefined} />
            <Stat label="Total in file" value={validation.totalRows} />
          </div>
          {validation.totalSkipped > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> Show first 20 skipped rows
              </summary>
              <div className="mt-2 max-h-48 overflow-auto rounded border border-border">
                <table className="data-table w-full"><tbody>
                  {validation.perSheet.flatMap((p) => p.skipped).slice(0, 20).map((s, i) => (
                    <tr key={i}>
                      <td className="w-16 font-mono">{s.sheet}</td>
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
          <div className="text-sm">
            Importing sheet <span className="font-mono font-semibold">{progress.sheetName}</span>
            {progress.sheetTotal > 1 && <> ({progress.sheetIdx}/{progress.sheetTotal})</>} …
            {" "}{progress.done}/{progress.total} rows
          </div>
          <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} />
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={reset} disabled={busy}>Reset</Button>
        <Button onClick={runImport} disabled={busy || !validation?.totalValid}>
          {busy ? "Importing…" : `Import ${validation?.totalValid || 0} buyers`}
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
