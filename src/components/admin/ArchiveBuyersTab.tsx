// Super-admin only (standalone) CRUD over the global archive_buyers table.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Trash2, Save, X } from "lucide-react";
import { toast } from "sonner";

interface Row {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  state: string | null;
  preferred_markets: string[];
  price_min: number | null;
  price_max: number | null;
  property_types: string[];
  phone: string | null;
  email: string | null;
  notes: string | null;
  is_active: boolean;
}

const empty: Partial<Row> = {
  full_name: "", first_name: "", last_name: "", city: "", state: "",
  preferred_markets: [], price_min: null, price_max: null,
  property_types: [], phone: "", email: "", notes: "", is_active: true,
};

function arr(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

export function ArchiveBuyersTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Partial<Row>>({ ...empty });
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Row>>({});

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("archive_buyers")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data as any) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  async function add() {
    const payload = {
      ...draft,
      preferred_markets: draft.preferred_markets ?? [],
      property_types: draft.property_types ?? [],
    };
    const { error } = await supabase.from("archive_buyers").insert(payload as any);
    if (error) return toast.error(error.message);
    toast.success("Buyer added");
    setDraft({ ...empty });
    load();
  }

  async function save(id: string) {
    const { error } = await supabase
      .from("archive_buyers")
      .update(editDraft as any)
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    setEditId(null);
    setEditDraft({});
    load();
  }

  async function toggleActive(r: Row) {
    const { error } = await supabase
      .from("archive_buyers")
      .update({ is_active: !r.is_active })
      .eq("id", r.id);
    if (error) return toast.error(error.message);
    load();
  }

  async function del(id: string) {
    if (!confirm("Delete this archive buyer?")) return;
    const { error } = await supabase.from("archive_buyers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  }

  return (
    <div className="space-y-6">
      {/* Add form */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <div className="text-sm font-semibold flex items-center gap-2">
          <Plus className="h-4 w-4" /> Add archive buyer
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Input placeholder="First name" value={draft.first_name || ""} onChange={(e) => setDraft({ ...draft, first_name: e.target.value })} />
          <Input placeholder="Last name" value={draft.last_name || ""} onChange={(e) => setDraft({ ...draft, last_name: e.target.value })} />
          <Input placeholder="Full name (optional)" value={draft.full_name || ""} onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} />
          <Input placeholder="Email" value={draft.email || ""} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
          <Input placeholder="Phone" value={draft.phone || ""} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
          <Input placeholder="City" value={draft.city || ""} onChange={(e) => setDraft({ ...draft, city: e.target.value })} />
          <Input placeholder="State" value={draft.state || ""} onChange={(e) => setDraft({ ...draft, state: e.target.value })} />
          <Input placeholder="Markets (comma-sep)" onChange={(e) => setDraft({ ...draft, preferred_markets: arr(e.target.value) })} />
          <Input placeholder="Property types (comma-sep)" onChange={(e) => setDraft({ ...draft, property_types: arr(e.target.value) })} />
          <Input placeholder="Min price" type="number" value={draft.price_min ?? ""} onChange={(e) => setDraft({ ...draft, price_min: e.target.value ? Number(e.target.value) : null })} />
          <Input placeholder="Max price" type="number" value={draft.price_max ?? ""} onChange={(e) => setDraft({ ...draft, price_max: e.target.value ? Number(e.target.value) : null })} />
          <Input placeholder="Notes" value={draft.notes || ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={add}>Add buyer</Button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>Name</th><th>Location</th><th>Markets</th><th>Price</th>
                <th>Email / Phone</th><th>Active</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isEdit = editId === r.id;
                const ed = isEdit ? editDraft : r;
                return (
                  <tr key={r.id}>
                    <td>
                      {isEdit ? (
                        <div className="flex flex-col gap-1">
                          <Input className="h-7" placeholder="First" value={ed.first_name || ""} onChange={(e) => setEditDraft({ ...editDraft, first_name: e.target.value })} />
                          <Input className="h-7" placeholder="Last" value={ed.last_name || ""} onChange={(e) => setEditDraft({ ...editDraft, last_name: e.target.value })} />
                        </div>
                      ) : (
                        <span className="font-medium">
                          {r.full_name || [r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}
                        </span>
                      )}
                    </td>
                    <td className="text-xs">
                      {isEdit ? (
                        <div className="flex gap-1">
                          <Input className="h-7 w-24" placeholder="City" value={ed.city || ""} onChange={(e) => setEditDraft({ ...editDraft, city: e.target.value })} />
                          <Input className="h-7 w-12" placeholder="ST" value={ed.state || ""} onChange={(e) => setEditDraft({ ...editDraft, state: e.target.value })} />
                        </div>
                      ) : (
                        <>{[r.city, r.state].filter(Boolean).join(", ") || "—"}</>
                      )}
                    </td>
                    <td className="text-xs max-w-[180px]">
                      {isEdit ? (
                        <Input className="h-7" placeholder="comma-sep" defaultValue={(r.preferred_markets || []).join(", ")} onChange={(e) => setEditDraft({ ...editDraft, preferred_markets: arr(e.target.value) })} />
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {(r.preferred_markets || []).slice(0, 3).map((m) => <Badge key={m} variant="secondary" className="text-[10px]">{m}</Badge>)}
                          {r.preferred_markets.length > 3 && <Badge variant="outline" className="text-[10px]">+{r.preferred_markets.length - 3}</Badge>}
                        </div>
                      )}
                    </td>
                    <td className="text-xs">
                      {isEdit ? (
                        <div className="flex gap-1">
                          <Input className="h-7 w-20" type="number" placeholder="min" defaultValue={r.price_min ?? ""} onChange={(e) => setEditDraft({ ...editDraft, price_min: e.target.value ? Number(e.target.value) : null })} />
                          <Input className="h-7 w-20" type="number" placeholder="max" defaultValue={r.price_max ?? ""} onChange={(e) => setEditDraft({ ...editDraft, price_max: e.target.value ? Number(e.target.value) : null })} />
                        </div>
                      ) : (
                        <>{r.price_min || "—"} – {r.price_max || "—"}</>
                      )}
                    </td>
                    <td className="text-xs">
                      {isEdit ? (
                        <div className="flex flex-col gap-1">
                          <Input className="h-7" placeholder="email" value={ed.email || ""} onChange={(e) => setEditDraft({ ...editDraft, email: e.target.value })} />
                          <Input className="h-7" placeholder="phone" value={ed.phone || ""} onChange={(e) => setEditDraft({ ...editDraft, phone: e.target.value })} />
                        </div>
                      ) : (
                        <div className="text-muted-foreground">
                          <div>{r.email || "—"}</div>
                          <div>{r.phone || "—"}</div>
                        </div>
                      )}
                    </td>
                    <td>
                      <Switch checked={r.is_active} onCheckedChange={() => toggleActive(r)} />
                    </td>
                    <td className="text-right">
                      {isEdit ? (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" onClick={() => save(r.id)}><Save className="h-3 w-3" /></Button>
                          <Button size="sm" variant="outline" onClick={() => { setEditId(null); setEditDraft({}); }}><X className="h-3 w-3" /></Button>
                        </div>
                      ) : (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="outline" onClick={() => { setEditId(r.id); setEditDraft({ ...r }); }}>Edit</Button>
                          <Button size="sm" variant="outline" onClick={() => del(r.id)}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="text-center py-6 text-muted-foreground">No archive buyers yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
