import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);

  const client_id = params.get("client_id") ?? "";
  const redirect_uri = params.get("redirect_uri") ?? "";
  const scope = params.get("scope") ?? "read write";
  const state = params.get("state") ?? "";

  useEffect(() => {
    if (!loading && !user) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      nav(`/login?next=${next}`, { replace: true });
    }
  }, [user, loading, nav]);

  async function approve() {
    setBusy(true);
    try {
      const sso = sessionStorage.getItem("ghl_sso");
      const ghl_location_id = sso ? JSON.parse(sso).locationId : null;

      // Link the location if we have one
      if (ghl_location_id) {
        await supabase.functions.invoke("link-ghl-location", {
          body: { ghl_location_id, ghl_location_name: null },
        });
      }

      const { data, error } = await supabase.functions.invoke("oauth-issue-code", {
        body: { client_id, redirect_uri, scope, state, ghl_location_id },
      });
      if (error || !data?.redirect_to) {
        toast.error("Authorization failed", { description: error?.message });
        setBusy(false);
        return;
      }
      window.location.href = data.redirect_to;
    } catch (e: any) {
      toast.error(e.message);
      setBusy(false);
    }
  }

  function deny() {
    const url = new URL(redirect_uri);
    url.searchParams.set("error", "access_denied");
    if (state) url.searchParams.set("state", state);
    window.location.href = url.toString();
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-lg bg-card border border-border p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
            <ShieldCheck className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Authorize GoHighLevel</h1>
            <p className="text-xs text-muted-foreground">Connect your Dispo CRM account</p>
          </div>
        </div>

        <div className="text-sm text-muted-foreground mb-4">
          <strong className="text-foreground">GoHighLevel</strong> is requesting access to your Dispo CRM account
          ({user.email}). It will be able to:
        </div>
        <ul className="text-sm space-y-1 mb-6 list-disc pl-5 text-foreground">
          {scope.split(/\s+/).map((s) => (
            <li key={s}>
              {s === "read" ? "Read your CRM data" : s === "write" ? "Create and update CRM data" : s}
            </li>
          ))}
        </ul>

        <div className="flex gap-2">
          <Button variant="outline" onClick={deny} disabled={busy} className="flex-1">
            Deny
          </Button>
          <Button onClick={approve} disabled={busy} className="flex-1">
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Approve
          </Button>
        </div>
      </div>
    </div>
  );
}
