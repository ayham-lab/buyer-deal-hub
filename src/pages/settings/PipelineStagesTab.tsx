import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, ArrowUp, ArrowDown, RotateCcw } from "lucide-react";
import { useActiveLocation } from "@/contexts/LocationContext";
import { DEFAULT_STAGES, StageCol } from "@/hooks/usePipelineStages";

type Row = StageCol & { sort_order: number };

export default function PipelineStagesTab() {
  const { activeLocation } = useActiveLocation();
  const locationId = activeLocation?.locationId ?? null;
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!locationId) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("pipeline_stage_settings")
      .select("stage_id,label,sort_order,hidden")
      .eq("ghl_location_id", locationId);
    const overrides = new Map<string, any>();
    (data ?? []).forEach((r: any) => overrides.set(r.stage_id, r));
    const merged: Row[] = DEFAULT_STAGES.map((d, i) => {
      const o = overrides.get(d.id);
      return {
        id: d.id,
        label: o?.label || d.label,
        hidden: !!o?.hidden,
        sort_order: o?.sort_order ?? i,
      };
    }).sort((a, b) => a.sort_order - b.sort_order);
    setRows(merged);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [locationId]);

  function move(idx: number, dir: -1 | 1) {
    setRows((arr) => {
      const next = [...arr];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return arr;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next.map((r, i) => ({ ...r, sort_order: i }));
    });
  }

  function updateLabel(idx: number, v: string) {
    setRows((arr) => arr.map((r, i) => (i === idx ? { ...r, label: v } : r)));
  }
  function toggleHidden(idx: number, v: boolean) {
    setRows((arr) => arr.map((r, i) => (i === idx ? { ...r, hidden: v } : r)));
  }

  async function saveAll() {
    if (!locationId) return;
    setSaving(true);
    const payload = rows.map((r, i) => ({
      ghl_location_id: locationId,
      stage_id: r.id,
      label: r.label.trim() || DEFAULT_STAGES.find((d) => d.id === r.id)?.label || r.id,
      sort_order: i,
      hidden: !!r.hidden,
    }));
    const { error } = await supabase
      .from("pipeline_stage_settings")
      .upsert(payload, { onConflict: "ghl_location_id,stage_id" });
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success("Pipeline stages saved"); load(); }
  }

  async function resetDefaults() {
    if (!locationId) return;
    if (!confirm("Reset stage labels, order, and visibility to defaults?")) return;
    setSaving(true);
    const { error } = await supabase
      .from("pipeline_stage_settings")
      .delete()
      .eq("ghl_location_id", locationId);
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success("Reset to defaults"); load(); }
  }

  if (!locationId) {
    return (
      <div className="mt-6 text-sm text-muted-foreground p-6 border border-dashed rounded-md">
        Select a workspace to customize its pipeline stages.
      </div>
    );
  }
  if (loading) return <Loader2 className="h-4 w-4 animate-spin mt-6" />;

  return (
    <div className="space-y-4 mt-6">
      <p className="text-sm text-muted-foreground">
        Rename, reorder, and hide pipeline stages for this workspace. Stage IDs stay the same behind the scenes so
        existing deals are unaffected — only the display label and order change.
      </p>
      <div className="border rounded-md divide-y">
        {rows.map((r, i) => (
          <div key={r.id} className="p-3 flex items-center gap-2">
            <div className="flex flex-col">
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => move(i, -1)} disabled={i === 0}>
                <ArrowUp className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => move(i, 1)} disabled={i === rows.length - 1}>
                <ArrowDown className="h-3 w-3" />
              </Button>
            </div>
            <div className="text-[10px] font-mono text-muted-foreground w-24 truncate">{r.id}</div>
            <Input
              className="flex-1"
              value={r.label}
              onChange={(e) => updateLabel(i, e.target.value)}
              placeholder={DEFAULT_STAGES.find((d) => d.id === r.id)?.label}
            />
            <div className="flex items-center gap-2 min-w-[110px] justify-end">
              <span className="text-xs text-muted-foreground">{r.hidden ? "Hidden" : "Visible"}</span>
              <Switch checked={!r.hidden} onCheckedChange={(v) => toggleHidden(i, !v)} />
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between items-center">
        <Button variant="ghost" size="sm" onClick={resetDefaults} disabled={saving}>
          <RotateCcw className="h-4 w-4 mr-1" /> Reset to defaults
        </Button>
        <Button onClick={saveAll} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Save changes
        </Button>
      </div>
    </div>
  );
}
