import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Trash2, X, Loader2, Pencil } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { DEAL_TYPE_LABELS, ENTITY_TYPE_LABELS, EntityType } from "@/pages/TitleCompanies";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];
const DEAL_TYPES = ["cash", "novation", "sub2", "owner_financing", "commercial"];

export interface ArchiveTitleCompany {
  id: string;
  name: string;
  entity_type: EntityType;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  service_states: string[];
  service_cities: string[];
  charges_file_fee: boolean;
  file_fee_amount: number | null;
  deal_types: string[];
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

const empty: Partial<ArchiveTitleCompany> = {
  name: "", entity_type: "title_company",
  contact_name: "", email: "", phone: "", address: "",
  service_states: [], service_cities: [],
  charges_file_fee: false, file_fee_amount: null,
  deal_types: [], notes: "", is_active: true,
};

export function ArchiveTitleCompaniesTab() {
  const [items, setItems] = useState<ArchiveTitleCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<"all" | EntityType>("all");
  const [editing, setEditing] = useState<ArchiveTitleCompany | "new" | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("archive_title_companies" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast({ title: "Failed to load", description: error.message, variant: "destructive" });
    setItems((data as any) || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = items.filter((t) => {
    const s = q.toLowerCase().trim();
    const matchQ = !s ||
      t.name.toLowerCase().includes(s) ||
      (t.contact_name || "").toLowerCase().includes(s) ||
      (t.email || "").toLowerCase().includes(s) ||
      (t.phone || "").includes(s);
    const matchState = stateFilter === "all" || t.service_states.includes(stateFilter);
    const matchType = typeFilter === "all" || (t.entity_type || "title_company") === typeFilter;
    return matchQ && matchState && matchType;
  });

  async function remove(id: string, name: string) {
    if (!confirm(`Delete ${name} from archive?`)) return;
    const { error } = await supabase.from("archive_title_companies" as any).delete().eq("id", id);
    if (error) return toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    toast({ title: "Deleted" });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="flex flex-1 gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search name, contact, email, phone…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={stateFilter} onValueChange={setStateFilter}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all">All states</SelectItem>
              {US_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setEditing("new")} className="bg-primary hover:bg-primary-hover">
          <Plus className="h-4 w-4 mr-1" /> Add Title Company
        </Button>
      </div>

      <div className="rounded-lg border border-border overflow-hidden bg-card">
        <table className="data-table w-full">
          <thead>
            <tr>
              <th>Name</th><th>Contact</th><th>States</th><th>Cities</th>
              <th>Deal Types</th><th>File Fee</th><th>Phone</th><th>Active</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="text-center py-6"><Loader2 className="inline h-4 w-4 animate-spin" /></td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-6 text-muted-foreground">No archive title companies yet.</td></tr>
            ) : filtered.map((t) => (
              <tr key={t.id}>
                <td className="font-medium">{t.name}</td>
                <td className="text-muted-foreground">{t.contact_name || "—"}</td>
                <td className="text-muted-foreground">{t.service_states.join(", ") || "—"}</td>
                <td className="text-muted-foreground">{t.service_cities.join(", ") || "—"}</td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {t.deal_types.length === 0 ? <span className="text-muted-foreground">—</span> :
                      t.deal_types.map((d) => <Badge key={d} variant="outline" className="text-[10px]">{DEAL_TYPE_LABELS[d] || d}</Badge>)}
                  </div>
                </td>
                <td className="text-muted-foreground">{t.charges_file_fee ? (t.file_fee_amount ? `$${Number(t.file_fee_amount).toLocaleString()}` : "Yes") : "No"}</td>
                <td className="text-muted-foreground">{t.phone || "—"}</td>
                <td>{t.is_active ? <Badge>Active</Badge> : <Badge variant="outline">Inactive</Badge>}</td>
                <td className="text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(t)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(t.id, t.name)} className="text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <EditModal
        open={!!editing}
        existing={editing === "new" ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />
    </div>
  );
}

function EditModal({ open, existing, onClose, onSaved }: {
  open: boolean; existing: ArchiveTitleCompany | null; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<any>(empty);
  const [stateInput, setStateInput] = useState("");
  const [cityInput, setCityInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existing) {
      setForm({
        ...existing,
        file_fee_amount: existing.file_fee_amount?.toString() || "",
        contact_name: existing.contact_name || "",
        email: existing.email || "",
        phone: existing.phone || "",
        address: existing.address || "",
        notes: existing.notes || "",
      });
    } else setForm(empty);
  }, [existing, open]);

  function set<K extends string>(k: K, v: any) { setForm((f: any) => ({ ...f, [k]: v })); }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name?.trim()) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      contact_name: form.contact_name?.trim() || null,
      email: form.email?.trim() || null,
      phone: form.phone?.trim() || null,
      address: form.address?.trim() || null,
      service_states: form.service_states || [],
      service_cities: form.service_cities || [],
      charges_file_fee: !!form.charges_file_fee,
      file_fee_amount: form.charges_file_fee && form.file_fee_amount ? Number(form.file_fee_amount) : null,
      deal_types: form.deal_types || [],
      notes: form.notes?.trim() || null,
      is_active: form.is_active !== false,
    };
    const { error } = existing
      ? await supabase.from("archive_title_companies" as any).update(payload).eq("id", existing.id)
      : await supabase.from("archive_title_companies" as any).insert(payload as any);
    setSaving(false);
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    toast({ title: existing ? "Updated" : "Added" });
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Archive Title Company" : "Add Archive Title Company"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><Label>Company Name *</Label>
            <Input required value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div><Label>Contact Name</Label><Input value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} /></div>
          <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
          <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
          <div><Label>Address</Label><Input value={form.address} onChange={(e) => set("address", e.target.value)} /></div>

          <div className="col-span-2 space-y-2">
            <Label>States Serviced</Label>
            <div className="flex gap-2">
              <Select value={stateInput} onValueChange={setStateInput}>
                <SelectTrigger className="w-32"><SelectValue placeholder="Pick" /></SelectTrigger>
                <SelectContent className="max-h-60">{US_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
              <Button type="button" size="sm" onClick={() => {
                if (stateInput && !form.service_states.includes(stateInput)) set("service_states", [...form.service_states, stateInput]);
                setStateInput("");
              }} className="bg-primary hover:bg-primary-hover"><Plus className="h-4 w-4 mr-1" />Add</Button>
            </div>
            {form.service_states?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {form.service_states.map((s: string) => (
                  <Badge key={s} variant="outline" className="gap-1 pl-2 pr-1 py-1">{s}
                    <button type="button" onClick={() => set("service_states", form.service_states.filter((x: string) => x !== s))}>
                      <X className="h-3 w-3" /></button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="col-span-2 space-y-2">
            <Label>Cities Serviced</Label>
            <div className="flex gap-2">
              <Input placeholder="e.g. Dallas, TX" value={cityInput} onChange={(e) => setCityInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault();
                  const v = cityInput.trim();
                  if (v && !form.service_cities.includes(v)) set("service_cities", [...form.service_cities, v]);
                  setCityInput("");
                } }} />
              <Button type="button" size="sm" onClick={() => {
                const v = cityInput.trim();
                if (v && !form.service_cities.includes(v)) set("service_cities", [...form.service_cities, v]);
                setCityInput("");
              }} className="bg-primary hover:bg-primary-hover"><Plus className="h-4 w-4 mr-1" />Add</Button>
            </div>
            {form.service_cities?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {form.service_cities.map((c: string) => (
                  <Badge key={c} variant="outline" className="gap-1 pl-2 pr-1 py-1">{c}
                    <button type="button" onClick={() => set("service_cities", form.service_cities.filter((x: string) => x !== c))}>
                      <X className="h-3 w-3" /></button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="col-span-2 space-y-2">
            <Label>Deal Types</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {DEAL_TYPES.map((dt) => (
                <label key={dt} className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded border border-border hover:bg-muted/40">
                  <Checkbox checked={form.deal_types?.includes(dt)} onCheckedChange={() => set("deal_types",
                    form.deal_types?.includes(dt) ? form.deal_types.filter((x: string) => x !== dt) : [...(form.deal_types || []), dt])} />
                  {DEAL_TYPE_LABELS[dt]}
                </label>
              ))}
            </div>
          </div>

          <div className="col-span-2 flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
            <Checkbox id="charges_file_fee2" checked={form.charges_file_fee} onCheckedChange={(v) => set("charges_file_fee", !!v)} />
            <Label htmlFor="charges_file_fee2" className="cursor-pointer">Charges a file fee</Label>
            {form.charges_file_fee && (
              <Input type="number" placeholder="Amount" className="w-40" value={form.file_fee_amount} onChange={(e) => set("file_fee_amount", e.target.value)} />
            )}
          </div>

          <div className="col-span-2 flex items-center gap-3">
            <Checkbox id="active_tc" checked={form.is_active !== false} onCheckedChange={(v) => set("is_active", !!v)} />
            <Label htmlFor="active_tc" className="cursor-pointer">Visible to users in archive browser</Label>
          </div>

          <div className="col-span-2"><Label>Notes</Label>
            <Textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>

          <DialogFooter className="col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary-hover">
              {saving ? "Saving…" : existing ? "Save Changes" : "Add to Archive"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
