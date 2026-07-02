import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

export function AuditLogTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [merges, setMerges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [{ data: own }, { data: mrg }] = await Promise.all([
      supabase.from("ownership_audit_log").select("*").order("executed_at", { ascending: false }).limit(500),
      supabase.from("merge_audit_log").select("*").order("executed_at", { ascending: false }).limit(200),
    ]);
    setRows(own || []);
    setMerges(mrg || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          System-level audit trail: ownership changes and merge operations.
        </p>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Refresh
        </Button>
      </div>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Ownership changes
        </h3>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Location</th>
                <th>Old owner</th>
                <th>New owner</th>
                <th>Executed by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="text-xs text-muted-foreground">{new Date(r.executed_at).toLocaleString()}</td>
                  <td><Badge variant="outline">{r.action}</Badge></td>
                  <td className="text-xs font-mono">{r.location_id?.slice(0, 8) || "—"}</td>
                  <td className="text-xs font-mono">{r.old_owner_user_id?.slice(0, 8) || "—"}</td>
                  <td className="text-xs font-mono">{r.new_owner_user_id?.slice(0, 8) || "—"}</td>
                  <td className="text-xs text-muted-foreground">{r.ghl_admin_email || r.executed_by || "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="text-center py-6 text-muted-foreground">
                  {loading ? "Loading…" : "No ownership audit entries."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Merge operations
        </h3>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>When</th>
                <th>Phase</th>
                <th>Status</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {merges.map((r) => (
                <tr key={r.id}>
                  <td className="text-xs text-muted-foreground">{new Date(r.executed_at).toLocaleString()}</td>
                  <td>{r.phase}</td>
                  <td><Badge variant="outline">{r.status}</Badge></td>
                  <td className="text-xs text-muted-foreground truncate max-w-[500px]">
                    <code>{JSON.stringify(r.summary)}</code>
                  </td>
                </tr>
              ))}
              {merges.length === 0 && (
                <tr><td colSpan={4} className="text-center py-6 text-muted-foreground">
                  {loading ? "Loading…" : "No merge audit entries."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
