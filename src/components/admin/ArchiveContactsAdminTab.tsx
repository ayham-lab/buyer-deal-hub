import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { MarketsInput } from "@/components/buyers/MarketsInput";

type Kind = "realtors" | "notaries";

export function ArchiveContactsAdminTab({ kind }: { kind: Kind }) {
  const table = kind === "realtors" ? "archive_realtors" : "archive_notaries";
  const label = kind === "realtors" ? "Realtor" : "Notary";
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<any | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await (supabase as any).from(table).select("*").order("created_at", { ascending: false });
    setRows(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return r.name?.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q) ||
      r.phone?.toLowerCase().includes(q) || r.brokerage?.toLowerCase().includes(q);
  });

  async function remove(id: string) {
    if (!confirm("Delete from archive?")) return;
    const { error } = await (supabase as any).from(table).delete().eq("id", id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Deleted" });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button onClick={() => setShowAdd(true)} className="bg-primary hover:bg-primary-hover">
          <Plus className="h-4 w-4 mr-1" /> Add to Archive
        </Button>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="data-table w-full">
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact</th>
              {kind === "realtors" && <th>Brokerage</th>}
              {kind === "realtors" && <th>Novations</th>}
              <th>Markets</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="text-center py-6 text-muted-foreground">Loading…</td></tr> :
              filtered.length === 0 ? <tr><td colSpan={6} className="text-center py-6 text-muted-foreground">No records.</td></tr> :
              filtered.map((r) => (
                <tr key={r.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setEditing(r)}>
                  <td className="font-medium">{r.name}</td>
                  <td className="text-muted-foreground text-xs">{r.email || "—"}<br />{r.phone || ""}</td>
                  {kind === "realtors" && <td>{r.brokerage || "—"}</td>}
                  {kind === "realtors" && <td>{r.does_novations ? <Badge variant="outline">Yes</Badge> : "—"}</td>}
                  <td className="text-muted-foreground text-xs">{(r.markets || []).slice(0, 3).join(", ") || "—"}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" onClick={() => remove(r.id)} className="text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <ArchiveEditor
        open={showAdd || !!editing}
        kind={kind}
        existing={editing}
        onClose={() => { setShowAdd(false); setEditing(null); }}
        onSaved={load}
      />
    </div>
  );
}

function ArchiveEditor({ open, onClose, onSaved, existing, kind }: {
  open: boolean; onClose: () => void; onSaved: () => void; existing: any | null; kind: Kind;
}) {
  const table = kind === "realtors" ? "archive_realtors" : "archive_notaries";
  const label = kind === "realtors" ? "Realtor" : "Notary";
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(existing ? { ...existing } : {
      name: "", first_name: "", last_name: "", email: "", phone: "",
      brokerage: "", does_novations: false, markets: [], notes: "",
    });
  }, [existing, open]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const name = (form.name || `${form.first_name || ""} ${form.last_name || ""}`).trim();
    if (!name) return toast({ title: "Name required", variant: "destructive" });
    setSaving(true);
    const payload: any = {
      name,
      first_name: form.first_name || null,
      last_name: form.last_name || null,
      email: form.email || null,
      phone: form.phone || null,
      markets: form.markets || [],
      notes: form.notes || null,
    };
    if (kind === "realtors") {
      payload.brokerage = form.brokerage || null;
      payload.does_novations = !!form.does_novations;
    }
    const { error } = existing
      ? await (supabase as any).from(table).update(payload).eq("id", existing.id)
      : await (supabase as any).from(table).insert(payload);
    setSaving(false);
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    toast({ title: existing ? "Updated" : "Added to archive" });
    onSaved(); onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{existing ? `Edit Archive ${label}` : `Add Archive ${label}`}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="grid grid-cols-2 gap-4">
          <div><Label>First Name</Label><Input value={form.first_name || ""} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></div>
          <div><Label>Last Name</Label><Input value={form.last_name || ""} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
          <div><Label>Email</Label><Input type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><Label>Phone</Label><Input value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          {kind === "realtors" && (
            <>
              <div className="col-span-2"><Label>Brokerage</Label><Input value={form.brokerage || ""} onChange={(e) => setForm({ ...form, brokerage: e.target.value })} /></div>
              <div className="col-span-2 flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
                <Checkbox id="arch_nov" checked={!!form.does_novations} onCheckedChange={(v) => setForm({ ...form, does_novations: !!v })} />
                <Label htmlFor="arch_nov" className="cursor-pointer">Does Novations</Label>
              </div>
            </>
          )}
          <MarketsInput value={form.markets || []} onChange={(v) => setForm({ ...form, markets: v })} />
          <div className="col-span-2"><Label>Notes</Label><Textarea rows={3} value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <DialogFooter className="col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary-hover">{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
