import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export function AddBuyerModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "", email: "", phone: "",
    markets: "", property_types: "", tags: "",
    price_min: "", price_max: "",
    source: "", criteria_notes: "",
    add_to_archive: false,
  });

  function set<K extends keyof typeof form>(k: K, v: any) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const payload = {
      user_id: user.id,
      name: form.name,
      email: form.email || null,
      phone: form.phone || null,
      markets: form.markets.split(",").map((s) => s.trim()).filter(Boolean),
      property_types: form.property_types.split(",").map((s) => s.trim()).filter(Boolean),
      tags: form.tags.split(",").map((s) => s.trim()).filter(Boolean),
      price_min: form.price_min ? Number(form.price_min) : null,
      price_max: form.price_max ? Number(form.price_max) : null,
      source: form.source || null,
      criteria_notes: form.criteria_notes || null,
    };
    const { error } = await supabase.from("buyers").insert(payload);
    if (error) {
      toast.error(error.message);
      setBusy(false);
      return;
    }
    if (form.add_to_archive) {
      await supabase.from("buyer_archive").insert({
        name: payload.name, email: payload.email, phone: payload.phone,
        markets: payload.markets, property_types: payload.property_types,
        price_min: payload.price_min, price_max: payload.price_max,
        source: payload.source, added_by_user_id: user.id,
      });
    }
    toast.success("Buyer added");
    setBusy(false);
    onClose();
    onCreated();
    setForm({ name: "", email: "", phone: "", markets: "", property_types: "", tags: "", price_min: "", price_max: "", source: "", criteria_notes: "", add_to_archive: false });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl bg-card border-border">
        <DialogHeader><DialogTitle>Add Buyer</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><Label>Name *</Label><Input required value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
          <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
          <div className="col-span-2"><Label>Markets (comma-separated)</Label><Input value={form.markets} onChange={(e) => set("markets", e.target.value)} placeholder="Atlanta, Dallas" /></div>
          <div className="col-span-2"><Label>Property Types (comma-separated)</Label><Input value={form.property_types} onChange={(e) => set("property_types", e.target.value)} placeholder="SFR, Multi, Land" /></div>
          <div><Label>Price Min</Label><Input type="number" value={form.price_min} onChange={(e) => set("price_min", e.target.value)} /></div>
          <div><Label>Price Max</Label><Input type="number" value={form.price_max} onChange={(e) => set("price_max", e.target.value)} /></div>
          <div className="col-span-2"><Label>Tags (comma-separated)</Label><Input value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="cash, hot, repeat" /></div>
          <div className="col-span-2"><Label>Source</Label><Input value={form.source} onChange={(e) => set("source", e.target.value)} placeholder="REIA, Facebook, Referral" /></div>
          <div className="col-span-2"><Label>Criteria Notes</Label><Textarea value={form.criteria_notes} onChange={(e) => set("criteria_notes", e.target.value)} /></div>
          <div className="col-span-2 flex items-center gap-2">
            <Checkbox id="archive" checked={form.add_to_archive} onCheckedChange={(v) => set("add_to_archive", !!v)} />
            <Label htmlFor="archive" className="cursor-pointer">Also add to system-wide buyer archive</Label>
          </div>
          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy} className="bg-primary hover:bg-primary-hover">Add Buyer</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
