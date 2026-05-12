import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function NoAccess() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
            <ShieldCheck className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold">Dispo Tool</h1>
        </div>
        <div className="rounded-lg bg-card border border-border p-6">
          <h2 className="text-lg font-semibold mb-2">No workspace access</h2>
          <p className="text-sm text-muted-foreground mb-4">
            You're signed in as <strong>{user?.email}</strong>, but you're not a member of any workspace yet.
            Ask your team owner to invite you, then open the link they send.
          </p>
          <Button variant="outline" className="w-full" onClick={async () => { await signOut(); nav("/login"); }}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
