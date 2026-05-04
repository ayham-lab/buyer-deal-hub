import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TeamMemberModal, TEAM_ROLES } from "@/components/team/TeamMemberModal";

export default function Team() {
  const { user, profile } = useAuth();
  const [members, setMembers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  async function load() {
    if (!user) return;
    let { data } = await supabase.from("team_members").select("*").eq("user_id", user.id).order("name");
    let list = data || [];

    // Ensure the account owner appears as a team member (auto-create once)
    const ownerEmail = profile?.email || user.email;
    const ownerExists = list.some((m) => (m.email || "").toLowerCase() === (ownerEmail || "").toLowerCase());
    if (!ownerExists && ownerEmail) {
      const { data: inserted } = await supabase
        .from("team_members")
        .insert({
          user_id: user.id,
          name: profile?.name || ownerEmail,
          email: ownerEmail,
          role: "dispo_manager",
          notes: "Account owner",
        })
        .select()
        .single();
      if (inserted) list = [...list, inserted].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }
    setMembers(list);
  }
  useEffect(() => { load(); }, [user, profile]);

  const roleLabel = (r: string) => TEAM_ROLES.find((x) => x.value === r)?.label || r;
  const ownerEmail = (profile?.email || user?.email || "").toLowerCase();
  const isOwner = (m: any) => (m.email || "").toLowerCase() === ownerEmail;
  const filtered = members.filter((m) => !search || m.name?.toLowerCase().includes(search.toLowerCase()) || m.email?.toLowerCase().includes(search.toLowerCase()));


  return (
    <AppLayout>
      <PageHeader
        title="Team"
        subtitle={`${members.length} members`}
        actions={
          <Button onClick={() => { setEditing(null); setOpen(true); }} className="bg-primary hover:bg-primary-hover text-primary-foreground">
            <Plus className="h-4 w-4 mr-1" /> Add Team Member
          </Button>
        }
      />
      <div className="p-6 lg:p-8 space-y-4">
        <Input placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((m) => (
                <TableRow key={m.id} className="cursor-pointer" onClick={() => { setEditing(m); setOpen(true); }}>
                  <TableCell className="font-medium">
                    {m.name}
                    {isOwner(m) && <Badge className="ml-2 bg-primary/15 text-primary border-0">You</Badge>}
                  </TableCell>
                  <TableCell><Badge variant="secondary">{roleLabel(m.role)}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{m.email || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{m.phone || "—"}</TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No team members yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      <TeamMemberModal open={open} onClose={() => setOpen(false)} member={editing} onSaved={load} />
    </AppLayout>
  );
}
