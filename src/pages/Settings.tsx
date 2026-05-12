import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { useActiveLocation } from "@/contexts/LocationContext";
import TeamMembersTab from "@/pages/settings/TeamMembersTab";

export default function Settings() {
  const { isIframed } = useActiveLocation();
  const { isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const showProfile = !isIframed;
  const showGhl = !isIframed && isAdmin;
  const initialTab = params.get("tab") || (showProfile ? "profile" : "checklist");
  const [tab, setTab] = useState(initialTab);
  useEffect(() => {
    const t = params.get("tab");
    if (t && t !== tab) setTab(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  return (
    <AppLayout>
      <PageHeader title="Settings" subtitle="Manage your account and integrations" />
      <div className="p-6 lg:p-8 max-w-3xl">
        <Tabs value={tab} onValueChange={(v) => { setTab(v); setParams({ tab: v }, { replace: true }); }}>
          <TabsList>
            {showProfile && <TabsTrigger value="profile">Profile</TabsTrigger>}
            <TabsTrigger value="checklist">Checklist</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            {showGhl && <TabsTrigger value="ghl">GHL Connections</TabsTrigger>}
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
          </TabsList>
          {showProfile && <TabsContent value="profile"><ProfileTab /></TabsContent>}
          <TabsContent value="checklist"><ChecklistTab /></TabsContent>
          <TabsContent value="team"><TeamMembersTab /></TabsContent>
          {showGhl && <TabsContent value="ghl"><GhlTab /></TabsContent>}
          <TabsContent value="notifications"><NotificationsTab /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function ChecklistTab() {
  const { user } = useAuth();
  const [items, setItems] = useState<string[]>([]);
  const [newItem, setNewItem] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("default_checklist").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        setItems(((data as any)?.default_checklist as string[]) ?? []);
        setLoading(false);
      });
  }, [user]);

  async function persist(next: string[]) {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ default_checklist: next } as any).eq("user_id", user.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Saved");
  }

  function add() {
    const v = newItem.trim();
    if (!v) return;
    const next = [...items, v];
    setItems(next); setNewItem("");
    persist(next);
  }
  function remove(i: number) {
    const next = items.filter((_, idx) => idx !== i);
    setItems(next); persist(next);
  }
  function updateLocal(i: number, v: string) {
    setItems((arr) => arr.map((x, idx) => idx === i ? v : x));
  }

  if (loading) return <Loader2 className="h-4 w-4 animate-spin mt-6" />;

  return (
    <div className="space-y-4 mt-6">
      <p className="text-sm text-muted-foreground">
        These items are added to every new deal's checklist. Changes apply to future deals only.
      </p>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex gap-2">
            <Input value={item} onChange={(e) => updateLocal(i, e.target.value)} onBlur={() => persist(items)} />
            <Button variant="ghost" size="icon" onClick={() => remove(i)} disabled={busy}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex gap-2 pt-2 border-t">
        <Input placeholder="New checklist item" value={newItem} onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Button onClick={add} disabled={busy || !newItem.trim()}>Add</Button>
      </div>
    </div>
  );
}

function ProfileTab() {
  const { user, profile, refreshRoles } = useAuth();
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { setName(profile?.name ?? ""); }, [profile]);

  async function saveName() {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ name }).eq("user_id", user.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Saved"); refreshRoles(); }
  }
  async function changePassword() {
    if (pw.length < 6) { toast.error("Password too short"); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Password updated"); setPw(""); }
  }

  return (
    <div className="space-y-6 mt-6">
      <div className="space-y-2">
        <Label>Email</Label>
        <Input value={user?.email ?? ""} disabled />
      </div>
      <div className="space-y-2">
        <Label>Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
        <Button onClick={saveName} disabled={busy}>Save</Button>
      </div>
      <div className="space-y-2 pt-4 border-t">
        <Label>New password</Label>
        <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <Button onClick={changePassword} disabled={busy}>Change password</Button>
      </div>
    </div>
  );
}

function GhlTab() {
  const [links, setLinks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    // SCOPE: this tab is admin-standalone only (gated above), so no location
    // header is sent. RLS still restricts via "GHLLinks: scoped owner select".
    const { data } = await supabase
      .from("ghl_location_links")
      .select("*")
      .order("linked_at", { ascending: false });
    setLinks(data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function disconnect(id: string) {
    const { error } = await supabase.from("ghl_location_links").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Disconnected"); load(); }
  }

  return (
    <div className="space-y-4 mt-6">
      <p className="text-sm text-muted-foreground">
        You can connect up to 10 GoHighLevel sub-accounts. To connect a new one, install the app on that
        sub-account from the GHL marketplace.
      </p>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : links.length === 0 ? (
        <div className="text-sm text-muted-foreground p-6 border border-dashed rounded-md">
          No GHL accounts linked yet.
        </div>
      ) : (
        <div className="border rounded-md divide-y">
          {links.map((l) => (
            <div key={l.id} className="p-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">{l.ghl_location_name ?? "GHL Location"}</div>
                <div className="text-xs text-muted-foreground font-mono">{l.ghl_location_id}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => disconnect(l.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationsTab() {
  const { user, profile } = useAuth();
  const [email, setEmail] = useState(true);
  const [inApp, setInApp] = useState(true);

  useEffect(() => {
    const p: any = profile;
    if (p?.notification_prefs) {
      setEmail(!!p.notification_prefs.email);
      setInApp(!!p.notification_prefs.in_app);
    }
  }, [profile]);

  async function save() {
    if (!user) return;
    const { error } = await supabase.from("profiles")
      .update({ notification_prefs: { email, in_app: inApp } as any })
      .eq("user_id", user.id);
    if (error) toast.error(error.message);
    else toast.success("Saved");
  }

  return (
    <div className="space-y-4 mt-6">
      <div className="flex items-center justify-between">
        <Label>Email notifications</Label>
        <Switch checked={email} onCheckedChange={setEmail} />
      </div>
      <div className="flex items-center justify-between">
        <Label>In-app notifications</Label>
        <Switch checked={inApp} onCheckedChange={setInApp} />
      </div>
      <Button onClick={save}>Save</Button>
    </div>
  );
}
