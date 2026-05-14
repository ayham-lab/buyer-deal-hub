// Admin Pricing tab: inline-editable Credit Packs, Subscription Plans, and Action Costs.
// Standalone admin only — not iframed.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Trash2, Save, Star } from "lucide-react";
import { toast } from "sonner";

interface Pack {
  id: string;
  name: string;
  credits: number;
  price_cents: number;
  stripe_price_id: string | null;
  is_active: boolean;
  is_featured: boolean;
  sort_order: number;
}

interface Plan {
  id: string;
  name: string;
  price_cents: number;
  stripe_price_id: string | null;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}

interface Cost {
  id: string;
  action_key: string;
  credits: number;
  is_active: boolean;
}

export function PricingTab() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [costs, setCosts] = useState<Cost[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [{ data: p }, { data: s }, { data: c }] = await Promise.all([
      supabase.from("credit_packs").select("*").order("sort_order"),
      supabase.from("subscription_plans").select("*").order("sort_order"),
      supabase.from("credit_action_costs").select("*").order("action_key"),
    ]);
    setPacks((p as Pack[]) || []);
    setPlans((s as Plan[]) || []);
    setCosts((c as Cost[]) || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function savePack(p: Pack) {
    const { data, error } = await supabase
      .from("credit_packs")
      .update({
        name: p.name,
        credits: Number(p.credits),
        price_cents: Number(p.price_cents),
        stripe_price_id: p.stripe_price_id || null,
        is_active: p.is_active,
        is_featured: p.is_featured,
        sort_order: Number(p.sort_order),
      })
      .eq("id", p.id)
      .select();
    if (error) return toast.error(`Save failed: ${error.message}`);
    if (!data || data.length === 0) {
      return toast.error(
        "Save blocked by permissions. Open the admin in standalone mode (outside the GHL iframe) to edit pricing.",
      );
    }
    toast.success("Pack saved");
  }

  async function deletePack(id: string) {
    if (!confirm("Delete this pack?")) return;
    const { error } = await supabase.from("credit_packs").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setPacks((s) => s.filter((p) => p.id !== id));
  }

  async function addPack() {
    const { data, error } = await supabase
      .from("credit_packs")
      .insert({ name: "New pack", credits: 100, price_cents: 0, sort_order: packs.length + 1 })
      .select()
      .single();
    if (error) return toast.error(error.message);
    setPacks((s) => [...s, data as Pack]);
  }

  async function savePlan(p: Plan) {
    const { data, error } = await supabase
      .from("subscription_plans")
      .update({
        name: p.name,
        price_cents: Number(p.price_cents),
        stripe_price_id: p.stripe_price_id || null,
        description: p.description,
        is_active: p.is_active,
        sort_order: Number(p.sort_order),
      })
      .eq("id", p.id)
      .select();
    if (error) return toast.error(`Save failed: ${error.message}`);
    if (!data || data.length === 0) {
      return toast.error(
        "Save blocked by permissions. Open the admin in standalone mode (outside the GHL iframe) to edit pricing.",
      );
    }
    toast.success("Plan saved");
  }

  async function deletePlan(id: string) {
    if (!confirm("Delete this plan?")) return;
    const { error } = await supabase.from("subscription_plans").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setPlans((s) => s.filter((p) => p.id !== id));
  }

  async function addPlan() {
    const { data, error } = await supabase
      .from("subscription_plans")
      .insert({ name: "New plan", price_cents: 0, sort_order: plans.length + 1 })
      .select()
      .single();
    if (error) return toast.error(error.message);
    setPlans((s) => [...s, data as Plan]);
  }

  async function saveCost(c: Cost) {
    const { data, error } = await supabase
      .from("credit_action_costs")
      .update({ credits: Number(c.credits), is_active: c.is_active })
      .eq("id", c.id)
      .select();
    if (error) return toast.error(`Save failed: ${error.message}`);
    if (!data || data.length === 0) {
      return toast.error(
        "Save blocked by permissions. Open the admin in standalone mode (outside the GHL iframe) to edit pricing.",
      );
    }
    toast.success("Cost saved");
  }

  if (loading) {
    return <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Credit Packs</h3>
          <Button size="sm" variant="outline" onClick={addPack}>
            <Plus className="h-4 w-4 mr-1" /> Add pack
          </Button>
        </div>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2">Name</th>
                <th className="text-left p-2">Credits</th>
                <th className="text-left p-2">Price ($)</th>
                <th className="text-left p-2">Stripe Price ID</th>
                <th className="text-left p-2" title="Most Popular badge"><Star className="h-3.5 w-3.5 inline" /></th>
                <th className="text-left p-2">Active</th>
                <th className="text-left p-2">Sort</th>
                <th className="p-2 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {packs.map((p, i) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="p-2">
                    <Input value={p.name} onChange={(e) => updateAt(setPacks, i, { name: e.target.value })} />
                  </td>
                  <td className="p-2 w-24">
                    <Input type="number" value={p.credits} onChange={(e) => updateAt(setPacks, i, { credits: Number(e.target.value) })} />
                  </td>
                  <td className="p-2 w-28">
                    <Input
                      type="number"
                      step="0.01"
                      value={(p.price_cents / 100).toString()}
                      onChange={(e) => updateAt(setPacks, i, { price_cents: Math.round(Number(e.target.value) * 100) })}
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      placeholder="price_..."
                      value={p.stripe_price_id || ""}
                      onChange={(e) => updateAt(setPacks, i, { stripe_price_id: e.target.value })}
                    />
                  </td>
                  <td className="p-2">
                    <Switch checked={p.is_featured} onCheckedChange={(v) => updateAt(setPacks, i, { is_featured: v })} />
                  </td>
                  <td className="p-2">
                    <Switch checked={p.is_active} onCheckedChange={(v) => updateAt(setPacks, i, { is_active: v })} />
                  </td>
                  <td className="p-2 w-20">
                    <Input type="number" value={p.sort_order} onChange={(e) => updateAt(setPacks, i, { sort_order: Number(e.target.value) })} />
                  </td>
                  <td className="p-2 flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => savePack(p)}><Save className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => deletePack(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Subscription Plans</h3>
          <Button size="sm" variant="outline" onClick={addPlan}>
            <Plus className="h-4 w-4 mr-1" /> Add plan
          </Button>
        </div>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2">Name</th>
                <th className="text-left p-2">Price ($/mo)</th>
                <th className="text-left p-2">Stripe Price ID</th>
                <th className="text-left p-2">Description</th>
                <th className="text-left p-2">Active</th>
                <th className="text-left p-2">Sort</th>
                <th className="p-2 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p, i) => (
                <tr key={p.id} className="border-t border-border align-top">
                  <td className="p-2">
                    <Input value={p.name} onChange={(e) => updateAt(setPlans, i, { name: e.target.value })} />
                  </td>
                  <td className="p-2 w-28">
                    <Input
                      type="number"
                      step="0.01"
                      value={(p.price_cents / 100).toString()}
                      onChange={(e) => updateAt(setPlans, i, { price_cents: Math.round(Number(e.target.value) * 100) })}
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      placeholder="price_..."
                      value={p.stripe_price_id || ""}
                      onChange={(e) => updateAt(setPlans, i, { stripe_price_id: e.target.value })}
                    />
                  </td>
                  <td className="p-2">
                    <Textarea
                      rows={2}
                      value={p.description || ""}
                      onChange={(e) => updateAt(setPlans, i, { description: e.target.value })}
                    />
                  </td>
                  <td className="p-2">
                    <Switch checked={p.is_active} onCheckedChange={(v) => updateAt(setPlans, i, { is_active: v })} />
                  </td>
                  <td className="p-2 w-20">
                    <Input type="number" value={p.sort_order} onChange={(e) => updateAt(setPlans, i, { sort_order: Number(e.target.value) })} />
                  </td>
                  <td className="p-2 flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => savePlan(p)}><Save className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => deletePlan(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="font-semibold mb-3">Action Costs</h3>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2">Action</th>
                <th className="text-left p-2">Credits</th>
                <th className="text-left p-2">Active</th>
                <th className="p-2 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {costs.map((c, i) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="p-2 font-mono text-xs">{c.action_key}</td>
                  <td className="p-2 w-24">
                    <Input type="number" value={c.credits} onChange={(e) => updateAt(setCosts, i, { credits: Number(e.target.value) })} />
                  </td>
                  <td className="p-2">
                    <Switch checked={c.is_active} onCheckedChange={(v) => updateAt(setCosts, i, { is_active: v })} />
                  </td>
                  <td className="p-2">
                    <Button size="icon" variant="ghost" onClick={() => saveCost(c)}><Save className="h-4 w-4" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function updateAt<T>(setter: React.Dispatch<React.SetStateAction<T[]>>, i: number, patch: Partial<T>) {
  setter((s) => s.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
}
