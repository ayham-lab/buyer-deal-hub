import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const DEFAULT_CHECKLIST = [
  "Verify ARV",
  "Get property photos",
  "Send to buyer list",
  "Confirm EMD received",
  "Schedule walkthrough",
  "Execute assignment contract",
  "Confirm closing date with title",
];

export function AddDealModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    property_address: "", status: "lead",
    asking_price: "", contract_price: "", minimum_sale_price: "",
    arv: "",
    ip_expiry_date: "", closing_date: "", lead_source: "", jv_partner_name: "",
  });

  function set<K extends keyof typeof form>(k: K, v: any) { setForm((f) => ({ ...f, [k]: v })); }

  const contract = Number(form.contract_price) || 0;
  const minSale = Number(form.minimum_sale_price) || 0;
  const assignmentFee = minSale && contract ? Math.max(0, minSale - contract) : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const { data, error } = await supabase.from("deals").insert({
      user_id: user.id,
      property_address: form.property_address,
      status: form.status as any,
      asking_price: form.asking_price ? Number(form.asking_price) : null,
      contract_price: form.contract_price ? Number(form.contract_price) : null,
      minimum_sale_price: form.minimum_sale_price ? Number(form.minimum_sale_price) : null,
      assignment_fee: assignmentFee || null,
      arv: form.arv ? Number(form.arv) : null,
      ip_expiry_date: form.ip_expiry_date || null,
      closing_date: form.closing_date || null,
      lead_source: form.lead_source || null,
      jv_partner_name: form.jv_partner_name || null,
    } as any).select().single();

    if (error) { toast.error(error.message); setBusy(false); return; }

    await supabase.from("deal_checklist").insert(
      DEFAULT_CHECKLIST.map((t, i) => ({ deal_id: data.id, item_text: t, sort_order: i }))
    );

    toast.success("Deal created with checklist");
    setBusy(false); onClose(); onCreated();
    setForm({ property_address: "", status: "lead", asking_price: "", contract_price: "", minimum_sale_price: "", arv: "", ip_expiry_date: "", closing_date: "", lead_source: "", jv_partner_name: "" });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl bg-card border-border">
        <DialogHeader><DialogTitle>Add Deal</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><Label>Property Address *</Label><Input required value={form.property_address} onChange={(e) => set("property_address", e.target.value)} /></div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lead">Lead</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="under_contract">Under Contract</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="dead">Dead</SelectItem>
                <SelectItem value="title_issues">Title Issues</SelectItem>
                <SelectItem value="seller_issue">Seller Issue / Memorandum</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Lead Source</Label><Input value={form.lead_source} onChange={(e) => set("lead_source", e.target.value)} /></div>
          <div><Label>Asking Price</Label><Input type="number" value={form.asking_price} onChange={(e) => set("asking_price", e.target.value)} /></div>
          <div><Label>Contract Price</Label><Input type="number" value={form.contract_price} onChange={(e) => set("contract_price", e.target.value)} /></div>
          <div><Label>Minimum Sale Price</Label><Input type="number" value={form.minimum_sale_price} onChange={(e) => set("minimum_sale_price", e.target.value)} /></div>
          <div>
            <Label>Assignment Fee (auto)</Label>
            <Input type="number" value={assignmentFee || ""} readOnly className="bg-muted" />
          </div>
          <div><Label>ARV</Label><Input type="number" value={form.arv} onChange={(e) => set("arv", e.target.value)} /></div>
          <div><Label>JV Partner</Label><Input value={form.jv_partner_name} onChange={(e) => set("jv_partner_name", e.target.value)} placeholder="Partner name" /></div>
          <div><Label>IP Expiry</Label><Input type="date" value={form.ip_expiry_date} onChange={(e) => set("ip_expiry_date", e.target.value)} /></div>
          <div><Label>Closing Date</Label><Input type="date" value={form.closing_date} onChange={(e) => set("closing_date", e.target.value)} /></div>
          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy} className="bg-primary hover:bg-primary-hover">Create Deal</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
