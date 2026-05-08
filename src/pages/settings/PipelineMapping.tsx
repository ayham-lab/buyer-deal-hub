import { useEffect, useState } from "react";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface InstalledLocation {
  ghl_location_id: string;
  ghl_company_id: string | null;
}

interface Stage {
  id: string;
  name: string;
  position?: number;
}
interface Pipeline {
  id: string;
  name: string;
  stages: Stage[];
}

export default function PipelineMapping() {
  const { user } = useAuth();
  const [locations, setLocations] = useState<InstalledLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase.functions.invoke(
        "ghl-list-installed-locations",
        { body: {} },
      );
      if (error || (data as any)?.error) {
        setError((data as any)?.error ?? error?.message ?? "Failed to load locations");
      } else {
        setLocations((data as any).locations ?? []);
      }
      setLoading(false);
    })();
  }, [user]);

  return (
    <AppLayout>
      <PageHeader
        title="Pipeline Mapping"
        subtitle="Choose which GoHighLevel pipeline stages should sync deals into Dispo Pro."
      />
      <div className="p-6 lg:p-8 max-w-4xl space-y-6">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : error ? (
          <div className="text-sm text-destructive">Error: {error}</div>
        ) : locations.length === 0 ? (
          <div className="text-sm text-muted-foreground p-6 border border-dashed rounded-md">
            No GHL locations have installed the app yet.
          </div>
        ) : (
          locations.map((l) => <LocationMapper key={l.ghl_location_id} location={l} />)
        )}
      </div>
    </AppLayout>
  );
}

function LocationMapper({ location }: { location: InstalledLocation }) {
  const { user } = useAuth();
  const [pipelines, setPipelines] = useState<Pipeline[] | null>(null);
  const [loadingPipes, setLoadingPipes] = useState(false);
  const [pipeError, setPipeError] = useState<string | null>(null);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>("");
  const [checkedStages, setCheckedStages] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingPipes(true);
      setPipeError(null);
      const { data, error } = await supabase.functions.invoke("ghl-list-pipelines", {
        body: { ghl_location_id: location.ghl_location_id },
      });
      if (cancelled) return;
      if (error || (data as any)?.error) {
        setPipeError((data as any)?.error ?? error?.message ?? "Failed to load pipelines");
        setLoadingPipes(false);
        return;
      }
      setPipelines((data as any).pipelines ?? []);
      setLoadingPipes(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [location.ghl_location_id]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("ghl_dispo_stage_mappings")
        .select("ghl_pipeline_id, ghl_stage_id")
        .eq("ghl_location_id", location.ghl_location_id);
      const rows = (data as any[]) ?? [];
      if (rows.length > 0) {
        setSelectedPipelineId(rows[0].ghl_pipeline_id);
        setCheckedStages(new Set(rows.map((r) => r.ghl_stage_id)));
      }
    })();
  }, [location.ghl_location_id]);

  const pipeline = pipelines?.find((p) => p.id === selectedPipelineId) ?? null;

  function toggleStage(stageId: string, checked: boolean) {
    setCheckedStages((prev) => {
      const next = new Set(prev);
      if (checked) next.add(stageId);
      else next.delete(stageId);
      return next;
    });
  }

  async function save() {
    if (!user || !pipeline) return;
    setSaving(true);

    const { error: delErr } = await supabase
      .from("ghl_dispo_stage_mappings")
      .delete()
      .eq("ghl_location_id", location.ghl_location_id);
    if (delErr) {
      setSaving(false);
      toast.error(delErr.message);
      return;
    }

    if (checkedStages.size > 0) {
      const rows = Array.from(checkedStages).map((stageId) => {
        const stage = pipeline.stages.find((s) => s.id === stageId);
        return {
          ghl_location_id: location.ghl_location_id,
          ghl_pipeline_id: pipeline.id,
          ghl_pipeline_name: pipeline.name,
          ghl_stage_id: stageId,
          ghl_stage_name: stage?.name ?? null,
          workspace_owner_user_id: user.id,
        };
      });
      const { error: insErr } = await supabase
        .from("ghl_dispo_stage_mappings")
        .insert(rows as any);
      if (insErr) {
        setSaving(false);
        toast.error(insErr.message);
        return;
      }
    }

    setSaving(false);
    toast.success("Pipeline mapping saved");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Location{" "}
          <span className="ml-2 text-xs font-mono text-muted-foreground">
            {location.ghl_location_id}
          </span>
          {location.ghl_company_id && (
            <span className="ml-2 text-xs font-mono text-muted-foreground">
              · company {location.ghl_company_id}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadingPipes ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : pipeError ? (
          <div className="text-sm text-destructive">Error: {pipeError}</div>
        ) : (
          <>
            <div className="space-y-2">
              <Label>Pipeline</Label>
              <Select value={selectedPipelineId} onValueChange={setSelectedPipelineId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a pipeline" />
                </SelectTrigger>
                <SelectContent>
                  {(pipelines ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {pipeline && (
              <div className="space-y-2">
                <Label>Stages that trigger Dispo Pro sync</Label>
                <div className="border rounded-md divide-y">
                  {pipeline.stages.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/40"
                    >
                      <Checkbox
                        checked={checkedStages.has(s.id)}
                        onCheckedChange={(c) => toggleStage(s.id, !!c)}
                      />
                      <span className="text-sm">{s.name}</span>
                    </label>
                  ))}
                  {pipeline.stages.length === 0 && (
                    <div className="p-3 text-sm text-muted-foreground">
                      This pipeline has no stages.
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="pt-2">
              <Button onClick={save} disabled={saving || !pipeline}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save mapping"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
