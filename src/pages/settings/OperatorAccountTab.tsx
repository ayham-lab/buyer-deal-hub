// Operator Account tab in Settings.
// Lets a location owner group multiple GHL sub-accounts they own so the
// app surfaces aggregate data + unified billing across all of them.
//
// IDENTITY: When rendered inside the GHL iframe, supabase.auth may resolve
// to whoever is signed in standalone in the same browser (e.g. an admin
// debugging another tenant). To prevent that, all reads + writes here go
// through the `operator-account` edge function which resolves the caller
// via the iframe SSO blob (x-ghl-sso) before doing anything.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveLocation, refreshEffectiveLocations } from "@/contexts/LocationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Layers, Plus, Minus } from "lucide-react";
import { toast } from "sonner";

interface OwnedLoc {
  location_id: string;
  name: string | null;
  operator_account_id: string | null;
}

interface OperatorAccount {
  id: string;
  name: string;
  subscription_status: string | null;
  current_period_end: string | null;
  credit_balance: number;
}

function iframeHeaders(): Record<string, string> {
  try {
    const blob = sessionStorage.getItem("ghl_sso_blob");
    return blob ? { "x-ghl-sso": blob } : {};
  } catch {
    return {};
  }
}

function displayName(l: { name: string | null; location_id: string }): string {
  return (l.name && l.name.trim()) || "Unnamed location";
}

export default function OperatorAccountTab() {
  const { activeLocation } = useActiveLocation();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [owned, setOwned] = useState<OwnedLoc[]>([]);
  const [op, setOp] = useState<OperatorAccount | null>(null);
  const [opLocations, setOpLocations] = useState<OwnedLoc[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [groupName, setGroupName] = useState("");
  const [viewerEmail, setViewerEmail] = useState<string>("");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("operator-account", {
      body: { action: "list" },
      headers: iframeHeaders(),
    });
    if (error || (data as any)?.error) {
      setLoading(false);
      toast.error((data as any)?.error || error?.message || "Failed to load operator account");
      return;
    }
    const d = data as any;
    const ownedList: OwnedLoc[] = d.owned ?? [];
    setOwned(ownedList);
    setOp(d.op ?? null);
    setOpLocations(d.op_locations ?? []);

    if (!d.op) {
      const currentLoc = d.active_location_id || activeLocation?.locationId;
      const init: Record<string, boolean> = {};
      ownedList.forEach((l) => { init[l.location_id] = l.location_id === currentLoc; });
      setSelected(init);
      // Best-effort default name from viewer email (server doesn't echo it).
      const seed = viewerEmail || "My";
      setGroupName(`${seed.split("@")[0]}'s Operations`);
    }
    setLoading(false);
  }

  useEffect(() => {
    // Try to grab a friendlier default name seed.
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.email) setViewerEmail(session.user.email);
    })();
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLocation?.locationId]);

  async function createGroup() {
    const picks = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
    if (picks.length === 0) return toast.error("Select at least one location");
    if (!groupName.trim()) return toast.error("Name your operator account");
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("operator-account", {
      body: { action: "create", name: groupName.trim(), location_ids: picks },
      headers: iframeHeaders(),
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      return toast.error((data as any)?.error || error?.message || "Could not create group");
    }
    toast.success("Operator account created");
    await refreshEffectiveLocations(activeLocation?.locationId ?? null);
    load();
  }

  async function addLocation(locId: string) {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("operator-account", {
      body: { action: "add", location_id: locId },
      headers: iframeHeaders(),
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      return toast.error((data as any)?.error || error?.message || "Failed to add");
    }
    toast.success("Added to group");
    await refreshEffectiveLocations(activeLocation?.locationId ?? null);
    load();
  }

  async function removeLocation(locId: string) {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("operator-account", {
      body: { action: "remove", location_id: locId },
      headers: iframeHeaders(),
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      return toast.error((data as any)?.error || error?.message || "Failed to remove");
    }
    toast.success("Removed from group");
    await refreshEffectiveLocations(activeLocation?.locationId ?? null);
    load();
  }

  if (loading) return <Loader2 className="h-4 w-4 animate-spin mt-6" />;
  if (owned.length === 0) {
    return (
      <div className="mt-6 text-sm text-muted-foreground p-6 border border-dashed rounded-md">
        You don't have access to any sub-accounts yet. Operator Accounts let you
        group multiple sub-accounts you're a member of so deals, buyers, tasks
        and KPIs are shared across all of them.
      </div>
    );
  }

  if (op) {
    const groupedIds = new Set(opLocations.map((l) => l.location_id));
    const ungrouped = owned.filter((l) => !groupedIds.has(l.location_id));
    const isActive =
      op.subscription_status === "active" &&
      (!op.current_period_end || new Date(op.current_period_end) > new Date());
    return (
      <div className="space-y-6 mt-6">
        <div className="border rounded-md p-4">
          <div className="flex items-center gap-2 mb-2">
            <Layers className="h-4 w-4 text-primary" />
            <div className="text-sm font-semibold">{op.name}</div>
          </div>
          <div className="text-xs text-muted-foreground">
            {isActive
              ? `Unlimited subscription covers all ${opLocations.length} location${opLocations.length === 1 ? "" : "s"}.`
              : `Pooled balance: ${op.credit_balance.toLocaleString()} credits`}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">In this group</Label>
          <div className="border rounded-md divide-y">
            {opLocations.map((l) => (
              <div key={l.location_id} className="p-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{displayName(l)}</div>
                  <div className="text-xs text-muted-foreground font-mono">{l.location_id}</div>
                </div>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => removeLocation(l.location_id)}>
                  <Minus className="h-4 w-4 mr-1" /> Remove
                </Button>
              </div>
            ))}
          </div>
        </div>

        {ungrouped.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Add to group</Label>
            <div className="border rounded-md divide-y">
              {ungrouped.map((l) => (
                <div key={l.location_id} className="p-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{displayName(l)}</div>
                    <div className="text-xs text-muted-foreground font-mono">{l.location_id}</div>
                  </div>
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => addLocation(l.location_id)}>
                    <Plus className="h-4 w-4 mr-1" /> Add
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Setup flow
  return (
    <div className="space-y-6 mt-6">
      <div>
        <h3 className="text-base font-semibold">Group your locations for a unified dashboard</h3>
        <p className="text-sm text-muted-foreground mt-1">
          See deals, buyers, tasks and KPIs from all selected sub-accounts in one view —
          no matter which iframe you open. Pricing also pools into one subscription.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Operator Account name</Label>
        <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Locations you own
        </Label>
        <div className="border rounded-md divide-y">
          {owned.map((l) => (
            <label key={l.location_id} className="p-3 flex items-center gap-3 cursor-pointer hover:bg-muted/40">
              <Checkbox
                checked={!!selected[l.location_id]}
                onCheckedChange={(v) => setSelected((s) => ({ ...s, [l.location_id]: !!v }))}
              />
              <div className="flex-1">
                <div className="text-sm font-medium">{displayName(l)}</div>
                <div className="text-xs text-muted-foreground font-mono">{l.location_id}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <Button onClick={createGroup} disabled={busy}>
        {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
        Create Group
      </Button>
    </div>
  );
}
