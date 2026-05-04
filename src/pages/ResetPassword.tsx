import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";

export default function ResetPassword() {
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase puts the recovery session in the URL hash; the client picks it up automatically.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    // Also fall back to existing session if user lands here later
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords don't match");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated");
    await supabase.auth.signOut();
    nav("/login", { replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
            <ShieldCheck className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Reset password</h1>
        </div>
        <div className="rounded-lg bg-card border border-border p-6">
          {!ready ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Verifying reset link…
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="pw">New password</Label>
                <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              </div>
              <div>
                <Label htmlFor="cpw">Confirm password</Label>
                <Input id="cpw" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={6} />
              </div>
              <Button type="submit" disabled={busy} className="w-full bg-primary hover:bg-primary-hover">
                {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Update password
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
