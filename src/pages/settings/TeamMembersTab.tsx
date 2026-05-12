import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useActiveLocation } from "@/contexts/LocationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface MemberRow {
  id: string;
  user_id: string;
  role: string;
  is_owner: boolean;
  joined_at: string;
  email?: string | null;
  name?: string | null;
}

interface InviteRow {
  id: string;
  email: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export default function TeamMembersTab() {
  const { user, isSuperAdmin } = useAuth();
  const { activeLocation } = useActiveLocation();
  const [locationId, setLocationId] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Resolve active location: iframe → from context, standalone → first owned location.
  useEffect(() => {
    (async () => {
      if (activeLocation?.locationId) {
        setLocationId(activeLocation.locationId);
        return;
      }
      if (!user) return;
      const { data } = await supabase
        .from("location_memberships")
        .select("location_id, is_owner")
        .eq("user_id", user.id)
        .order("is_owner", { ascending: false })
        .limit(1);
      if (data?.[0]) setLocationId(data[0].location_id);
    })();
  }, [user, activeLocation]);

  async function load() {
    if (!locationId || !user) return;
    setLoading(true);

    const { data: m } = await supabase
      .from("location_memberships")
      .select("id, user_id, role, is_owner, joined_at")
      .eq("location_id", locationId)
      .order("is_owner", { ascending: false });

    const list = (m ?? []) as MemberRow[];
    const userIds = list.map((x) => x.user_id);
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, email, name")
        .in("user_id", userIds);
      const byId = new Map((profs ?? []).map((p: any) => [p.user_id, p]));
      list.forEach((x) => {
        const p = byId.get(x.user_id);
        x.email = p?.email ?? null;
        x.name = p?.name ?? null;
      });
    }
    setMembers(list);
    const me = list.find((x) => x.user_id === user.id);
    setIsOwner(!!me?.is_owner);

    const { data: inv } = await supabase
      .from("pending_invites")
      .select("id, email, expires_at, accepted_at, created_at")
      .eq("location_id", locationId)
      .is("accepted_at", null)
      .order("created_at", { ascending: false });
    setInvites((inv ?? []) as InviteRow[]);

    setLoading(false);
  }
  useEffect(() => { load(); }, [locationId, user]);

  async function sendInvite() {
    if (!locationId || !inviteEmail.trim()) return;
    setBusy(true);
    setLastLink(null);
    const { data, error } = await supabase.functions.invoke("invite-team-member", {
      body: { location_id: locationId, email: inviteEmail.trim().toLowerCase() },
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Failed to send invite");
      return;
    }
    setLastLink((data as any).invite_url);
    setInviteEmail("");
    toast.success("Invite created. Copy the link below.");
    load();
  }

  async function copyLink() {
    if (!lastLink) return;
    await navigator.clipboard.writeText(lastLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function removeMember(m: MemberRow) {
    if (!confirm(`Remove ${m.email ?? "this member"} from the workspace?`)) return;
    const { error } = await supabase.from("location_memberships").delete().eq("id", m.id);
    if (error) toast.error(error.message);
    else { toast.success("Removed"); load(); }
  }

  async function revokeInvite(id: string) {
    const { error } = await supabase.from("pending_invites").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Invite revoked"); load(); }
  }

  if (!locationId) {
    return <p className="text-sm text-muted-foreground mt-6">No workspace selected.</p>;
  }
  if (loading) return <Loader2 className="h-4 w-4 animate-spin mt-6" />;

  return (
    <div className="space-y-6 mt-6">
      <div>
        <h3 className="text-sm font-semibold mb-2">Members ({members.length})</h3>
        <div className="border rounded-md divide-y">
          {members.map((m) => (
            <div key={m.id} className="p-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">
                  {m.name ?? m.email ?? m.user_id}
                  {m.is_owner && <Badge className="ml-2 bg-primary/15 text-primary border-0">Owner</Badge>}
                  {m.user_id === user?.id && <Badge variant="secondary" className="ml-2">You</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">{m.email}</div>
              </div>
              {isOwner && !m.is_owner && (
                <Button variant="ghost" size="sm" onClick={() => removeMember(m)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      {isOwner && (
        <div className="space-y-3 pt-4 border-t">
          <h3 className="text-sm font-semibold">Invite a teammate</h3>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="teammate@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
            <Button onClick={sendInvite} disabled={busy || !inviteEmail.trim()}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create invite
            </Button>
          </div>
          {lastLink && (
            <div className="rounded-md border bg-muted/50 p-3 space-y-2">
              <Label className="text-xs">Magic link — send this to your teammate</Label>
              <div className="flex gap-2">
                <Input readOnly value={lastLink} className="font-mono text-xs" />
                <Button variant="outline" size="sm" onClick={copyLink}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Expires in 7 days.</p>
            </div>
          )}

          {invites.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2 mt-4">Pending invites</h4>
              <div className="border rounded-md divide-y">
                {invites.map((i) => (
                  <div key={i.id} className="p-3 flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium">{i.email}</div>
                      <div className="text-xs text-muted-foreground">
                        Expires {new Date(i.expires_at).toLocaleDateString()}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => revokeInvite(i.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
