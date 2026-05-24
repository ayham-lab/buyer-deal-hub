import { useState } from "react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { withLocation } from "@/lib/locationScope";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, Download, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { BUYER_TEMPLATE_CSV, BUYER_STATUS_VALUES } from "@/lib/buyerCsv";

type Row = Record<string, string>;

const splitList = (v?: string) =>
  (v || "").split(/[;|]/).map((s) => s.trim()).filter(Boolean);

const num = (v?: string) => {
  if (!v) return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? null : n;
};

const STATUS_SET = new Set<string>(BUYER_STATUS_VALUES);
const normStatus = (v?: string) => {
  const s = (v || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return STATUS_SET.has(s) ? s : "not_vetted";
};

export function ImportBuyersModal({
  open, onClose, onImported,
}: { open: boolean; onClose: () => void; onImported: () => void }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);

  function handleFile(file: File) {
    setFileName(file.name);
    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
      complete: (res) => setRows(res.data.filter((r) => Object.values(r).some((v) => v))),
      error: (e) => toast.error("Parse error: " + e.message),
    });
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "buyer-rolodex-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function doImport() {
    if (!user || !rows.length) return;
    setBusy(true);
    const payload = rows.map((r) => {
      const first = (r.first_name || "").trim();
      const last = (r.last_name || "").trim();
      const name = (r.name || `${first} ${last}`).trim() || r.email || "Unnamed";
      return {
        user_id: user.id,
        name,
        first_name: first || null,
        last_name: last || null,
        email: r.email?.trim() || null,
        phone: r.phone?.trim() || null,
        company_name: r.company_name?.trim() || null,
        markets: splitList(r.markets),
        property_types: splitList(r.property_types),
        buyer_types: splitList(r.buyer_types),
        buyer_frequency: splitList(r.buyer_frequency),
        price_min: num(r.price_min),
        price_max: num(r.price_max),
        source: r.source?.trim() || "CSV Import",
        criteria_notes: r.criteria_notes?.trim() || null,
      };
    });

    // chunk insert to avoid huge payloads
    const chunkSize = 500;
    let inserted = 0;
    for (let i = 0; i < payload.length; i += chunkSize) {
      const chunk = payload.slice(i, i + chunkSize);
      const { error, count } = await supabase.from("buyers").insert(chunk.map((row) => withLocation(row as Record<string, unknown>)) as any, { count: "exact" });
      if (error) {
        toast.error(`Import failed at row ${i + 1}: ${error.message}`);
        setBusy(false);
        return;
      }
      inserted += count ?? chunk.length;
    }
    toast.success(`Imported ${inserted} buyer${inserted === 1 ? "" : "s"}`);
    setBusy(false);
    setRows([]);
    setFileName("");
    onImported();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Import Buyers from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV to bulk-add buyers to your Rolodex. Multi-value fields
            (markets, property types, etc.) should be separated by <code>;</code>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Button variant="outline" onClick={downloadTemplate} className="w-full justify-start">
            <Download className="h-4 w-4 mr-2" /> Download CSV template
          </Button>

          <label className="border-2 border-dashed border-border rounded-lg p-6 flex flex-col items-center gap-2 cursor-pointer hover:bg-muted/40 transition">
            <Upload className="h-6 w-6 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {fileName || "Click to choose a CSV file"}
            </span>
            <Input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </label>

          {rows.length > 0 && (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-primary" />
              <span>{rows.length} row{rows.length === 1 ? "" : "s"} ready to import</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button
              onClick={doImport}
              disabled={busy || !rows.length}
              className="bg-primary hover:bg-primary-hover"
            >
              {busy ? "Importing…" : `Import ${rows.length || ""}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
