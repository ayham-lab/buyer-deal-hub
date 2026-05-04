import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { TEAM_ROLES } from "@/components/team/TeamMemberModal";

interface Assignee {
  id: string;
  team_member_id: string;
  role: string;
  commission_split: number | null;
}

export function DealAssignees({ dealId }: { dealId: string }) {
  const { user } = useAuth();
  const [team, setTeam] = useState<{ id: string; name: string; role: string }[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [memberId, setMemberId] = useState("");
  const [role, setRole] = useState("acquisitions_manager");
  const [split, setSplit] = useState("");

  async function load() {
    const [{ data: a }, { data: t }] = await Promise.all([
      supabase.from("deal_assignees").select("*").eq("deal_id", dealId),
      user ? supabase.from("team_members").select("id,name,role").eq("user_id", user.id).order("name") : Promise.resolve({ data: [] as any }),
    ]);
    setAssignees((a as any) || []);
    setTeam((t as any) || []);
  }

  useEffect(() => { if (dealId && user) load(); }, [dealId, user]);

  async function add() {
    if (!memberId) return toast.error("Pick a team member");
    const { error } = await supabase.from("deal_assignees").insert({
      deal_id: dealId,
      team_member_id: memberId,
      role,
      commission_split: split ? Number(split) : null,
    });
    if (error) return toast.error(error.message);
    setMemberId(""); setSplit("");
    load();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("deal_assignees").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setAssignees((xs) => xs.filter((x) => x.id !== id));
  }

  async function updateSplit(id: string, value: string) {
    const v = value ? Number(value) : null;
    setAssignees((xs) => xs.map((x) => x.id === id ? { ...x, commission_split: v } : x));
    await supabase.from("deal_assignees").update({ commission_split: v }).eq("id", id);
  }

  const memberName = (id: string) => team.find((t) => t.id === id)?.name || "—";
  const roleLabel = (v: string) => TEAM_ROLES.find((r) => r.value === v)?.label || v;
  const totalSplit = assignees.reduce((s, a) => s + (a.commission_split || 0), 0);

  return (
    <div className="rounded-lg border border-border p-3 bg-muted/30 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Team & Commission Splits</div>
        {assignees.length > 0 && (
          <span className={`text-xs ${totalSplit === 100 ? "text-muted-foreground" : "text-amber-500"}`}>Total: {totalSplit}%</span>
        )}
      </div>

      {assignees.length === 0 && <div className="text-xs text-muted-foreground">No additional assignees.</div>}

      {assignees.map((a) => (
        <div key={a.id} className="flex items-center gap-2">
          <div className="flex-1 text-sm">
            <div>{memberName(a.team_member_id)}</div>
            <div className="text-xs text-muted-foreground">{roleLabel(a.role)}</div>
          </div>
          <Input
            type="number"
            className="w-20"
            placeholder="%"
            value={a.commission_split ?? ""}
            onChange={(e) => setAssignees((xs) => xs.map((x) => x.id === a.id ? { ...x, commission_split: e.target.value ? Number(e.target.value) : null } : x))}
            onBlur={(e) => updateSplit(a.id, e.target.value)}
          />
          <button onClick={() => remove(a.id)} className="text-muted-foreground hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}

      <div className="flex gap-2 pt-1 border-t border-border">
        <Select value={memberId} onValueChange={setMemberId}>
          <SelectTrigger className="flex-1"><SelectValue placeholder="Team member" /></SelectTrigger>
          <SelectContent>
            {team.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TEAM_ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="number" className="w-20" placeholder="%" value={split} onChange={(e) => setSplit(e.target.value)} />
        <Button onClick={add} size="icon" className="bg-primary hover:bg-primary-hover"><Plus className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}
