import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import { LocationSwitcherModal, type LocationOption } from "@/components/team/LocationSwitcherModal";

export default function Login() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [locOptions, setLocOptions] = useState<LocationOption[] | null>(null);

  // US phone helpers — strip to digits, validate 10, mask as (555) 555-5555
  const phoneDigits = phone.replace(/\D/g, "").slice(0, 10);
  const phoneValid = phoneDigits.length === 10;
  function formatPhoneMask(raw: string) {
    const d = raw.replace(/\D/g, "").slice(0, 10);
    if (d.length === 0) return "";
    if (d.length < 4) return `(${d}`;
    if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
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
      const sso = sessionStorage.getItem("ghl_sso");
      if (sso) {
        const parsed = JSON.parse(sso);
        (async () => {
          try {
            // 1. Update profile identity fields
            await supabase
              .from("profiles")
              .update({
                ghl_location_id: parsed.locationId,
                ghl_user_id: parsed.userId,
              })
              .eq("user_id", user.id);

            // 2. Determine workspace owner: first user from this location wins.
            const { data: existing } = await supabase
              .from("ghl_location_links")
              .select("workspace_owner_user_id")
              .eq("ghl_location_id", parsed.locationId)
              .limit(1)
              .maybeSingle();

            const ownerId = existing?.workspace_owner_user_id ?? user.id;

            // 3. Upsert this user's membership row.
            await supabase
              .from("ghl_location_links")
              .upsert(
                {
                  user_id: user.id,
                  workspace_owner_user_id: ownerId,
                  linked_by_user_id: user.id,
                  ghl_location_id: parsed.locationId,
                  ghl_location_name: parsed.locationName ?? null,
                  ghl_company_id: parsed.companyId ?? null,
                },
                { onConflict: "user_id,ghl_location_id" },
              );
          } catch (e) {
            console.error("ghl link upsert failed", e);
          } finally {
            sessionStorage.removeItem("ghl_sso");
          }
        })();
      }
      const pendingRaw = sessionStorage.getItem("ghl_marketplace_pending_install");
      if (pendingRaw) {
        try {
          const pending = JSON.parse(pendingRaw);
          if (pending?.locationId) {
            (async () => {
              try {
                await supabase
                  .from("ghl_location_links")
                  .upsert(
                    {
                      user_id: user.id,
                      workspace_owner_user_id: user.id,
                      linked_by_user_id: user.id,
                      ghl_location_id: pending.locationId,
                      ghl_company_id: pending.companyId ?? null,
                      ghl_location_name: null,
                    },
                    { onConflict: "user_id,ghl_location_id", ignoreDuplicates: true },
                  );
              } catch (e) {
                console.error("pending marketplace install link failed", e);
              } finally {
                sessionStorage.removeItem("ghl_marketplace_pending_install");
              }
            })();
          } else {
            sessionStorage.removeItem("ghl_marketplace_pending_install");
          }
        } catch {
          sessionStorage.removeItem("ghl_marketplace_pending_install");
        }
        nav("/dashboard", { replace: true });
        return;
      }
      const next = params.get("next");
      // If a deep-link target is requested (e.g. /accept-invite?token=…) honor it
      // without doing a membership pre-check; that page handles its own flow.
      if (next) {
        nav(decodeURIComponent(next), { replace: true });
        return;
      }
      // Otherwise: route by membership count.
      // 0 → /no-access, 1 → set active location and go home, >1 → show switcher.
      (async () => {
        const { data } = await supabase
          .from("location_memberships")
          .select("location_id, is_owner")
          .eq("user_id", user.id);
        const rows = data ?? [];
        if (rows.length === 0) {
          nav("/no-access", { replace: true });
          return;
        }
        if (rows.length === 1) {
          try {
            sessionStorage.setItem(
              "ghl_active_location",
              JSON.stringify({ locationId: rows[0].location_id, companyId: null }),
            );
          } catch {}
          nav("/buyers", { replace: true });
          return;
        }
        // Multi-location → show switcher.
        const ids = rows.map((r) => r.location_id);
        const { data: tokens } = await supabase
          .from("ghl_location_tokens")
          .select("ghl_location_id, location_name")
          .in("ghl_location_id", ids);
        const nameById = new Map((tokens ?? []).map((t: any) => [t.ghl_location_id, t.location_name]));
        setLocOptions(
          rows.map((r) => ({
            location_id: r.location_id,
            location_name: nameById.get(r.location_id) ?? null,
            is_owner: r.is_owner,
          })),
        );
      })();
    }
  }, [user, authLoading, nav, params]);

  function pickLocation(locationId: string) {
    try {
      sessionStorage.setItem("ghl_active_location", JSON.stringify({ locationId, companyId: null }));
    } catch {}
    setLocOptions(null);
    nav("/buyers", { replace: true });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "signup" && !phoneValid) {
      toast.error("Enter a valid 10-digit US phone number");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const canonicalPhone = `+1${phoneDigits}`;
        const { data: signUpData, error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: `${window.location.origin}/buyers`,
            data: { name, phone_number: canonicalPhone },
          },
        });
        if (error) throw error;
        // Persist phone on profile (handle_new_user trigger creates the row)
        const newUserId = signUpData.user?.id;
        if (newUserId) {
          await supabase
            .from("profiles")
            .update({ phone_number: canonicalPhone })
            .eq("user_id", newUserId);
        }
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
            {mode === "signup" && (
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  placeholder="(555) 555-5555"
                  value={formatPhoneMask(phone)}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  aria-invalid={phone.length > 0 && !phoneValid}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Required — used to contact you about your account.
                </p>
              </div>
            )}
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <Button
              type="submit"
              disabled={busy || (mode === "signup" && !phoneValid)}
              className="w-full bg-primary hover:bg-primary-hover"
            >
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
