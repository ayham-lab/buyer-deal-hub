// Bulk CSV/XLSX import for archive_buyers (super-admin only).
// Supports multi-sheet workbooks, source-specific parsers, and rich quality fields.
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Upload, FileSpreadsheet, Download, RotateCcw, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { toast } from "sonner";

// ---------------- Field types ----------------

type FieldKey =
  | "skip" | "first_name" | "last_name" | "full_name" | "email"
  | "phone" | "phone2" | "city" | "state" | "city_state"
  | "markets" | "property_types" | "price_min" | "price_max"
  | "budget_notes" | "exit_strategy" | "quality_tier" | "last_outcome"
  | "zips" | "tags_pipeline"
  | "notes" | "company_name";

const FIELD_LABELS: Record<FieldKey, string> = {
  skip: "Skip this column",
  first_name: "First Name",
  last_name: "Last Name",
  full_name: "Full Name (auto-splits)",
  email: "Email",
  phone: "Phone (handles pipe+comma multi-value)",
  phone2: "Phone 2",
  city: "City",
  state: "State (handles ALL / anywhere → national flag)",
  city_state: 'City+State ("Philadelphia, PA")',
  markets: "Markets (comma-separated)",
  property_types: "Property Types",
  price_min: "Min Price",
  price_max: "Max Price",
  budget_notes: "Budget Notes (free text: 'no budget', 'sub 250k')",
  exit_strategy: "Exit Strategy ('flip', 'hold', 'ALL')",
  quality_tier: "Quality Tier (VIP, Vetted, Experienced, Purchased)",
  last_outcome: "Contact Outcome (voicemail, not interested, positive)",
  zips: "Zips (comma-separated zip codes)",
  tags_pipeline: "Tags (Florida pipe parser: 'buyer | florida-pinellas')",
  company_name: "Company Name",
  notes: "Notes / Mailing Address",
};

const FIELD_DESCRIPTIONS: Partial<Record<FieldKey, string>> = {
  phone: "Splits on | , ; / — first becomes Phone, second Phone 2, rest appended to notes. Accepts (555) 123-4567, +15551234567, 555-1234, 5551234567.",
  state: "ALL / anywhere / any → flags buyer as 'national'. 'Delaware if 6' → state=Delaware, 'if 6' goes to notes.",
  budget_notes: "Free text budget description preserved verbatim (e.g., 'up to $600k', 'no budget').",
  quality_tier: "Stored as text on archive_buyers.quality_tier. Case-insensitive matching.",
  last_outcome: "Last call disposition stored on archive_buyers.last_outcome.",
  zips: "Stored as JSON array on archive_buyers.preferred_zips.",
  tags_pipeline: "Florida-style 'buyer | state-region, tag' — extracts state/region into markets; loose tags appended to notes.",
};

const FIELD_ORDER: FieldKey[] = [
  "skip", "first_name", "last_name", "full_name", "company_name",
  "email", "phone", "phone2", "city", "state", "city_state",
  "markets", "property_types", "price_min", "price_max",
  "budget_notes", "exit_strategy", "quality_tier", "last_outcome",
  "zips", "tags_pipeline", "notes",
];

