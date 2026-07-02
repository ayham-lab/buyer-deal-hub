import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Search } from "lucide-react";
import { toast } from "sonner";

type Row = {
  ghl_location_id: string;
  location_name: string | null;
  god_mode: boolean;
  archive_contributions_enabled: boolean | null;
  operator_account_id: string | null;
  created_at: string;
  updated_at: string;
};

export function LocationsAdminTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_list_locations" as any);
    if (error) toast.error(error.message);
    setRows(((data as any) || []) as Row[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleGod = async (r: Row, v: boolean) => {
    setBusy(r.ghl_location_id);
    const { data, error } = await supabase.rpc("set_location_god_mode" as any, {
      p_location: r.ghl_location_id, p_enabled: v,
    });
    setBusy(null);
    if (error || !data) { toast.error(error?.message || "Not allowed"); return; }
    setRows((rs) => rs.map((x) => x.ghl_location_id === r.ghl_location_id ? { ...x, god_mode: v } : x));
    toast.success(v ? `God mode enabled for ${r.location_name || r.ghl_location_id}` : "God mode disabled");
  };

  const toggleArchive = async (r: Row, v: boolean) => {
    setBusy(r.ghl_location_id + "_arc");
    const { data, error } = await supabase.rpc("set_location_archive_contributions" as any, {
      p_location: r.ghl_location_id, p_enabled: v,
    });
    setBusy(null);
    if (error || !data) { toast.error(error?.message || "Not allowed (super admin only)"); return; }
    setRows((rs) => rs.map((x) => x.ghl_location_id === r.ghl_location_id ? { ...x, archive_contributions_enabled: v } : x));
  };

  const filtered = rows.filter((r) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (r.location_name || "").toLowerCase().includes(s) || r.ghl_location_id.toLowerCase().includes(s);
  });

  if (loading) return <Loader2 className="h-5 w-5 animate-spin" />;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Locations</h2>
          <p className="text-sm text-muted-foreground">
            Manage workspaces. Enable <span className="inline-flex items-center gap-1 font-medium"><Sparkles className="h-3.5 w-3.5" />God Mode</span> to give a location unlimited buyer archive reveals and skiptrace usage — no credit charges, no restrictions.
          </p>
        </div>
        <div className="relative w-72">
          <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
          <Input placeholder="Search locations…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
        </div>
      </div>

      <div className="border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left p-2 font-medium">Workspace</th>
              <th className="text-left p-2 font-medium">Location ID</th>
              <th className="text-left p-2 font-medium">Operator</th>
              <th className="text-left p-2 font-medium">Archive contributions</th>
              <th className="text-left p-2 font-medium">God Mode</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.ghl_location_id} className="border-t">
                <td className="p-2 font-medium">{r.location_name || <span className="text-muted-foreground">—</span>}</td>
                <td className="p-2 font-mono text-xs text-muted-foreground">{r.ghl_location_id}</td>
                <td className="p-2">
                  {r.operator_account_id
                    ? <Badge variant="secondary">Operator</Badge>
                    : <span className="text-muted-foreground text-xs">Standalone</span>}
                </td>
                <td className="p-2">
                  <Switch
                    checked={r.archive_contributions_enabled ?? true}
                    disabled={busy === r.ghl_location_id + "_arc"}
                    onCheckedChange={(v) => toggleArchive(r, v)}
                  />
                </td>
                <td className="p-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={r.god_mode}
                      disabled={busy === r.ghl_location_id}
                      onCheckedChange={(v) => toggleGod(r, v)}
                    />
                    {r.god_mode && (
                      <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30" variant="outline">
                        <Sparkles className="h-3 w-3 mr-1" /> Unlimited
                      </Badge>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground text-sm">No locations found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
