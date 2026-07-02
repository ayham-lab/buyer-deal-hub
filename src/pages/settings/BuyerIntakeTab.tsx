import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveLocation } from "@/contexts/LocationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Copy, RefreshCw, ExternalLink } from "lucide-react";
import { toast } from "sonner";

type TokenRow = {
  ghl_location_id: string;
  token: string;
  is_active: boolean;
  label: string | null;
};

const FN_URL = `https://ihvqhjrrahgyunmfvtrp.supabase.co/functions/v1/buyer-intake`;

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function BuyerIntakeTab() {
  const { activeLocation } = useActiveLocation();
  const locationId = activeLocation?.locationId ?? null;
  const [row, setRow] = useState<TokenRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!locationId) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("buyer_intake_tokens")
      .select("ghl_location_id, token, is_active, label")
      .eq("ghl_location_id", locationId)
      .maybeSingle();
    setRow((data as TokenRow) ?? null);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [locationId]);

  const generate = async () => {
    if (!locationId) return;
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); return; }
    const { data, error } = await supabase
      .from("buyer_intake_tokens")
      .insert({
        ghl_location_id: locationId,
        workspace_owner_user_id: user.id,
        token: randomToken(),
      })
      .select("ghl_location_id, token, is_active, label")
      .single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setRow(data as TokenRow);
    toast.success("Intake link created");
  };

  const rotate = async () => {
    if (!row) return;
    if (!confirm("Rotating will invalidate the existing webhook and public form URL. Continue?")) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("buyer_intake_tokens")
      .update({ token: randomToken() })
      .eq("ghl_location_id", row.ghl_location_id)
      .select("ghl_location_id, token, is_active, label")
      .single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setRow(data as TokenRow);
    toast.success("Token rotated");
  };

  const toggleActive = async (v: boolean) => {
    if (!row) return;
    const { data, error } = await supabase
      .from("buyer_intake_tokens")
      .update({ is_active: v })
      .eq("ghl_location_id", row.ghl_location_id)
      .select("ghl_location_id, token, is_active, label")
      .single();
    if (error) { toast.error(error.message); return; }
    setRow(data as TokenRow);
  };

  const copy = (v: string, label: string) => {
    navigator.clipboard.writeText(v);
    toast.success(`${label} copied`);
  };

  if (!locationId) {
    return <p className="text-sm text-muted-foreground">Select a workspace to configure buyer intake.</p>;
  }
  if (loading) return <Loader2 className="h-5 w-5 animate-spin" />;

  if (!row) {
    return (
      <div className="space-y-4 max-w-2xl">
        <div>
          <h3 className="text-lg font-semibold">Auto-add buyers via webhook or form</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Generate a unique intake link. Use the webhook URL in GHL (or any tool) to auto-add buyers, or share the public form URL with buyers to fill out themselves.
          </p>
        </div>
        <Button onClick={generate} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Generate intake link
        </Button>
      </div>
    );
  }

  const webhookUrl = `${FN_URL}?token=${row.token}`;
  const formUrl = `${window.location.origin}/buyer-signup/${row.token}`;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h3 className="text-lg font-semibold">Buyer Intake</h3>
        <p className="text-sm text-muted-foreground mt-1">
          These endpoints add or update buyers in this workspace automatically. Keep them secret — anyone with the URL can submit buyers.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-md border p-3">
        <div>
          <div className="font-medium text-sm">Intake enabled</div>
          <div className="text-xs text-muted-foreground">Turn off to reject all incoming submissions without rotating the token.</div>
        </div>
        <Switch checked={row.is_active} onCheckedChange={toggleActive} />
      </div>

      <div className="space-y-2">
        <Label>Webhook URL (POST JSON)</Label>
        <div className="flex gap-2">
          <Input readOnly value={webhookUrl} className="font-mono text-xs" />
          <Button variant="outline" size="icon" onClick={() => copy(webhookUrl, "Webhook URL")}><Copy className="h-4 w-4" /></Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Point a GHL workflow "Webhook" action here. Accepts flat JSON or GHL contact payloads (customData / customFields). At minimum include <code>email</code> or <code>phone</code>.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Public buyer signup form</Label>
        <div className="flex gap-2">
          <Input readOnly value={formUrl} className="font-mono text-xs" />
          <Button variant="outline" size="icon" onClick={() => copy(formUrl, "Form URL")}><Copy className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => window.open(formUrl, "_blank")}><ExternalLink className="h-4 w-4" /></Button>
        </div>
        <p className="text-xs text-muted-foreground">Share this link anywhere — anyone who submits is auto-added as a buyer in this workspace.</p>
      </div>

      <details className="rounded-md border p-3 text-sm">
        <summary className="cursor-pointer font-medium">Accepted field names</summary>
        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
          <p><b>Identity:</b> first_name, last_name, name, email, phone, company_name</p>
          <p><b>Buy box:</b> markets, property_types, buyer_types, buyer_frequency, price_min, price_max</p>
          <p><b>Vetting:</b> previous_deals, experience, criteria_notes, source</p>
          <p>Arrays can be sent as comma-separated strings. GHL payloads with <code>customData</code> or <code>customFields</code> are auto-flattened.</p>
        </div>
      </details>

      <div className="flex gap-2">
        <Button variant="outline" onClick={rotate} disabled={busy}>
          <RefreshCw className="h-4 w-4 mr-2" /> Rotate token
        </Button>
      </div>
    </div>
  );
}
