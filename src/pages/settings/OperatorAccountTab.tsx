// Operator Account tab in Settings.
// Lets a location owner group multiple GHL sub-accounts they own so the
// app surfaces aggregate data + unified billing across all of them.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useActiveLocation, refreshEffectiveLocations } from "@/contexts/LocationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Layers, Plus, Minus } from "lucide-react";
import { toast } from "sonner";

interface OwnedLoc {
  location_id: string;
  name: string;
  operator_account_id: string | null;
}

interface OperatorAccount {
  id: string;
  name: string;
  subscription_status: string | null;
  current_period_end: string | null;
  credit_balance: number;
}

export default function OperatorAccountTab() {
  const { user } = useAuth();
  const { activeLocation } = useActiveLocation();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [owned, setOwned] = useState<OwnedLoc[]>([]);
  const [op, setOp] = useState<OperatorAccount | null>(null);
  const [opLocations, setOpLocations] = useState<OwnedLoc[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [groupName, setGroupName] = useState("");

  async function load() {
    if (!user) return;
    setLoading(true);

    // Find sub-accounts the user owns
    const { data: memberships } = await supabase
      .from("location_memberships")
      .select("location_id, is_owner")
      .eq("user_id", user.id)
      .eq("is_owner", true);

    const ids = (memberships || []).map((m: any) => m.location_id);
    if (ids.length === 0) {
      setOwned([]);
      setOp(null);
      setLoading(false);
      return;
    }

    const { data: tokens } = await supabase
      .from("ghl_location_tokens")
      .select("ghl_location_id, location_name, operator_account_id")
      .in("ghl_location_id", ids);

    const ownedList: OwnedLoc[] = (tokens || []).map((t: any) => ({
      location_id: t.ghl_location_id,
      name: t.location_name || t.ghl_location_id,
      operator_account_id: t.operator_account_id ?? null,
    }));
    setOwned(ownedList);

    // Is the current active location already in a group?
    const currentLoc = activeLocation?.locationId;
    const currentRow = ownedList.find((l) => l.location_id === currentLoc);
    const opId = currentRow?.operator_account_id ?? null;

    if (opId) {
      const { data: opRow } = await supabase
        .from("operator_accounts")
        .select("id,name,subscription_status,current_period_end,credit_balance")
        .eq("id", opId)
        .maybeSingle();
      setOp((opRow as any) ?? null);
      const inGroup = ownedList.filter((l) => l.operator_account_id === opId);
      setOpLocations(inGroup);
    } else {
      setOp(null);
      setOpLocations([]);
      // Pre-select current location
      const init: Record<string, boolean> = {};
      ownedList.forEach((l) => { init[l.location_id] = l.location_id === currentLoc; });
      setSelected(init);
      setGroupName(`${(user.email || "My").split("@")[0]}'s Operations`);
    }
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id, activeLocation?.locationId]);

  async function createGroup() {
    if (!user) return;
    const picks = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
    if (picks.length === 0) return toast.error("Select at least one location");
    if (!groupName.trim()) return toast.error("Name your operator account");
    setBusy(true);
    const { data: created, error } = await supabase
      .from("operator_accounts")
      .insert({ name: groupName.trim(), owner_user_id: user.id })
      .select()
      .single();
    if (error || !created) {
      setBusy(false);
      return toast.error(error?.message || "Could not create group");
    }
    const { error: linkErr } = await supabase
      .from("ghl_location_tokens")
      .update({ operator_account_id: (created as any).id })
      .in("ghl_location_id", picks);
    setBusy(false);
    if (linkErr) return toast.error(linkErr.message);
    toast.success("Operator account created");
    await refreshEffectiveLocations(activeLocation?.locationId ?? null);
    load();
  }

  async function addLocation(locId: string) {
    if (!op) return;
    setBusy(true);
    const { error } = await supabase
      .from("ghl_location_tokens")
      .update({ operator_account_id: op.id })
      .eq("ghl_location_id", locId);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Added to group");
    await refreshEffectiveLocations(activeLocation?.locationId ?? null);
    load();
  }

  async function removeLocation(locId: string) {
    setBusy(true);
    const { error } = await supabase
      .from("ghl_location_tokens")
      .update({ operator_account_id: null })
      .eq("ghl_location_id", locId);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Removed from group");
    await refreshEffectiveLocations(activeLocation?.locationId ?? null);
    load();
  }

  if (loading) return <Loader2 className="h-4 w-4 animate-spin mt-6" />;
  if (owned.length === 0) {
    return (
      <div className="mt-6 text-sm text-muted-foreground p-6 border border-dashed rounded-md">
        You don't own any sub-accounts that can be grouped. Operator Accounts
        are only available to workspace owners.
      </div>
    );
  }

  if (op) {
    const ungrouped = owned.filter((l) => !l.operator_account_id);
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
                  <div className="text-sm font-medium">{l.name}</div>
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
                    <div className="text-sm font-medium">{l.name}</div>
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
                <div className="text-sm font-medium">{l.name}</div>
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
