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
import { Loader2, Trash2, Infinity as InfinityIcon, ExternalLink } from "lucide-react";
import { useActiveLocation } from "@/contexts/LocationContext";
import TeamTab from "@/pages/settings/TeamTab";
import OperatorAccountTab from "@/pages/settings/OperatorAccountTab";
import PipelineStagesTab from "@/pages/settings/PipelineStagesTab";
import BuyerIntakeTab from "@/pages/settings/BuyerIntakeTab";

export default function Settings() {
  const { isIframed, activeLocation } = useActiveLocation();
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
            <TabsTrigger value="stages">Pipeline Stages</TabsTrigger>
            <TabsTrigger value="intake">Buyer Intake</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="operator">Operator Account</TabsTrigger>
            {isIframed && <TabsTrigger value="billing">Billing</TabsTrigger>}
            {isIframed && <TabsTrigger value="login">Standalone Login</TabsTrigger>}
            {showGhl && <TabsTrigger value="ghl">GHL Connections</TabsTrigger>}
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
          </TabsList>
          {showProfile && <TabsContent value="profile"><ProfileTab /></TabsContent>}
          <TabsContent value="checklist"><ChecklistTab /></TabsContent>
          <TabsContent value="stages"><PipelineStagesTab /></TabsContent>
          <TabsContent value="intake"><BuyerIntakeTab /></TabsContent>
          <TabsContent value="team"><TeamTab /></TabsContent>
          <TabsContent value="operator"><OperatorAccountTab /></TabsContent>
          {isIframed && <TabsContent value="billing"><BillingTab locationId={activeLocation?.locationId ?? null} /></TabsContent>}
          {isIframed && <TabsContent value="login"><StandaloneLoginTab /></TabsContent>}
          {showGhl && <TabsContent value="ghl"><GhlTab /></TabsContent>}
          <TabsContent value="notifications"><NotificationsTab /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

type ChecklistTplItem = { text: string; offset_minutes: number | null };

const OFFSET_PRESETS: { label: string; value: number | null }[] = [
  { label: "No due date", value: null },
  { label: "1 hour after", value: 60 },
  { label: "2 hours after", value: 120 },
  { label: "4 hours after", value: 240 },
  { label: "Same day", value: 60 * 8 },
  { label: "1 day after", value: 60 * 24 },
  { label: "2 days after", value: 60 * 24 * 2 },
  { label: "3 days after", value: 60 * 24 * 3 },
  { label: "1 week after", value: 60 * 24 * 7 },
  { label: "2 weeks after", value: 60 * 24 * 14 },
  { label: "30 days after", value: 60 * 24 * 30 },
];

function offsetLabel(v: number | null | undefined): string {
  if (v == null) return "No due date";
  const match = OFFSET_PRESETS.find((p) => p.value === v);
  return match ? match.label : `${v} min after`;
}

function ChecklistTab() {
  const { user } = useAuth();
  const [items, setItems] = useState<ChecklistTplItem[]>([]);
  const [newItem, setNewItem] = useState("");
  const [newOffset, setNewOffset] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("default_checklist_items, default_checklist")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        const raw = (data as any)?.default_checklist_items;
        if (Array.isArray(raw) && raw.length) {
          setItems(
            raw.map((r: any) => ({
              text: String(r?.text ?? ""),
              offset_minutes: r?.offset_minutes ?? null,
            }))
          );
        } else {
          const legacy = ((data as any)?.default_checklist as string[]) ?? [];
          setItems(legacy.map((t) => ({ text: t, offset_minutes: null })));
        }
        setLoading(false);
      });
  }, [user]);

  async function persist(next: ChecklistTplItem[]) {
    if (!user) return;
    setBusy(true);
    const clean = next
      .map((i) => ({ text: i.text.trim(), offset_minutes: i.offset_minutes }))
      .filter((i) => i.text.length > 0);
    const { error } = await supabase
      .from("profiles")
      .update({ default_checklist_items: clean as any } as any)
      .eq("user_id", user.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Saved");
  }

  function add() {
    const v = newItem.trim();
    if (!v) return;
    const next = [...items, { text: v, offset_minutes: newOffset }];
    setItems(next);
    setNewItem("");
    setNewOffset(null);
    persist(next);
  }
  function remove(i: number) {
    const next = items.filter((_, idx) => idx !== i);
    setItems(next);
    persist(next);
  }
  function updateText(i: number, v: string) {
    setItems((arr) => arr.map((x, idx) => (idx === i ? { ...x, text: v } : x)));
  }
  function updateOffset(i: number, v: number | null) {
    const next = items.map((x, idx) => (idx === i ? { ...x, offset_minutes: v } : x));
    setItems(next);
    persist(next);
  }

  if (loading) return <Loader2 className="h-4 w-4 animate-spin mt-6" />;

  return (
    <div className="space-y-4 mt-6">
      <p className="text-sm text-muted-foreground">
        These items are added to every new deal's checklist. Pick a due-date preset to auto-assign a due date relative to deal creation. Changes apply to future deals only.
      </p>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex gap-2 items-center">
            <Input
              className="flex-1"
              value={item.text}
              onChange={(e) => updateText(i, e.target.value)}
              onBlur={() => persist(items)}
            />
            <select
              className="h-9 rounded-md border border-border bg-background px-2 text-sm min-w-[160px]"
              value={item.offset_minutes ?? ""}
              onChange={(e) => updateOffset(i, e.target.value === "" ? null : Number(e.target.value))}
            >
              {OFFSET_PRESETS.map((p) => (
                <option key={String(p.value)} value={p.value ?? ""}>
                  {p.label}
                </option>
              ))}
            </select>
            <Button variant="ghost" size="icon" onClick={() => remove(i)} disabled={busy}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex gap-2 pt-2 border-t items-center">
        <Input
          className="flex-1"
          placeholder="New checklist item"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <select
          className="h-9 rounded-md border border-border bg-background px-2 text-sm min-w-[160px]"
          value={newOffset ?? ""}
          onChange={(e) => setNewOffset(e.target.value === "" ? null : Number(e.target.value))}
        >
          {OFFSET_PRESETS.map((p) => (
            <option key={String(p.value)} value={p.value ?? ""}>
              {p.label}
            </option>
          ))}
        </select>
        <Button onClick={add} disabled={busy || !newItem.trim()}>
          Add
        </Button>
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

function StandaloneLoginTab() {
  const { user } = useAuth();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  const loginUrl = `${window.location.origin}/login`;

  async function setPassword() {
    if (pw.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (pw !== pw2) { toast.error("Passwords do not match"); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Password set — you can now sign in at " + loginUrl);
    setPw(""); setPw2("");
  }

  return (
    <div className="space-y-6 mt-6 max-w-lg">
      <div className="border rounded-md p-4 space-y-2 bg-muted/30">
        <div className="text-sm font-semibold">Sign in outside of GoHighLevel</div>
        <p className="text-sm text-muted-foreground">
          Your account was created automatically the first time you opened this app inside GHL. To sign in
          on the standalone site (<a className="underline" href={loginUrl} target="_blank" rel="noreferrer">{loginUrl}</a>),
          set a password below. Your email stays the same.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Email</Label>
        <Input value={user?.email ?? ""} disabled />
      </div>
      <div className="space-y-2">
        <Label>New password</Label>
        <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" placeholder="At least 8 characters" />
      </div>
      <div className="space-y-2">
        <Label>Confirm password</Label>
        <Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
      </div>
      <Button onClick={setPassword} disabled={busy || !pw || !pw2}>
        {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Set password
      </Button>
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

function BillingTab({ locationId }: { locationId: string | null }) {
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [sub, setSub] = useState<any>(null);

  useEffect(() => {
    if (!locationId) { setLoading(false); return; }
    supabase
      .from("subscriptions")
      .select("subscription_status,current_period_end,stripe_customer_id,stripe_subscription_id")
      .eq("ghl_location_id", locationId)
      .maybeSingle()
      .then(({ data }) => { setSub(data); setLoading(false); });
  }, [locationId]);

  const isActive = sub?.subscription_status === "active" &&
    (!sub?.current_period_end || new Date(sub.current_period_end) > new Date());

  async function openPortal() {
    if (!locationId) return;
    setOpening(true);
    const { data, error } = await supabase.functions.invoke("create-billing-portal-session", {
      body: { ghl_location_id: locationId },
    });
    setOpening(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Could not open billing portal");
      return;
    }
    const url = (data as any)?.url;
    if (!url) return;
    let isIframed = false;
    try { isIframed = window.self !== window.top; } catch { isIframed = true; }
    if (isIframed) {
      const w = window.open(url, "_blank");
      if (!w) toast.error("Popup blocked — allow popups and try again");
    } else {
      window.location.href = url;
    }
  }

  if (loading) return <Loader2 className="h-4 w-4 animate-spin mt-6" />;

  return (
    <div className="space-y-4 mt-6">
      <div className="border rounded-md p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold flex items-center gap-2">
              {isActive ? (
                <>
                  <InfinityIcon className="h-4 w-4 text-primary" />
                  Unlimited subscription active
                </>
              ) : (
                "No active subscription"
              )}
            </div>
            {sub?.current_period_end && (
              <div className="text-xs text-muted-foreground mt-1">
                {isActive ? "Renews" : "Ended"} {new Date(sub.current_period_end).toLocaleDateString()}
              </div>
            )}
          </div>
        </div>
        {sub?.stripe_customer_id ? (
          <Button onClick={openPortal} disabled={opening} size="sm">
            {opening ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ExternalLink className="h-4 w-4 mr-2" />}
            Manage Subscription
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            Subscribe from the credits widget to manage billing here.
          </p>
        )}
      </div>
    </div>
  );
}
