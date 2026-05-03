import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
  const [jvPartners, setJvPartners] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    property_address: "", status: "lead", asking_price: "", arv: "", assignment_fee: "",
    ip_expiry_date: "", closing_date: "", lead_source: "", jv_partner_id: "", notes: "",
  });

  useEffect(() => {
    if (!user || !open) return;
    supabase.from("jv_partners").select("id, name").eq("user_id", user.id).then(({ data }) => setJvPartners(data || []));
  }, [user, open]);

  function set<K extends keyof typeof form>(k: K, v: any) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const { data, error } = await supabase.from("deals").insert({
      user_id: user.id,
      property_address: form.property_address,
      status: form.status as any,
      asking_price: form.asking_price ? Number(form.asking_price) : null,
      arv: form.arv ? Number(form.arv) : null,
      assignment_fee: form.assignment_fee ? Number(form.assignment_fee) : null,
      ip_expiry_date: form.ip_expiry_date || null,
      closing_date: form.closing_date || null,
      lead_source: form.lead_source || null,
      jv_partner_id: form.jv_partner_id || null,
      notes: form.notes || null,
    }).select().single();

    if (error) { toast.error(error.message); setBusy(false); return; }

    // Auto checklist
    await supabase.from("deal_checklist").insert(
      DEFAULT_CHECKLIST.map((t, i) => ({ deal_id: data.id, item_text: t, sort_order: i }))
    );

    toast.success("Deal created with checklist");
    setBusy(false); onClose(); onCreated();
    setForm({ property_address: "", status: "lead", asking_price: "", arv: "", assignment_fee: "", ip_expiry_date: "", closing_date: "", lead_source: "", jv_partner_id: "", notes: "" });
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
              </SelectContent>
            </Select>
          </div>
          <div><Label>Lead Source</Label><Input value={form.lead_source} onChange={(e) => set("lead_source", e.target.value)} /></div>
          <div><Label>Asking Price</Label><Input type="number" value={form.asking_price} onChange={(e) => set("asking_price", e.target.value)} /></div>
          <div><Label>ARV</Label><Input type="number" value={form.arv} onChange={(e) => set("arv", e.target.value)} /></div>
          <div><Label>Assignment Fee</Label><Input type="number" value={form.assignment_fee} onChange={(e) => set("assignment_fee", e.target.value)} /></div>
          <div>
            <Label>JV Partner</Label>
            <Select value={form.jv_partner_id} onValueChange={(v) => set("jv_partner_id", v)}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                {jvPartners.length === 0 && <SelectItem value="none" disabled>No JV partners</SelectItem>}
                {jvPartners.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>IP Expiry</Label><Input type="date" value={form.ip_expiry_date} onChange={(e) => set("ip_expiry_date", e.target.value)} /></div>
          <div><Label>Closing Date</Label><Input type="date" value={form.closing_date} onChange={(e) => set("closing_date", e.target.value)} /></div>
          <div className="col-span-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy} className="bg-primary hover:bg-primary-hover">Create Deal</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
