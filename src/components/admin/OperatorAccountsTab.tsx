// Admin Console: list every operator account across the platform (super_admin only).
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Layers, Infinity as InfinityIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

interface Row {
  id: string;
  name: string;
  owner_user_id: string;
  subscription_status: string | null;
  current_period_end: string | null;
  credit_balance: number;
  created_at: string;
}

interface LocRow { id: string; name: string; archive: boolean }

export function OperatorAccountsTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [locByOp, setLocByOp] = useState<Record<string, LocRow[]>>({});
  const [ownerEmail, setOwnerEmail] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [{ data: ops }, { data: tokens }, { data: profiles }] = await Promise.all([
      supabase.from("operator_accounts").select("*").order("created_at", { ascending: false }),
      supabase.from("ghl_location_tokens").select("ghl_location_id, location_name, operator_account_id, archive_contributions_enabled"),
      supabase.from("profiles").select("user_id, email"),
    ]);
    setRows((ops as any) || []);
    const map: Record<string, LocRow[]> = {};
    (tokens || []).forEach((t: any) => {
      if (!t.operator_account_id) return;
      (map[t.operator_account_id] ||= []).push({
        id: t.ghl_location_id,
        name: t.location_name || t.ghl_location_id,
        archive: t.archive_contributions_enabled !== false,
      });
    });
    setLocByOp(map);
    const e: Record<string, string> = {};
    (profiles || []).forEach((p: any) => { e[p.user_id] = p.email || ""; });
    setOwnerEmail(e);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function toggleArchive(locId: string, next: boolean) {
    setBusy(locId);
    const { data, error } = await supabase.rpc("set_location_archive_contributions" as any, {
      p_location: locId, p_enabled: next,
    });
    setBusy(null);
    if (error || data === false) {
      toast.error(error?.message || "Failed to update");
      return;
    }
    toast.success(next ? "Archive sync on" : "Archive sync off");
    setLocByOp((m) => {
      const out = { ...m };
      for (const k of Object.keys(out)) {
        out[k] = out[k].map((l) => l.id === locId ? { ...l, archive: next } : l);
      }
      return out;
    });
  }

  if (loading) return <Loader2 className="h-4 w-4 animate-spin mt-6" />;

  return (
    <div className="space-y-4 mt-2">
      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground p-6 border border-dashed rounded-md">
          No operator accounts created yet.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const isActive =
              r.subscription_status === "active" &&
              (!r.current_period_end || new Date(r.current_period_end) > new Date());
            const locs = locByOp[r.id] || [];
            return (
              <div key={r.id} className="border rounded-md p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-primary" />
                      <div className="text-sm font-semibold">{r.name}</div>
                      {isActive && (
                        <Badge variant="secondary" className="gap-1">
                          <InfinityIcon className="h-3 w-3" /> Unlimited
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Owner: {ownerEmail[r.owner_user_id] || r.owner_user_id.slice(0, 8)}
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    {!isActive && <div>{r.credit_balance.toLocaleString()} credits</div>}
                    <div>{locs.length} location{locs.length === 1 ? "" : "s"}</div>
                  </div>
                </div>
                {locs.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {locs.map((l) => (
                      <div key={l.id} className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-2.5 py-1.5">
                        <div className="text-xs truncate">{l.name}</div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[10px] uppercase tracking-wide ${l.archive ? "text-muted-foreground" : "text-destructive"}`}>
                            {l.archive ? "Archive sync: on" : "Archive sync: off"}
                          </span>
                          <Switch
                            checked={l.archive}
                            disabled={busy === l.id}
                            onCheckedChange={(v) => toggleArchive(l.id, !!v)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
