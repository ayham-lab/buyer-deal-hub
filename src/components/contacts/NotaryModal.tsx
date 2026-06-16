import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { withLocation } from "@/lib/locationScope";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { MarketsInput } from "@/components/buyers/MarketsInput";

export interface NotaryRow {
  id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  markets: string[];
  notes: string | null;
}

const empty = {
  first_name: "", last_name: "", email: "", phone: "",
  markets: [] as string[], notes: "",
};

export function NotaryModal({
  open, onClose, onSaved, existing,
}: { open: boolean; onClose: () => void; onSaved: () => void; existing: NotaryRow | null }) {
  const { user } = useAuth();
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existing) {
      setForm({
        first_name: existing.first_name || "",
        last_name: existing.last_name || "",
        email: existing.email || "",
        phone: existing.phone || "",
        markets: existing.markets || [],
        notes: existing.notes || "",
      });
    } else {
      setForm(empty);
    }
  }, [existing, open]);

  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const name = `${form.first_name} ${form.last_name}`.trim() || form.email.trim();
    if (!name) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload: any = {
      user_id: user.id,
      name,
      first_name: form.first_name.trim() || null,
      last_name: form.last_name.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      markets: form.markets,
      notes: form.notes.trim() || null,
    };
    const { error } = existing
      ? await (supabase as any).from("notaries").update(payload).eq("id", existing.id)
      : await (supabase as any).from("notaries").insert(withLocation(payload));
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: existing ? "Updated" : "Added", description: name });
    onSaved();
    onClose();
  }

  async function remove() {
    if (!existing) return;
    if (!confirm(`Delete ${existing.name}?`)) return;
    const { error } = await (supabase as any).from("notaries").delete().eq("id", existing.id);
    if (error) return toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    toast({ title: "Deleted" });
    onSaved();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Notary" : "Add Notary"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="grid grid-cols-2 gap-4">
          <div>
            <Label>First Name</Label>
            <Input maxLength={80} value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
          </div>
          <div>
            <Label>Last Name</Label>
            <Input maxLength={80} value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" maxLength={255} value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input maxLength={40} value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>

          <MarketsInput value={form.markets} onChange={(v) => set("markets", v)} />

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
                {saving ? "Saving…" : existing ? "Save Changes" : "Add Notary"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
