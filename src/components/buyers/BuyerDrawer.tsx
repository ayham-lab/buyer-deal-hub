import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trash2, Clock } from "lucide-react";
import { MarketsInput } from "./MarketsInput";
import type { Buyer } from "@/pages/Buyers";

const PROPERTY_TYPES = ["SFH", "MFH 2-4", "MFH 5+", "Commercial", "Land", "Mobile"];
const BUYER_TYPES = ["Flipper", "Landlord", "Developer", "Section 8", "Hedge Fund", "Airbnb / Rooming House", "Padsplit", "Mobile Homes"];
const BUYER_STATUS = [
  { value: "not_vetted", label: "Not Vetted" },
  { value: "vetted", label: "Vetted" },
  { value: "repeat", label: "Repeat Buyer" },
  { value: "recurring", label: "Recurring Buyer" },
];

function Chips({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (o: string) => onChange(value.includes(o) ? value.filter((v) => v !== o) : [...value, o]);
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button type="button" key={o} onClick={() => toggle(o)}
          className={`px-3 py-1 rounded-full text-xs border transition ${value.includes(o) ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:border-primary/40"}`}>
          {o}
        </button>
      ))}
    </div>
  );
}

export function BuyerDrawer({ buyer, onClose, onUpdated }: { buyer: Buyer | null; onClose: () => void; onUpdated: () => void }) {
  const [form, setForm] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!buyer) { setForm(null); return; }
    setForm({
      first_name: buyer.first_name || "",
      last_name: buyer.last_name || "",
      email: buyer.email || "",
      phone: buyer.phone || "",
      company_name: buyer.company_name || "",
      buyer_status: buyer.buyer_status || "not_vetted",
      markets: buyer.markets || [],
      property_types: buyer.property_types || [],
      buyer_types: buyer.buyer_types || [],
      price_min: buyer.price_min ?? "",
      price_max: buyer.price_max ?? "",
      source: buyer.source || "",
      criteria_notes: buyer.criteria_notes || "",
    });
  }, [buyer]);

  if (!buyer || !form) return null;

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  async function save() {
    setBusy(true);
    const name = `${form.first_name} ${form.last_name}`.trim() || buyer!.name;
    const { error } = await supabase
      .from("buyers")
      .update({
        name,
        first_name: form.first_name || null,
        last_name: form.last_name || null,
        email: form.email || null,
        phone: form.phone || null,
        company_name: form.company_name || null,
        buyer_status: form.buyer_status,
        markets: form.markets,
        property_types: form.property_types,
        buyer_types: form.buyer_types,
        price_min: form.price_min === "" || form.price_min === null ? null : Number(form.price_min),
        price_max: form.price_max === "" || form.price_max === null ? null : Number(form.price_max),
        source: form.source || null,
        criteria_notes: form.criteria_notes || null,
      })
      .eq("id", buyer!.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Buyer updated");
    onUpdated();
    onClose();
  }

  async function logContact() {
    const { error } = await supabase.from("buyers").update({ last_contact_at: new Date().toISOString() }).eq("id", buyer!.id);
    if (error) toast.error(error.message);
    else { toast.success("Contact logged"); onUpdated(); }
  }

  async function archive() {
    if (!confirm("Archive this buyer?")) return;
    const { error } = await supabase.from("buyers").update({ is_archived: true }).eq("id", buyer!.id);
    if (error) toast.error(error.message);
    else { toast.success("Buyer archived"); onUpdated(); onClose(); }
  }

  return (
    <Sheet open={!!buyer} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="bg-card border-border w-[520px] sm:max-w-[520px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-xl">{buyer.name}</SheetTitle>
        </SheetHeader>

        <div className="space-y-5 mt-6">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>First Name</Label><Input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} /></div>
            <div><Label>Last Name</Label><Input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
            <div className="col-span-2"><Label>Company</Label><Input value={form.company_name} onChange={(e) => set("company_name", e.target.value)} /></div>
          </div>

          <div>
            <Label>Buyer Status</Label>
            <Select value={form.buyer_status} onValueChange={(v) => set("buyer_status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BUYER_STATUS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Markets</Label>
            <MarketsInput value={form.markets} onChange={(v) => set("markets", v)} />
          </div>

          <div className="space-y-2">
            <Label>Property Types</Label>
            <Chips options={PROPERTY_TYPES} value={form.property_types} onChange={(v) => set("property_types", v)} />
          </div>

          <div className="space-y-2">
            <Label>Buyer Type</Label>
            <Chips options={BUYER_TYPES} value={form.buyer_types} onChange={(v) => set("buyer_types", v)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><Label>Price Min</Label><Input type="number" value={form.price_min} onChange={(e) => set("price_min", e.target.value)} /></div>
            <div><Label>Price Max</Label><Input type="number" value={form.price_max} onChange={(e) => set("price_max", e.target.value)} /></div>
          </div>

          <div><Label>Source</Label><Input value={form.source} onChange={(e) => set("source", e.target.value)} placeholder="REIA, Facebook, Referral" /></div>

          <div>
            <Label>Criteria Notes</Label>
            <Textarea value={form.criteria_notes} onChange={(e) => set("criteria_notes", e.target.value)} />
          </div>

          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <Clock className="h-3 w-3" />
            Last contact: {buyer.last_contact_at ? new Date(buyer.last_contact_at).toLocaleString() : "Never"}
          </div>

          <div className="flex gap-2 pt-4 border-t border-border">
            <Button onClick={save} disabled={busy} className="bg-primary hover:bg-primary-hover flex-1">
              {busy ? "Saving…" : "Save Changes"}
            </Button>
            <Button onClick={logContact} variant="outline">Log Contact</Button>
            <Button onClick={archive} variant="outline"><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
