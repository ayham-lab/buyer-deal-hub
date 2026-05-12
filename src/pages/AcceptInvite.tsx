import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

interface InviteInfo {
  location_id: string;
  location_name: string | null;
  email: string;
  invited_by_email: string | null;
  expired: boolean;
  accepted: boolean;
}

export default function AcceptInvite() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const token = params.get("token") ?? "";
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) { setError("Missing invite token."); setLoading(false); return; }
    // Defense-in-depth: stash so the global SIGNED_IN handler can recover
    // even if Supabase's confirm-email redirect drops the URL param.
    try {
      const stash: any = { token };
      if (user?.email) stash.email = user.email.toLowerCase();
      localStorage.setItem("pending_invite", JSON.stringify(stash));
    } catch {}
    (async () => {
      const { data, error } = await supabase.functions.invoke("lookup-invite", {
        body: { token },
      });
      if (error || (data as any)?.error) {
        setError((data as any)?.error || error?.message || "Invite not found.");
      } else {
        setInvite(data as InviteInfo);
      }
      setLoading(false);
    })();
  }, [token, user?.email]);

  async function accept() {
    if (!user || !token) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("accept-invite", {
      body: { token },
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Failed to accept");
      return;
    }
    const locId = (data as any).location_id as string;
    try {
      sessionStorage.setItem("ghl_active_location", JSON.stringify({ locationId: locId, companyId: null }));
      localStorage.removeItem("pending_invite");
    } catch {}
    toast.success("You're in!");
    nav("/", { replace: true });
  }

  // Auto-accept when signed-in user matches the invite email — covers both
  // "already signed in in another tab" and "just confirmed email and landed
  // back here with token still in URL".
  const autoFired = useRef(false);
  useEffect(() => {
    if (autoFired.current) return;
    if (!user || !invite || invite.expired || invite.accepted || busy) return;
    if ((user.email ?? "").toLowerCase() !== invite.email.toLowerCase()) return;
    autoFired.current = true;
    accept();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, invite]);

  if (loading || authLoading) {
    return <Centered><Loader2 className="h-5 w-5 animate-spin" /></Centered>;
  }
  if (error || !invite) {
    return <Centered><Card title="Invite invalid">{error ?? "Invite not found."}</Card></Centered>;
  }
  if (invite.expired) {
    return <Centered><Card title="Invite expired">Ask the team owner to send a new invite.</Card></Centered>;
  }
  if (invite.accepted) {
    return <Centered><Card title="Invite already used">If you're the recipient, just sign in.</Card></Centered>;
  }

  if (!user) {
    const next = encodeURIComponent(`/accept-invite?token=${token}`);
    return (
      <Centered>
        <Card title="You've been invited">
          <p className="text-sm text-muted-foreground mb-4">
            <strong>{invite.invited_by_email ?? "Your team"}</strong> invited <strong>{invite.email}</strong> to join
            {invite.location_name ? <> <strong>{invite.location_name}</strong></> : " their workspace"}.
          </p>
          <p className="text-sm mb-4">Sign in or create an account with <strong>{invite.email}</strong> to accept.</p>
          <Button className="w-full" onClick={() => nav(`/login?next=${next}`)}>Continue</Button>
        </Card>
      </Centered>
    );
  }

  const emailMatches = (user.email ?? "").toLowerCase() === invite.email.toLowerCase();
  return (
    <Centered>
      <Card title={emailMatches ? "Accept invite" : "Wrong account"}>
        {emailMatches ? (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              Join {invite.location_name ?? "this workspace"} as a team member.
            </p>
            <Button className="w-full" onClick={accept} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Accept invite
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              You're signed in as <strong>{user.email}</strong>, but this invite is for <strong>{invite.email}</strong>.
              Sign out and sign back in with the right email.
            </p>
            <Button variant="outline" className="w-full" onClick={async () => { await supabase.auth.signOut(); nav(`/login?next=${encodeURIComponent(`/accept-invite?token=${token}`)}`); }}>
              Sign out
            </Button>
          </>
        )}
      </Card>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
            <ShieldCheck className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold">Dispo Tool</h1>
        </div>
        {children}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-card border border-border p-6">
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      {children}
    </div>
  );
}
