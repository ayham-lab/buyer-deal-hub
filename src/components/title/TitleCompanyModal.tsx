import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { withLocation } from "@/lib/locationScope";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Plus, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { TitleCompany, DEAL_TYPE_LABELS } from "@/pages/TitleCompanies";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

const DEAL_TYPES = ["cash", "novation", "sub2", "owner_financing", "commercial"];

const empty = {
  name: "", contact_name: "", email: "", phone: "", address: "",
  service_states: [] as string[], service_cities: [] as string[],
  charges_file_fee: false, file_fee_amount: "",
  deal_types: [] as string[], notes: "",
};

export function TitleCompanyModal({
  open, onClose, onSaved, existing,
}: { open: boolean; onClose: () => void; onSaved: () => void; existing: TitleCompany | null }) {
  const { user } = useAuth();
  const [form, setForm] = useState(empty);
  const [stateInput, setStateInput] = useState("");
  const [cityInput, setCityInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existing) {
      setForm({
        name: existing.name,
        contact_name: existing.contact_name || "",
        email: existing.email || "",
        phone: existing.phone || "",
        address: existing.address || "",
        service_states: existing.service_states || [],
        service_cities: existing.service_cities || [],
        charges_file_fee: existing.charges_file_fee,
        file_fee_amount: existing.file_fee_amount?.toString() || "",
        deal_types: existing.deal_types || [],
        notes: existing.notes || "",
      });
    } else {
      setForm(empty);
    }
  }, [existing, open]);

  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function addState() {
    if (!stateInput) return;
    if (!form.service_states.includes(stateInput)) set("service_states", [...form.service_states, stateInput]);
    setStateInput("");
  }
  function addCity() {
    const v = cityInput.trim();
    if (!v) return;
    if (!form.service_cities.includes(v)) set("service_cities", [...form.service_cities, v]);
    setCityInput("");
  }
  function toggleDealType(dt: string) {
    set("deal_types", form.deal_types.includes(dt)
      ? form.deal_types.filter((x) => x !== dt)
      : [...form.deal_types, dt]);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !form.name.trim()) return;
    setSaving(true);
    const payload = {
      user_id: user.id,
      name: form.name.trim(),
      contact_name: form.contact_name.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      service_states: form.service_states,
      service_cities: form.service_cities,
      charges_file_fee: form.charges_file_fee,
      file_fee_amount: form.charges_file_fee && form.file_fee_amount ? Number(form.file_fee_amount) : null,
      deal_types: form.deal_types,
      notes: form.notes.trim() || null,
    };
    const { error } = existing
      ? await supabase.from("title_companies").update(payload).eq("id", existing.id)
      : await supabase.from("title_companies").insert(withLocation(payload as Record<string, unknown>) as any);
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: existing ? "Updated" : "Added", description: form.name });
    onSaved();
    onClose();
  }

  async function remove() {
    if (!existing) return;
    if (!confirm(`Delete ${existing.name}?`)) return;
    const { error } = await supabase.from("title_companies").delete().eq("id", existing.id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Deleted" });
    onSaved();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Title Company" : "Add Title Company"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label>Company Name *</Label>
            <Input required maxLength={120} value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <Label>Contact Name</Label>
            <Input maxLength={120} value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input maxLength={40} value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" maxLength={255} value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div>
            <Label>Address</Label>
            <Input maxLength={255} value={form.address} onChange={(e) => set("address", e.target.value)} />
          </div>

          <div className="col-span-2 space-y-2">
            <Label>States Serviced</Label>
            <div className="flex gap-2">
              <Select value={stateInput} onValueChange={setStateInput}>
                <SelectTrigger className="w-32"><SelectValue placeholder="Pick" /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {US_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button type="button" size="sm" onClick={addState} className="bg-primary hover:bg-primary-hover">
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
            {form.service_states.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {form.service_states.map((s) => (
                  <Badge key={s} variant="outline" className="gap-1 pl-2 pr-1 py-1">
                    {s}
                    <button type="button" onClick={() => set("service_states", form.service_states.filter((x) => x !== s))}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="col-span-2 space-y-2">
            <Label>Cities Serviced</Label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. Dallas, TX"
                maxLength={120}
                value={cityInput}
                onChange={(e) => setCityInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCity(); } }}
              />
              <Button type="button" size="sm" onClick={addCity} className="bg-primary hover:bg-primary-hover">
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
            {form.service_cities.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {form.service_cities.map((c) => (
                  <Badge key={c} variant="outline" className="gap-1 pl-2 pr-1 py-1">
                    {c}
                    <button type="button" onClick={() => set("service_cities", form.service_cities.filter((x) => x !== c))}>
                      <X className="h-3 w-3" />
                    </button>
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
                  <Checkbox checked={form.deal_types.includes(dt)} onCheckedChange={() => toggleDealType(dt)} />
                  {DEAL_TYPE_LABELS[dt]}
                </label>
              ))}
            </div>
          </div>

          <div className="col-span-2 flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
            <Checkbox
              id="charges_file_fee"
              checked={form.charges_file_fee}
              onCheckedChange={(v) => set("charges_file_fee", !!v)}
            />
            <Label htmlFor="charges_file_fee" className="cursor-pointer">Charges a file fee</Label>
            {form.charges_file_fee && (
              <Input
                type="number"
                placeholder="Amount"
                className="w-40"
                value={form.file_fee_amount}
                onChange={(e) => set("file_fee_amount", e.target.value)}
              />
            )}
          </div>

          <div className="col-span-2">
            <Label>Notes</Label>
            <Textarea rows={3} maxLength={2000} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>

          <DialogFooter className="col-span-2 flex justify-between">
            <div>
              {existing && (
                <Button type="button" variant="ghost" onClick={remove} className="text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4 mr-1" /> Delete
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary-hover">
                {saving ? "Saving…" : existing ? "Save Changes" : "Add Title Company"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
