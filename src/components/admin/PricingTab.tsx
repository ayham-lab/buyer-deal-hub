// Admin Pricing tab: inline-editable Credit Packs and Action Costs tables.
// Standalone admin only — not iframed.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";

interface Pack {
  id: string;
  name: string;
  credits: number;
  price_cents: number;
  stripe_price_id: string | null;
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
  const [costs, setCosts] = useState<Cost[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase.from("credit_packs").select("*").order("sort_order"),
      supabase.from("credit_action_costs").select("*").order("action_key"),
    ]);
    setPacks((p as Pack[]) || []);
    setCosts((c as Cost[]) || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function savePack(p: Pack) {
    const { error } = await supabase
      .from("credit_packs")
      .update({
        name: p.name,
        credits: Number(p.credits),
        price_cents: Number(p.price_cents),
        stripe_price_id: p.stripe_price_id || null,
        is_active: p.is_active,
        sort_order: Number(p.sort_order),
      })
      .eq("id", p.id);
    if (error) toast.error(error.message);
    else toast.success("Pack saved");
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

  async function saveCost(c: Cost) {
    const { error } = await supabase
      .from("credit_action_costs")
      .update({ credits: Number(c.credits), is_active: c.is_active })
      .eq("id", c.id);
    if (error) toast.error(error.message);
    else toast.success("Cost saved");
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
