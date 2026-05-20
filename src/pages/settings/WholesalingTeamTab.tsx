import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { scopeToLocation, getActiveLocationId } from "@/lib/locationScope";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2 } from "lucide-react";
import { TeamMemberModal, TEAM_ROLES } from "@/components/team/TeamMemberModal";
import { toast } from "sonner";

export default function WholesalingTeamTab() {
  const { user } = useAuth();
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  async function load() {
    if (!user) return;
    setLoading(true);
    const activeLoc = getActiveLocationId();
    const base = supabase.from("team_members").select("*").order("name");
    const q = activeLoc ? base : base.eq("user_id", user.id);
    const { data, error } = await scopeToLocation(q);
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setMembers(data || []);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  async function toggleActive(m: any, v: boolean) {
    setMembers((xs) => xs.map((x) => x.id === m.id ? { ...x, is_active: v } : x));
    const { error } = await supabase.from("team_members").update({ is_active: v }).eq("id", m.id);
    if (error) { toast.error(error.message); load(); }
  }

  const roleLabel = (r: string) => TEAM_ROLES.find((x) => x.value === r)?.label || r;
  const filtered = members.filter((m) => !search || m.name?.toLowerCase().includes(search.toLowerCase()) || m.email?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4 mt-6">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground max-w-xl">
          People on your wholesaling team (Acquisitions Managers, VAs, etc.). They appear in deal dropdowns and commission splits.
          This is separate from the <strong>Team</strong> tab, which controls who can sign into Dispo Tool.
        </p>
        <Button onClick={() => { setEditing(null); setOpen(true); }} className="bg-primary hover:bg-primary-hover">
          <Plus className="h-4 w-4 mr-1" /> Add Member
        </Button>
      </div>

      <Input placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />

      <div className="rounded-lg border border-border bg-card">
        {loading ? (
          <div className="p-6"><Loader2 className="h-4 w-4 animate-spin" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="w-24">Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((m) => (
                <TableRow key={m.id} className="cursor-pointer" onClick={() => { setEditing(m); setOpen(true); }}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell><Badge variant="secondary">{roleLabel(m.role)}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{m.email || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{m.phone || "—"}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Switch checked={m.is_active !== false} onCheckedChange={(v) => toggleActive(m, !!v)} />
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No wholesaling team members yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <TeamMemberModal open={open} onClose={() => setOpen(false)} member={editing} onSaved={load} />
    </div>
  );
}
