import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";

export default function Login() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [ssoBusy, setSsoBusy] = useState(false);

  // GHL SSO flow
  useEffect(() => {
    const sso = params.get("sso");
    if (!sso) return;
    setSsoBusy(true);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("decrypt-ghl-sso", {
          body: { sso },
        });
        if (error || !data || data.error) {
          toast.error("GHL SSO failed", { description: data?.error || error?.message });
          setSsoBusy(false);
          return;
        }
        toast.success("GHL identity verified", {
          description: `Location ${data.locationId}. Sign in or create an account to link.`,
        });
        if (data.email) setEmail(data.email);
        // Persist for linking on next signup/login
        sessionStorage.setItem("ghl_sso", JSON.stringify(data));
        setSsoBusy(false);
      } catch (e: any) {
        toast.error("SSO error", { description: e.message });
        setSsoBusy(false);
      }
    })();
  }, [params]);

  useEffect(() => {
    if (!authLoading && user) {
      // Link GHL location if present
      const sso = sessionStorage.getItem("ghl_sso");
      if (sso) {
        const parsed = JSON.parse(sso);
        supabase
          .from("profiles")
          .update({ ghl_location_id: parsed.locationId, ghl_user_id: parsed.userId })
          .eq("user_id", user.id)
          .then(() => sessionStorage.removeItem("ghl_sso"));
      }
      const next = params.get("next");
      nav(next ? decodeURIComponent(next) : "/buyers", { replace: true });
    }
  }, [user, authLoading, nav, params]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: `${window.location.origin}/buyers`,
            data: { name },
          },
        });
        if (error) throw error;
        toast.success("Account created", { description: "Check your email to confirm." });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
            <ShieldCheck className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Dispo Tool</h1>
            <p className="text-xs text-muted-foreground">by AcquiredCRM</p>
          </div>
        </div>

        <div className="rounded-lg bg-card border border-border p-6">
          {ssoBusy && (
            <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Verifying GHL SSO…
            </div>
          )}
          <h2 className="text-lg font-semibold mb-1">
            {mode === "login" ? "Sign in" : "Create account"}
          </h2>
          <p className="text-sm text-muted-foreground mb-5">
            {mode === "login" ? "Welcome back to your dispo desk." : "Start managing buyers and deals."}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <Label htmlFor="name">Full name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <Button type="submit" disabled={busy} className="w-full bg-primary hover:bg-primary-hover">
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <div className="mt-4 flex items-center justify-between text-sm">
            <button
              onClick={() => setMode(mode === "login" ? "signup" : "login")}
              className="text-muted-foreground hover:text-foreground"
            >
              {mode === "login" ? "Need an account? Sign up" : "Already have an account? Sign in"}
            </button>
            {mode === "login" && (
              <button
                onClick={async () => {
                  if (!email) { toast.error("Enter your email first"); return; }
                  const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: `${window.location.origin}/reset-password`,
                  });
                  if (error) toast.error(error.message);
                  else toast.success("Reset link sent. Check your email.");
                }}
                className="text-primary hover:underline"
              >
                Forgot password?
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
