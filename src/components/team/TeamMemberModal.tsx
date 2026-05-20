import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { withLocation, getActiveLocationId } from "@/lib/locationScope";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Trash2, Copy, Check } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export const TEAM_ROLES = [
  { value: "dispo_manager", label: "Dispo Manager" },
  { value: "acquisitions_manager", label: "Acquisitions Manager" },
  { value: "va", label: "VA" },
  { value: "other", label: "Other" },
];

// Adds the iframe SSO header so edge functions can authenticate the GHL user
// without a Supabase session cookie. No-op in standalone.
function iframeHeaders(): Record<string, string> {
  try {
    const blob = sessionStorage.getItem("ghl_sso_blob");
    return blob ? { "x-ghl-sso": blob } : {};
  } catch {
    return {};
  }
}

export function TeamMemberModal({ open, onClose, member, onSaved }: { open: boolean; onClose: () => void; member: any | null; onSaved: () => void }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", role: "other", notes: "", is_active: true, invite: false });
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (member) setForm({ name: member.name || "", email: member.email || "", phone: member.phone || "", role: member.role || "other", notes: member.notes || "", is_active: member.is_active ?? true, invite: false });
    else setForm({ name: "", email: "", phone: "", role: "other", notes: "", is_active: true, invite: false });
    setInviteLink(null);
  }, [member, open]);

  const hasLogin = !!member?.linked_user_id;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (form.invite && !form.email.trim()) {
      toast.error("Email is required to invite a teammate to log in");
      return;
    }
    setBusy(true);
    const payload = { name: form.name, email: form.email || null, phone: form.phone || null, role: form.role, notes: form.notes || null, is_active: form.is_active };
    const res = member
      ? await supabase.from("team_members").update(payload).eq("id", member.id).select().single()
      : await supabase.from("team_members").insert(withLocation({ ...payload, user_id: user.id })).select().single();
    if (res.error) { setBusy(false); return toast.error(res.error.message); }

    // Optionally send a login invite (only on add or when member has no login yet)
    if (form.invite && !hasLogin) {
      const locationId = getActiveLocationId();
      if (!locationId) {
        toast.error("Cannot send invite — no active location");
      } else {
        const { data: inv, error: invErr } = await supabase.functions.invoke("invite-team-member", {
          body: { location_id: locationId, email: form.email.trim().toLowerCase() },
          headers: iframeHeaders(),
        });
        if (invErr || (inv as any)?.error) {
          toast.error((inv as any)?.error || invErr?.message || "Failed to send invite — roster row saved");
        } else {
          setInviteLink((inv as any).invite_url);
          toast.success("Invite created. Copy the link below.");
          setBusy(false);
          onSaved();
          return; // keep modal open so user can copy the link
        }
      }
    }

    setBusy(false);
    toast.success(member ? "Team member updated" : "Team member added");
    onSaved(); onClose();
  }

  async function copyLink() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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
            <Label>Role *</Label>
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
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <Label className="text-sm">Active</Label>
              <p className="text-xs text-muted-foreground">Inactive members are hidden from deal dropdowns.</p>
            </div>
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: !!v })} />
          </div>

          {!hasLogin && (
            <div className="flex items-start gap-2 rounded-md border border-border p-3">
              <Checkbox id="invite" checked={form.invite} onCheckedChange={(v) => setForm({ ...form, invite: !!v })} className="mt-0.5" />
              <div className="space-y-1">
                <Label htmlFor="invite" className="text-sm cursor-pointer">Invite to log in</Label>
                <p className="text-xs text-muted-foreground">Send a magic link so this teammate can sign into Dispo Tool. Email required.</p>
              </div>
            </div>
          )}
          {hasLogin && (
            <p className="text-xs text-muted-foreground">This member already has login access.</p>
          )}

          {inviteLink && (
            <div className="rounded-md border bg-muted/50 p-3 space-y-2">
              <Label className="text-xs">Magic link — send this to your teammate</Label>
              <div className="flex gap-2">
                <Input readOnly value={inviteLink} className="font-mono text-xs" />
                <Button type="button" variant="outline" size="sm" onClick={copyLink}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Expires in 7 days.</p>
              <Button type="button" variant="outline" size="sm" onClick={onClose}>Done</Button>
            </div>
          )}

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
