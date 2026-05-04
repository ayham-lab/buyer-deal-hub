import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export const TEAM_ROLES = [
  { value: "dispo_manager", label: "Dispo Manager" },
  { value: "acquisitions_manager", label: "Acquisitions Manager" },
  { value: "va", label: "VA" },
  { value: "other", label: "Other" },
];

export function TeamMemberModal({ open, onClose, member, onSaved }: { open: boolean; onClose: () => void; member: any | null; onSaved: () => void }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", role: "other", notes: "" });

  useEffect(() => {
    if (member) setForm({ name: member.name || "", email: member.email || "", phone: member.phone || "", role: member.role || "other", notes: member.notes || "" });
    else setForm({ name: "", email: "", phone: "", role: "other", notes: "" });
  }, [member, open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const payload = { name: form.name, email: form.email || null, phone: form.phone || null, role: form.role, notes: form.notes || null };
    const { error } = member
      ? await supabase.from("team_members").update(payload).eq("id", member.id)
      : await supabase.from("team_members").insert({ ...payload, user_id: user.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(member ? "Team member updated" : "Team member added");
    onSaved(); onClose();
  }

  async function remove() {
    if (!member || !confirm("Delete this team member?")) return;
    const { error } = await supabase.from("team_members").delete().eq("id", member.id);
    if (error) return toast.error(error.message);
    toast.success("Removed"); onSaved(); onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader><DialogTitle>{member ? "Edit Team Member" : "Add Team Member"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div><Label>Name *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div>
            <Label>Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TEAM_ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} /></div>
          <div className="flex justify-between pt-2">
            {member ? <Button type="button" variant="outline" onClick={remove} className="text-destructive border-destructive/30"><Trash2 className="h-4 w-4 mr-1" />Delete</Button> : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={busy} className="bg-primary hover:bg-primary-hover">{member ? "Save" : "Add"}</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
