import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { withLocation, getActiveLocationId } from "@/lib/locationScope";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Library } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Kind = "realtors" | "notaries";

export function ArchiveContactsBrowser({
  open, onClose, onAdded, kind,
}: { open: boolean; onClose: () => void; onAdded: () => void; kind: Kind }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const archiveTable = kind === "realtors" ? "archive_realtors" : "archive_notaries";
  const personalTable = kind;
  const label = kind === "realtors" ? "Realtor" : "Notary";

  async function load() {
    setLoading(true);
    const { data } = await (supabase as any).from(archiveTable).select("*").order("name");
    setRows(data || []);
    setLoading(false);
  }
  useEffect(() => { if (open) load(); }, [open]);

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      r.name?.toLowerCase().includes(q) ||
      r.email?.toLowerCase().includes(q) ||
      r.phone?.toLowerCase().includes(q) ||
      r.brokerage?.toLowerCase().includes(q) ||
      (r.markets || []).some((m: string) => m.toLowerCase().includes(q))
    );
  });

  async function copyToPersonal(r: any) {
    if (!user) return;
    const payload: any = {
      user_id: user.id,
      name: r.name,
      first_name: r.first_name,
      last_name: r.last_name,
      email: r.email,
      phone: r.phone,
      markets: r.markets || [],
      notes: r.notes,
    };
    if (kind === "realtors") {
      payload.brokerage = r.brokerage;
      payload.does_novations = !!r.does_novations;
    }
    const { error } = await (supabase as any).from(personalTable).insert(withLocation(payload));
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: `Added ${r.name}` });
    onAdded();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Library className="h-4 w-4" /> Archive {label}s</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="data-table w-full text-sm">
            <thead>
              <tr>
                <th>Name</th>
                {kind === "realtors" && <th>Brokerage</th>}
                {kind === "realtors" && <th>Novations</th>}
                <th>Markets</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">No matches.</td></tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium">
                      {r.name}
                      <div className="text-xs text-muted-foreground">{r.email || r.phone || "—"}</div>
                    </td>
                    {kind === "realtors" && <td>{r.brokerage || "—"}</td>}
                    {kind === "realtors" && <td>{r.does_novations ? <Badge variant="outline">Yes</Badge> : "—"}</td>}
                    <td className="text-muted-foreground">
                      {(r.markets || []).slice(0, 3).join(", ") || "—"}
                      {(r.markets || []).length > 3 && ` +${r.markets.length - 3}`}
                    </td>
                    <td>
                      <Button size="sm" variant="outline" onClick={() => copyToPersonal(r)}>
                        <Plus className="h-3 w-3 mr-1" /> Add
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
