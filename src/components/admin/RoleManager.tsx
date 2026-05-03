import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ShieldCheck, ShieldOff, Search } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";

interface UserRow {
  user_id: string;
  email: string | null;
  name: string | null;
  isAdminRole: boolean;
}

interface Props {
  users: UserRow[];
  onChanged: () => void;
}

export function RoleManager({ users, onChanged }: Props) {
  const { user, refreshRoles } = useAuth();
  const [q, setQ] = useState("");
  const filtered = users.filter((u) => {
    const s = q.toLowerCase();
    return !s || u.email?.toLowerCase().includes(s) || u.name?.toLowerCase().includes(s);
  });

  async function promote(uid: string) {
    const { error } = await supabase.from("user_roles").insert({ user_id: uid, role: "admin" as any });
    if (error && !error.message.includes("duplicate")) {
      toast.error(error.message);
      return;
    }
    toast.success("Promoted to admin");
    if (uid === user?.id) await refreshRoles();
    onChanged();
  }

  async function demote(uid: string) {
    const { error } = await supabase.from("user_roles").delete().eq("user_id", uid).eq("role", "admin");
    if (error) { toast.error(error.message); return; }
    toast.success("Removed admin role");
    if (uid === user?.id) await refreshRoles();
    onChanged();
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search users…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="data-table w-full">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th className="text-right">Actions</th></tr></thead>
          <tbody>
            {filtered.map((u) => {
              const isSelf = u.user_id === user?.id;
              return (
                <tr key={u.user_id}>
                  <td className="font-medium">{u.name || "—"}</td>
                  <td className="text-muted-foreground">{u.email}</td>
                  <td>
                    {u.isAdminRole
                      ? <Badge className="bg-primary/15 text-primary border-primary/30">admin</Badge>
                      : <Badge variant="outline">user</Badge>}
                  </td>
                  <td className="text-right">
                    {u.isAdminRole ? (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="outline">
                            <ShieldOff className="h-3.5 w-3.5 mr-1.5" /> Remove admin
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove admin role?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {isSelf
                                ? "You are removing your OWN admin role. You will immediately lose access to the Admin Console and won't be able to grant it back without another admin's help."
                                : `Remove admin access from ${u.email}? They will keep their account but lose cross-tenant visibility.`}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => demote(u.user_id)}>Remove admin</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ) : (
                      <Button size="sm" onClick={() => promote(u.user_id)}>
                        <ShieldCheck className="h-3.5 w-3.5 mr-1.5" /> Make admin
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={4} className="text-center text-muted-foreground py-6">No users match.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