function autoDetect(header: string): FieldKey {
  const h = header.trim().toLowerCase().replace(/[_\-\s]+/g, " ");
  if (/^(email|e mail|email address)$/.test(h)) return "email";
  if (/(additional contact|alt(ernate)? phone|secondary phone|phone\s*2|phone b)/.test(h)) return "phone2";
  if (/(^|\s)(phone|cell|mobile|tel|telephone|phone number|primary phone|phone numbers?)(\s|$)/.test(h)) return "phone";
  if (/^(first|first name|fname|given)$/.test(h)) return "first_name";
  if (/^(last|last name|lname|surname|family)$/.test(h)) return "last_name";
  if (/^(full name|name|contact|contact name|buyer name)$/.test(h)) return "full_name";
  if (/^(company|company name|business|organization|org)$/.test(h)) return "company_name";
  if (/^(city)$/.test(h)) return "city";
  if (/^(state|st|region|states?)$/.test(h)) return "state";
  if (/(city.*state|location)/.test(h) && !/markets/.test(h)) return "city_state";
  if (/^zip|zips|zip codes|postal/.test(h)) return "zips";
  if (/^tags?$/.test(h)) return "tags_pipeline";
  if (/(vip|tier|quality|status)/.test(h) && !/contact/.test(h)) return "quality_tier";
  if (/(outcome|disposition|call result|contact status)/.test(h)) return "last_outcome";
  if (/(exit|strategy|flip|hold)/.test(h)) return "exit_strategy";
  if (/(budget|budget range|budget notes)/.test(h)) return "budget_notes";
  if (/(interested area|markets|preferred markets|areas|territor|counties|cities|buying area)/.test(h)) return "markets";
  if (/^type$|property type|asset type|product type/.test(h)) return "property_types";
  if (/(min price|price min|min budget|^min$)/.test(h)) return "price_min";
  if (/(max price|price max|max budget|^max$)/.test(h)) return "price_max";
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

// Split on pipe, comma, semicolon, slash, or whitespace-around-slash.
function splitPhoneCell(raw: string | null | undefined): { primary: string | null; secondary: string | null; extras: string[] } {
  if (!raw) return { primary: null, secondary: null, extras: [] };
  const parts = String(raw).split(/[|,;\/]+|\s+\/\s+/).map((s) => s.trim()).filter(Boolean);
  const normalized = parts.map(normalizePhone).filter(Boolean) as string[];
  return {
    primary: normalized[0] || null,
    secondary: normalized[1] || null,
    extras: normalized.slice(2),
  };
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

// Quality tier canonical mapping (case-insensitive contains).
function normalizeQualityTier(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s.includes("vip")) return "VIP Buyer";
  if (s.includes("vetted")) return "Vetted";
  if (s.includes("experienced")) return "Experienced";
  if (s.includes("purchased")) return "Purchased a deal";
  return raw.trim();
}

function normalizeOutcome(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (/voice ?mail|vm/.test(s)) return "voicemail";
  if (/unable|no answer|no contact/.test(s)) return "unable to connect";
  if (/not interested|nope|no thanks/.test(s)) return "not interested";
  if (/positive|interested|hot|warm/.test(s)) return "positive";
  return raw.trim();
}

// "ALL" / "anywhere" / "any" → national flag.
const NATIONAL_TOKENS = new Set(["all", "anywhere", "anywhere?", "any", "national", "nationwide", "us", "usa"]);

interface StateParseResult { states: string[]; national: boolean; extraNotes: string[] }
function parseStateCell(raw: string | null): StateParseResult {
  const out: StateParseResult = { states: [], national: false, extraNotes: [] };
  if (!raw) return out;
  for (const partRaw of String(raw).split(/[,;|]/)) {
    const part = partRaw.trim();
    if (!part) continue;
    const lower = part.toLowerCase();
    if (NATIONAL_TOKENS.has(lower)) { out.national = true; continue; }
    // "Delaware if 6" → state=Delaware, notes "if 6"
    const m = part.match(/^([A-Za-z .]+?)\s+(if .+|with .+|when .+)$/i);
    if (m) {
      out.states.push(m[1].trim());
      out.extraNotes.push(part);
    } else {
      out.states.push(part);
    }
  }
  return out;
}

function parseZips(raw: string | null): string[] {
  if (!raw) return [];
  return Array.from(new Set(
    String(raw).split(/[,;|\s]+/)
      .map((s) => s.trim().replace(/[^0-9]/g, ""))
      .filter((s) => s.length === 5)
  ));
}

interface TagsParseResult { markets: string[]; states: string[]; tagNotes: string[] }
function parseFloridaTags(raw: string | null): TagsParseResult {
  const out: TagsParseResult = { markets: [], states: [], tagNotes: [] };
  if (!raw) return out;
  for (const fragRaw of String(raw).split(",")) {
    const frag = fragRaw.trim();
    if (!frag) continue;
    if (frag.includes("|")) {
      // "buyer | florida-pinellas"
      const right = frag.split("|").slice(1).join("|").trim();
      if (!right) continue;
      const [stateLow, ...regionParts] = right.split("-");
      const stateName = stateLow ? stateLow.trim() : "";
      const region = regionParts.join("-").trim();
      if (stateName) out.states.push(titleCase(stateName));
      if (stateName && region) out.markets.push(`${titleCase(region)}, ${titleCase(stateName)}`);
      else if (stateName) out.markets.push(titleCase(stateName));
    } else {
      out.tagNotes.push(frag);
    }
  }
  return out;
}
function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
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

// Tabs we treat as "completed transaction" flag carriers.
const COMPLETED_TXN_TAB = /completed transaction/i;

// ---------------- Types ----------------

interface SheetData { name: string; headers: string[]; rows: Record<string, any>[] }
interface ParsedFile {
  fileName: string;
  sheets: SheetData[];
  isMultiSheet: boolean;
  statesDetected: boolean;
}

interface NormalizedRow {
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  phone_2: string | null;
  city: string | null;
  state: string | null;
  preferred_markets: string[];
  preferred_zips: string[];
  property_types: string[];
  price_min: number | null;
  price_max: number | null;
  budget_notes: string | null;
  exit_strategy: string | null;
  quality_tier: string | null;
  last_outcome: string | null;
  national: boolean;
  completed_transaction: boolean;
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
    const firstWithRows = p.sheets.find((s) => s.rows.length > 0) || p.sheets[0];
    const m: Record<string, FieldKey> = {};
    (firstWithRows?.headers || []).forEach((h) => { m[h] = autoDetect(h); });
    setMapping(m);
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
          ingest({ fileName: file.name, sheets: [{ name: "(csv)", headers, rows }], isMultiSheet: false, statesDetected: false });
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
          ingest({ fileName: file.name, sheets, isMultiSheet: sheets.length > 1, statesDetected });
        } catch (e: any) {
          toast.error("XLSX parse error: " + e.message);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      toast.error("Please upload a .csv or .xlsx file");
    }
  }

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

    // Phone (handles pipe + comma)
    const phoneCell = get("phone")[0] || "";
    const phone2Cell = get("phone2")[0] || "";
    const split = splitPhoneCell(phoneCell);
    let phone = split.primary;
    let phone2 = split.secondary;
    const extraPhones = [...split.extras];
    if (!phone2 && phone2Cell) phone2 = normalizePhone(phone2Cell);
    if (!phone && phone2) { phone = phone2; phone2 = null; }
    const phoneRawForReport = phoneCell || phone2Cell;

    // State (multi-value, ALL/anywhere → national, "Delaware if 6")
    const stateRaw = get("state")[0] || "";
    const stateParse = parseStateCell(stateRaw);
    let state: string | null = stateParse.states[0] || null;
    let national = stateParse.national;
    const extraNoteFromState = stateParse.extraNotes;

    let city = get("city")[0] || null;
    const cityState = get("city_state")[0];
    if (cityState && (!city || !state)) {
      const parts = cityState.split(",").map((s) => s.trim());
      if (parts.length >= 2) { city = city || parts[0] || null; state = state || parts[1] || null; }
    }

    // Auto-state from sheet/tab name (only fills when empty + tab is a state abbrev)
    let stateFullFromTab: string | null = null;
    if (autoStateFromTab && parsed?.isMultiSheet) {
      const ab = stateAbbrev(sheet.name);
      if (ab) stateFullFromTab = US_STATE_NAMES[ab];
    }
    if (!state && stateFullFromTab) state = stateFullFromTab;

    // Tags pipeline (Florida-style)
    const tagsParse = parseFloridaTags(get("tags_pipeline")[0] || null);

    // Markets aggregate
    const marketsFromCells = get("markets").flatMap(splitList);
    const extraStates = [...stateParse.states.slice(1), ...tagsParse.states];
    const markets = uniqueClean([
      ...marketsFromCells,
      ...tagsParse.markets,
      ...(cityState ? [cityState] : []),
      ...(city && state ? [`${city}, ${state}`] : []),
      ...(stateFullFromTab && !marketsFromCells.length ? [stateFullFromTab] : []),
      ...extraStates,
    ]);

    const propertyTypes = uniqueClean(get("property_types").flatMap(splitList).map(normalizePropertyType));
    const zips = parseZips(get("zips")[0] || null);

    const priceMin = parsePrice(get("price_min")[0]);
    const priceMax = parsePrice(get("price_max")[0]);
    const budgetNotes = get("budget_notes")[0] || null;
    const exitStrategy = get("exit_strategy")[0] || null;
    const qualityTier = normalizeQualityTier(get("quality_tier")[0] || null);
    const lastOutcome = normalizeOutcome(get("last_outcome")[0] || null);

    const noteParts = [
      get("notes").join(" | ") || null,
      phone2 ? `Alt phone: ${phone2}` : null,
      extraPhones.length ? `Extra phones: ${extraPhones.join(", ")}` : null,
      extraNoteFromState.length ? extraNoteFromState.join(" | ") : null,
      tagsParse.tagNotes.length ? `Tags: ${tagsParse.tagNotes.join(", ")}` : null,
    ].filter(Boolean) as string[];

    if (!phone) return { skip: phoneRawForReport ? "malformed phone" : "missing phone" };
    if (!firstOut && !lastOut && !full && !company) return { skip: "missing name" };

    return {
      first_name: firstOut || null,
      last_name: lastOut || null,
      full_name: full || (firstOut || lastOut ? `${firstOut} ${lastOut}`.trim() : company || null),
      email,
      phone,
      phone_2: phone2,
      city,
      state,
      preferred_markets: markets,
      preferred_zips: zips,
      property_types: propertyTypes,
      price_min: priceMin,
      price_max: priceMax,
      budget_notes: budgetNotes,
      exit_strategy: exitStrategy,
      quality_tier: qualityTier,
      last_outcome: lastOutcome,
      national,
      completed_transaction: COMPLETED_TXN_TAB.test(sheet.name),
      notes: noteParts.join(" | ") || null,
      source_tag: sourceTag || null,
    };
  }

  function uniqueClean(arr: string[]): string[] {
    return Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));
  }

  const activeSheets = useMemo<SheetData[]>(() => {
    if (!parsed) return [];
    if (!parsed.isMultiSheet || importAllSheets) return parsed.sheets.filter((s) => s.rows.length > 0);
    const one = parsed.sheets.find((s) => s.name === selectedSheet);
    return one ? [one] : [];
  }, [parsed, importAllSheets, selectedSheet]);

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
          setProgress({ sheetName: s.sheet, sheetIdx: si + 1, sheetTotal: sheetCount, done: i, total: s.valid.length });
          const { data, error } = await supabase.functions.invoke("import-archive-buyers", { body: { rows: chunk } });
          if (error) throw new Error(error.message);
          if ((data as any)?.error) throw new Error((data as any).error);
          sInserted += (data as any)?.inserted || 0;
          sMerged += (data as any)?.merged || 0;
        }
        setProgress({ sheetName: s.sheet, sheetIdx: si + 1, sheetTotal: sheetCount, done: s.valid.length, total: s.valid.length });
        totalInserted += sInserted; totalMerged += sMerged;
        allSkipped.push(...s.skipped);
        perSheetReport.push({ sheet: s.sheet, total: s.total, valid: s.valid.length, inserted: sInserted, merged: sMerged, skipped: s.skipped.length });
      }
      setReport({ inserted: totalInserted, merged: totalMerged, skipped: allSkipped, total: validation.totalRows, perSheet: perSheetReport });
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

  const mappingHeaders = parsed.sheets.find((s) => s.rows.length > 0)?.headers
    || parsed.sheets[0]?.headers || [];
  const previewSheet = (parsed.isMultiSheet && !importAllSheets)
    ? parsed.sheets.find((s) => s.name === selectedSheet) || parsed.sheets[0]
    : parsed.sheets.find((s) => s.rows.length > 0) || parsed.sheets[0];
  const parsedPreviewRows = (validation?.perSheet.find((p) => p.sheet === previewSheet?.name)?.valid
    || validation?.perSheet[0]?.valid
    || []).slice(0, 5);

  return (
    <TooltipProvider delayDuration={200}>
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
                      <td className="text-muted-foreground">{stateAbbrev(s.name) ? US_STATE_NAMES[s.name] : COMPLETED_TXN_TAB.test(s.name) ? "Completed Transaction" : ""}</td>
                      <td className="text-right">{s.rows.length} rows</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-2 text-sm pt-1 border-t border-border">
              <Switch checked={autoStateFromTab} onCheckedChange={setAutoStateFromTab} />
              <span>Auto-fill State from tab name when tab is a US state code (e.g. FL → Florida). Non-state tabs (InvestorLift, Other Buyers) are skipped.</span>
            </div>
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
                  <SelectTrigger className="w-[280px] h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FIELD_ORDER.map((k) => {
                      const desc = FIELD_DESCRIPTIONS[k];
                      const item = (
                        <SelectItem key={k} value={k}>
                          <span className="inline-flex items-center gap-1">
                            {FIELD_LABELS[k]}
                            {desc && <Info className="h-3 w-3 text-muted-foreground" />}
                          </span>
                        </SelectItem>
                      );
                      return desc ? (
                        <Tooltip key={k}>
                          <TooltipTrigger asChild><div>{item}</div></TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs text-xs">{desc}</TooltipContent>
                        </Tooltip>
                      ) : item;
                    })}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>

        {/* Raw preview */}
        <div className="bg-card border border-border rounded-lg p-4 space-y-2">
          <div className="text-sm font-semibold">
            Raw preview — sheet <span className="font-mono">{previewSheet?.name}</span> (first 5 rows)
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

        {/* Parsed preview — what will actually land in the DB */}
        <div className="bg-card border border-border rounded-lg p-4 space-y-2">
          <div className="text-sm font-semibold">
            Parsed preview — first 5 rows after mapping & normalization
          </div>
          {parsedPreviewRows.length === 0 ? (
            <div className="text-xs text-muted-foreground">No valid rows yet — adjust mapping above.</div>
          ) : (
            <div className="overflow-auto rounded border border-border">
              <table className="data-table w-full text-xs">
                <thead>
                  <tr>
                    <th>Name</th><th>Email</th><th>Phone</th><th>Phone 2</th>
                    <th>State</th><th>City</th><th>Markets</th><th>Zips</th>
                    <th>Tier</th><th>Outcome</th><th>Exit</th><th>Budget</th>
                    <th>Min</th><th>Max</th><th>National</th><th>Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedPreviewRows.map((r, i) => (
                    <tr key={i}>
                      <td className="truncate max-w-[140px]">{r.full_name}</td>
                      <td className="truncate max-w-[160px]">{r.email || "—"}</td>
                      <td className="font-mono">{r.phone || "—"}</td>
                      <td className="font-mono">{r.phone_2 || "—"}</td>
                      <td>{r.state || "—"}</td>
                      <td>{r.city || "—"}</td>
                      <td className="truncate max-w-[160px]">{r.preferred_markets.join(", ") || "—"}</td>
                      <td className="truncate max-w-[120px]">{r.preferred_zips.join(", ") || "—"}</td>
                      <td>{r.quality_tier || "—"}</td>
                      <td>{r.last_outcome || "—"}</td>
                      <td>{r.exit_strategy || "—"}</td>
                      <td className="truncate max-w-[120px]">{r.budget_notes || "—"}</td>
                      <td>{r.price_min ?? "—"}</td>
                      <td>{r.price_max ?? "—"}</td>
                      <td>{r.national ? "✓" : ""}</td>
                      <td>{r.completed_transaction ? "✓" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
    </TooltipProvider>
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
