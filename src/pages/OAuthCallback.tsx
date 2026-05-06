import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

type TokenResp = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  locationId?: string;
  companyId?: string;
  userId?: string;
  userType?: string;
};

export default function OAuthCallback() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<string>("");
  const [resp, setResp] = useState<TokenResp | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);

  useEffect(() => {
    const code = params.get("code");
    if (!code) {
      setError("Missing authorization code in URL.");
      setStatus("error");
      return;
    }
    (async () => {
      try {
        const redirect_uri = window.location.origin + "/oauth/callback";
        const { data, error: invokeErr } = await supabase.functions.invoke(
          "oauth-marketplace-callback",
          { body: { code, redirect_uri } },
        );
        if (invokeErr || !data || (data as any).error) {
          setError((data as any)?.error || invokeErr?.message || "Token exchange failed");
          setStatus("error");
          return;
        }
        const token = data as TokenResp;
        setResp(token);

        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user;
        if (user && token.locationId) {
          const { error: upsertErr } = await supabase
            .from("ghl_location_links")
            .upsert(
              {
                user_id: user.id,
                workspace_owner_user_id: user.id,
                linked_by_user_id: user.id,
                ghl_location_id: token.locationId,
                ghl_company_id: token.companyId ?? null,
                ghl_location_name: null,
              },
              { onConflict: "user_id,ghl_location_id", ignoreDuplicates: true },
            );
          if (upsertErr) console.error("ghl_location_links upsert failed", upsertErr);
          setNeedsAuth(false);
        } else {
          sessionStorage.setItem(
            "ghl_marketplace_pending_install",
            JSON.stringify({
              locationId: token.locationId,
              companyId: token.companyId,
              access_token: token.access_token,
              refresh_token: token.refresh_token,
              userId: token.userId,
              expires_at: Date.now() + (token.expires_in ?? 0) * 1000,
            }),
          );
          setNeedsAuth(true);
        }
        setStatus("success");
      } catch (e: any) {
        setError(e?.message ?? "Unexpected error");
        setStatus("error");
      }
    })();
  }, [params]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="items-center space-y-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <AlertCircle className="h-10 w-10 text-red-600 dark:text-red-400" />
            </div>
            <CardTitle className="text-center text-2xl font-semibold">Install failed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm text-muted-foreground break-words">{error}</p>
            <Button onClick={() => nav("/login")} className="w-full" variant="outline">
              Back to sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const masked = resp?.access_token
    ? `${resp.access_token.slice(0, 8)}...`
    : "N/A";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center space-y-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
            <CheckCircle2 className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
          </div>
          <CardTitle className="text-center text-2xl font-semibold">Install successful</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2 rounded-lg bg-muted p-4 text-sm text-foreground break-all">
            <p>
              <span className="font-medium">Access token:</span> {masked}
            </p>
            <p>
              <span className="font-medium">Location ID:</span> {resp?.locationId || "N/A"}
            </p>
            <p>
              <span className="font-medium">Company ID:</span> {resp?.companyId || "N/A"}
            </p>
          </div>
          {needsAuth ? (
            <Button onClick={() => nav("/login")} className="w-full">
              Sign in to finish setup
            </Button>
          ) : (
            <Button onClick={() => nav("/dashboard")} className="w-full">
              Continue to Dispo Tool
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
