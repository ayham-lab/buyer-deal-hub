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

export default function TeamMembersTab() {
  const { user, isSuperAdmin } = useAuth();
  const { activeLocation, isIframed } = useActiveLocation();
  const [locationId, setLocationId] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Resolve active location: iframe → from SSO context, standalone → first owned.
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
      if (data?.[0]) { setLocationId(data[0].location_id); return; }
      if (isSuperAdmin) {
        const { data: t } = await supabase
          .from("ghl_location_tokens")
          .select("ghl_location_id")
          .limit(1);
        if (t?.[0]?.ghl_location_id) setLocationId(t[0].ghl_location_id);
      }
    })();
  }, [user, activeLocation, isSuperAdmin]);

  async function load() {
    if (!locationId) return;
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("team-admin", {
      body: { action: "list", location_id: locationId },
      headers: iframeHeaders(),
    });
    setLoading(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Failed to load team");
      return;
    }
    const d = data as any;
    setMembers((d.members ?? []) as MemberRow[]);
    setInvites((d.invites ?? []) as InviteRow[]);
    setIsOwner(!!d.viewer_is_owner);
    setViewerUserId(d.viewer_user_id ?? null);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [locationId]);

  async function sendInvite() {
    if (!locationId || !inviteEmail.trim()) return;
    setBusy(true);
    setLastLink(null);
    const { data, error } = await supabase.functions.invoke("invite-team-member", {
      body: { location_id: locationId, email: inviteEmail.trim().toLowerCase() },
      headers: iframeHeaders(),
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
    const { data, error } = await supabase.functions.invoke("team-admin", {
      body: { action: "remove_member", location_id: locationId, member_id: m.id },
      headers: iframeHeaders(),
    });
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Failed to remove");
    } else { toast.success("Removed"); load(); }
  }

  async function revokeInvite(id: string) {
    const { data, error } = await supabase.functions.invoke("team-admin", {
      body: { action: "revoke_invite", location_id: locationId, invite_id: id },
      headers: iframeHeaders(),
    });
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Failed to revoke");
    } else { toast.success("Invite revoked"); load(); }
  }

  if (!locationId) {
    return <p className="text-sm text-muted-foreground mt-6">Select a workspace to manage its team.</p>;
  }
  if (loading) return <Loader2 className="h-4 w-4 animate-spin mt-6" />;

  const meId = user?.id ?? viewerUserId;

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
                  {meId && m.user_id === meId && <Badge variant="secondary" className="ml-2">You</Badge>}
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
