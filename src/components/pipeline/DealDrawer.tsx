import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { withLocation, scopeToLocation } from "@/lib/locationScope";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useActiveLocation } from "@/contexts/LocationContext";
import { DealFiles } from "./DealFiles";
import { DealBuyerMatch } from "./DealBuyerMatch";
import { DealAssignees } from "./DealAssignees";
import { DealActivity } from "./DealActivity";
import { DealMarketing } from "./DealMarketing";
import { format } from "date-fns";

export function DealDrawer({ dealId, onClose, onUpdated }: { dealId: string | null; onClose: () => void; onUpdated: () => void }) {
  const { user } = useAuth();
  const { isIframed, activeLocation } = useActiveLocation();
  const [deal, setDeal] = useState<any>(null);
  const [checklist, setChecklist] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [titleCos, setTitleCos] = useState<{ id: string; name: string }[]>([]);
  const [owners, setOwners] = useState<{ user_id: string; name: string | null; email: string | null }[]>([]);
  const [team, setTeam] = useState<{ id: string; name: string; role: string }[]>([]);
  const [locationName, setLocationName] = useState<string | null>(null);
  const [newTask, setNewTask] = useState("");
  const [newCheck, setNewCheck] = useState("");

  useEffect(() => {
    if (!dealId) { setDeal(null); return; }
    (async () => {
      const [{ data: d }, { data: c }, { data: t }, { data: tc }, ownRes, { data: tm }] = await Promise.all([
        supabase.from("deals").select("*").eq("id", dealId).single(),
        supabase.from("deal_checklist").select("*").eq("deal_id", dealId).order("sort_order"),
        supabase.from("tasks").select("*").eq("deal_id", dealId).order("created_at", { ascending: false }),
        user ? scopeToLocation(supabase.from("title_companies").select("id,name").eq("user_id", user.id).order("name")) : Promise.resolve({ data: [] as any }),
        isIframed
          ? Promise.resolve({ data: [] as any })
          : supabase.from("profiles").select("user_id,name,email").order("name"),
        user ? scopeToLocation(supabase.from("team_members").select("id,name,role").eq("user_id", user.id).order("name")) : Promise.resolve({ data: [] as any }),
      ]);
      setDeal(d); setChecklist(c || []); setTasks(t || []); setTitleCos((tc as any) || []); setOwners(((ownRes as any)?.data as any) || []); setTeam((tm as any) || []);

      // Source location name
      if (d?.ghl_location_id) {
        const { data: loc } = await supabase
          .from("ghl_location_tokens")
          .select("location_name")
          .eq("ghl_location_id", d.ghl_location_id)
          .maybeSingle();
        setLocationName((loc as any)?.location_name || null);
      } else {
        setLocationName(null);
      }
    })();
  }, [dealId, user, isIframed]);

  if (!dealId || !deal) return null;

  async function saveField(field: string, value: any) {
    const { error } = await supabase.from("deals").update({ [field]: value } as any).eq("id", dealId);
    if (error) toast.error(error.message);
    else { setDeal({ ...deal, [field]: value }); onUpdated(); }
  }

  async function toggleCheck(id: string, current: boolean) {
    setChecklist((cs) => cs.map((c) => c.id === id ? { ...c, is_completed: !current } : c));
    await supabase.from("deal_checklist").update({ is_completed: !current }).eq("id", id);
  }

  async function addCheckItem() {
    if (!newCheck.trim()) return;
    const { data } = await supabase.from("deal_checklist").insert({ deal_id: dealId, item_text: newCheck, sort_order: checklist.length }).select().single();
    if (data) setChecklist([...checklist, data]);
    setNewCheck("");
  }

  async function removeCheck(id: string) {
    setChecklist((cs) => cs.filter((c) => c.id !== id));
    await supabase.from("deal_checklist").delete().eq("id", id);
  }

  async function addTask() {
    if (!newTask.trim() || !user) return;
    const { data } = await supabase.from("tasks").insert(withLocation({ user_id: user.id, deal_id: dealId, title: newTask })).select().single();
    if (data) setTasks([data, ...tasks]);
    setNewTask("");
  }

  async function toggleTask(id: string, current: boolean) {
    setTasks((ts) => ts.map((t) => t.id === id ? { ...t, is_completed: !current } : t));
    await supabase.from("tasks").update({ is_completed: !current }).eq("id", id);
  }

  async function deleteDeal() {
    if (!confirm("Delete this deal?")) return;
    const { error } = await supabase.from("deals").delete().eq("id", dealId);
    if (error) toast.error(error.message);
    else { toast.success("Deal deleted"); onClose(); onUpdated(); }
  }

  return (
    <Sheet open={!!dealId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="bg-card border-border w-[560px] sm:max-w-[560px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-lg">{deal.property_address}</SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="overview" className="mt-6">
          <TabsList className="bg-secondary">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="files">Files</TabsTrigger>
            <TabsTrigger value="checklist">Checklist ({checklist.filter((c) => !c.is_completed).length})</TabsTrigger>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
            <TabsTrigger value="marketing">Marketing</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            <Field label="Address" value={deal.property_address} onSave={(v) => saveField("property_address", v)} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Asking Price" type="number" value={deal.asking_price ?? ""} onSave={(v) => saveField("asking_price", v ? Number(v) : null)} />
              <Field label="ARV" type="number" value={deal.arv ?? ""} onSave={(v) => saveField("arv", v ? Number(v) : null)} />
              <Field label="Assignment Fee" type="number" value={deal.assignment_fee ?? ""} onSave={(v) => saveField("assignment_fee", v ? Number(v) : null)} />
              <Field label="EMD Amount" type="number" value={deal.emd_amount ?? ""} onSave={(v) => saveField("emd_amount", v ? Number(v) : null)} />
              <Field label="IP Expiry" type="date" value={deal.ip_expiry_date ?? ""} onSave={(v) => saveField("ip_expiry_date", v || null)} />
              <Field label="Closing" type="date" value={deal.closing_date ?? ""} onSave={(v) => saveField("closing_date", v || null)} />
              <Field label="Lead Source" value={deal.lead_source ?? ""} onSave={(v) => saveField("lead_source", v)} />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Title Company</label>
              <Select
                value={deal.title_company_id || "none"}
                onValueChange={(v) => saveField("title_company_id", v === "none" ? null : v)}
              >
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {titleCos.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Deal Owner (Dispo Manager)</label>
              {isIframed ? (
                // SECURITY: in iframe mode the owner select is READ-ONLY and shows GHL identity
                // only — never users.email/users.name from the cross-tenant Lovable profiles table.
                <div className="border border-border rounded-md px-3 py-2 text-sm bg-muted/30">
                  {deal.ghl_assigned_user_id
                    ? (activeLocation?.userName && (deal.ghl_assigned_user_id === (activeLocation as any).userId)
                        ? activeLocation.userName
                        : `GHL: ${String(deal.ghl_assigned_user_id).slice(0, 8)}`)
                    : "Unassigned"}
                </div>
              ) : (
                <Select
                  value={deal.owner_id || "none"}
                  onValueChange={(v) => saveField("owner_id", v === "none" ? null : v)}
                >
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {owners.map((o) => (
                      <SelectItem key={o.user_id} value={o.user_id}>{o.name || o.email || o.user_id.slice(0, 8)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Acquisitions Manager</label>
                <Select value={deal.acquisitions_manager_id || "none"} onValueChange={(v) => saveField("acquisitions_manager_id", v === "none" ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {team.filter((t) => t.role === "acquisitions_manager" || t.role === "other").map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-muted-foreground">VA</label>
                <Select value={deal.va_id || "none"} onValueChange={(v) => saveField("va_id", v === "none" ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {team.filter((t) => t.role === "va" || t.role === "other").map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Checkbox checked={deal.emd_received} onCheckedChange={(v) => saveField("emd_received", !!v)} />
              <span className="text-sm">EMD Received</span>
            </div>

            <DealAssignees dealId={dealId} />

            <DealBuyerMatch dealId={dealId} buyerId={deal.buyer_id} onChange={(id) => setDeal({ ...deal, buyer_id: id })} />

            <div className="rounded-lg border border-border p-3 bg-muted/30">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Timeline</div>
              <ul className="space-y-1.5 text-sm">
                <TimelineRow label="Entered system" value={deal.created_at} />
                <TimelineRow label="EMD received" value={deal.emd_received_at} />
                <TimelineRow label="Assigned" value={deal.assigned_at} />
                <TimelineRow label="Closed" value={deal.closed_at} />
              </ul>
            </div>

            <Button onClick={deleteDeal} variant="outline" className="text-destructive border-destructive/30 mt-4">
              <Trash2 className="h-4 w-4 mr-1" /> Delete Deal
            </Button>
          </TabsContent>

          <TabsContent value="files" className="mt-4">
            <DealFiles dealId={dealId} />
          </TabsContent>

          <TabsContent value="checklist" className="space-y-2 mt-4">
            {checklist.map((c) => (
              <div key={c.id} className="flex items-center gap-2 group">
                <Checkbox checked={c.is_completed} onCheckedChange={() => toggleCheck(c.id, c.is_completed)} />
                <span className={`text-sm flex-1 ${c.is_completed ? "line-through text-muted-foreground" : ""}`}>{c.item_text}</span>
                <button onClick={() => removeCheck(c.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <Input value={newCheck} onChange={(e) => setNewCheck(e.target.value)} placeholder="Add item…" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCheckItem())} />
              <Button onClick={addCheckItem} size="icon" className="bg-primary hover:bg-primary-hover"><Plus className="h-4 w-4" /></Button>
            </div>
          </TabsContent>

          <TabsContent value="tasks" className="space-y-2 mt-4">
            {tasks.map((t) => (
              <div key={t.id} className="flex items-center gap-2">
                <Checkbox checked={t.is_completed} onCheckedChange={() => toggleTask(t.id, t.is_completed)} />
                <span className={`text-sm flex-1 ${t.is_completed ? "line-through text-muted-foreground" : ""}`}>{t.title}</span>
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <Input value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="New task…" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTask())} />
              <Button onClick={addTask} size="icon" className="bg-primary hover:bg-primary-hover"><Plus className="h-4 w-4" /></Button>
            </div>
          </TabsContent>

          <TabsContent value="notes" className="mt-4">
            <Textarea
              value={deal.notes || ""}
              onChange={(e) => setDeal({ ...deal, notes: e.target.value })}
              onBlur={(e) => saveField("notes", e.target.value)}
              rows={10}
              placeholder="Deal notes…"
            />
          </TabsContent>

          <TabsContent value="marketing" className="mt-4">
            <DealMarketing dealId={dealId} deal={deal} onChange={(patch) => setDeal({ ...deal, ...patch })} />
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            <DealActivity dealId={dealId} />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, value, onSave, type = "text" }: { label: string; value: any; onSave: (v: string) => void; type?: string }) {
  const [v, setV] = useState(String(value ?? ""));
  useEffect(() => setV(String(value ?? "")), [value]);
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</label>
      <Input type={type} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== String(value ?? "") && onSave(v)} />
    </div>
  );
}

function TimelineRow({ label, value }: { label: string; value: string | null }) {
  return (
    <li className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={value ? "" : "text-muted-foreground/60"}>
        {value ? format(new Date(value), "MMM d, yyyy · h:mm a") : "—"}
      </span>
    </li>
  );
}
