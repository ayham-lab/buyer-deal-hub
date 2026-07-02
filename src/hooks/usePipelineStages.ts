import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { STATUS_COLS } from "@/components/pipeline/utils";

export type StageId = (typeof STATUS_COLS)[number]["id"];
export type StageCol = { id: StageId; label: string; hidden?: boolean };

const DEFAULTS: StageCol[] = STATUS_COLS.map((s) => ({ id: s.id, label: s.label }));

export function usePipelineStages(locationId: string | null | undefined) {
  const [columns, setColumns] = useState<StageCol[]>(DEFAULTS);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!locationId) {
      setColumns(DEFAULTS);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("pipeline_stage_settings")
      .select("stage_id,label,sort_order,hidden")
      .eq("ghl_location_id", locationId);
    const overrides = new Map<string, { label: string; sort_order: number; hidden: boolean }>();
    (data ?? []).forEach((r: any) => {
      overrides.set(r.stage_id, { label: r.label, sort_order: r.sort_order, hidden: !!r.hidden });
    });
    const merged: (StageCol & { _order: number })[] = DEFAULTS.map((d, i) => {
      const o = overrides.get(d.id);
      return {
        id: d.id,
        label: o?.label || d.label,
        hidden: o?.hidden || false,
        _order: o?.sort_order ?? i,
      };
    });
    merged.sort((a, b) => a._order - b._order);
    setColumns(merged.map(({ _order, ...c }) => c));
    setLoading(false);
  }, [locationId]);

  useEffect(() => {
    load();
  }, [load]);

  return { columns, visibleColumns: columns.filter((c) => !c.hidden), reload: load, loading };
}

export const DEFAULT_STAGES = DEFAULTS;
