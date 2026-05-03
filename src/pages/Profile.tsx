import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, User, Mail, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export default function Profile() {
  const { user, profile, isAdmin, refreshRoles } = useAuth();
  const [name, setName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (profile) setName(profile.name || "");
  }, [profile]);

  async function saveProfile() {
    if (!user) return;
    setSavingProfile(true);
    const { error } = await supabase.from("profiles").update({ name }).eq("user_id", user.id);
    setSavingProfile(false);
    if (error) toast.error(error.message);
    else { toast.success("Profile updated"); refreshRoles(); }
  }

  async function changeEmail() {
    if (!newEmail.trim()) return toast.error("Enter a new email");
    setSavingEmail(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    setSavingEmail(false);
    if (error) toast.error(error.message);
    else { toast.success("Confirmation sent. Check both your old and new email to confirm the change."); setNewEmail(""); }
  }

  async function changePassword() {
    if (newPassword.length < 8) return toast.error("Password must be at least 8 characters");
    if (newPassword !== confirmPassword) return toast.error("Passwords don't match");
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) toast.error(error.message);
    else { toast.success("Password updated"); setNewPassword(""); setConfirmPassword(""); }
  }

  return (
    <AppLayout>
      <PageHeader title="Profile & Account" subtitle="Manage your profile, email, and password" />
      <div className="p-6 lg:p-8 max-w-3xl">
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList>
            <TabsTrigger value="profile"><User className="h-3.5 w-3.5 mr-1.5" /> Profile</TabsTrigger>
            <TabsTrigger value="email"><Mail className="h-3.5 w-3.5 mr-1.5" /> Email</TabsTrigger>
            <TabsTrigger value="password"><Lock className="h-3.5 w-3.5 mr-1.5" /> Password</TabsTrigger>
          </TabsList>

          {/* PROFILE */}
          <TabsContent value="profile">
            <div className="bg-card border border-border rounded-xl p-6 space-y-5">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold">
                  {(name || profile?.email || "?").slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold truncate">{name || profile?.email}</div>
                    {isAdmin && (
                      <Badge className="bg-primary/15 text-primary border-primary/30">
                        <ShieldCheck className="h-3 w-3 mr-1" /> Admin
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{profile?.email}</div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Display name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <Field label="Subscription" value={
                  <Badge variant="outline" className="capitalize">{profile?.subscription_status}</Badge>
                } />
                <Field label="GHL Location" value={
                  <span className="font-mono text-xs">{profile?.ghl_location_id || "—"}</span>
                } />
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={saveProfile} disabled={savingProfile}>
                  {savingProfile && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Save changes
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* EMAIL */}
          <TabsContent value="email">
            <div className="bg-card border border-border rounded-xl p-6 space-y-5">
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Current email</Label>
                <div className="font-medium mt-1">{profile?.email}</div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="newEmail">New email address</Label>
                <Input id="newEmail" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="new@email.com" />
                <p className="text-xs text-muted-foreground">
                  We'll send a confirmation link to both your current and new email. The change applies after both are confirmed.
                </p>
              </div>

              <div className="flex justify-end">
                <Button onClick={changeEmail} disabled={savingEmail || !newEmail.trim()}>
                  {savingEmail && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Send confirmation
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* PASSWORD */}
          <TabsContent value="password">
            <div className="bg-card border border-border rounded-xl p-6 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="newPw">New password</Label>
                <Input id="newPw" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPw">Confirm new password</Label>
                <Input id="confirmPw" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter new password" />
              </div>
              <p className="text-xs text-muted-foreground">
                Use at least 8 characters. You'll stay signed in after changing your password.
              </p>
              <div className="flex justify-end">
                <Button onClick={changePassword} disabled={savingPassword || !newPassword || !confirmPassword}>
                  {savingPassword && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Update password
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="mt-1">{value}</div>
    </div>
  );
}
