import { Building2, Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface PendingSignup {
  locationId: string;
  locationName: string | null;
  email: string | null;
  userName: string | null;
  /** True when this person already has an account here from another workspace. */
  hasAccount: boolean;
}

/**
 * Shown inside the GHL iframe when the sub-account already has a workspace but
 * this particular GHL user has never joined it. Opening the app no longer
 * creates an account on its own — a real person has to opt in from this screen.
 *
 * Sibling of ActivateWorkspace: same slot in LocationProvider, same promise
 * that nothing is written until the button is clicked.
 */
export function JoinWorkspace({
  pending,
  joining,
  error,
  onJoin,
}: {
  pending: PendingSignup;
  joining: boolean;
  error: string | null;
  onJoin: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="ghl-card w-full max-w-lg p-8 text-center">
        <div className="mx-auto h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <UserPlus className="h-6 w-6 text-primary" />
        </div>
        <h1 className="mt-4 text-xl font-semibold">
          {pending.hasAccount ? "Join this workspace" : "Create your dispo account"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {pending.hasAccount
            ? "You're not part of this sub-account's workspace yet. Join it to start working its deals and buyers."
            : "You don't have a dispo account yet. Create one to start tracking deals, buyers and tasks with your team."}
        </p>

        <div className="mt-6 flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3 text-left">
          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">
              {pending.locationName || "This sub-account"}
            </div>
            <div className="text-[11px] font-mono text-muted-foreground truncate">
              {pending.locationId}
            </div>
          </div>
        </div>

        {pending.email && (
          <p className="mt-3 text-xs text-muted-foreground">
            {pending.hasAccount ? "Joining as " : "Your account will be created for "}
            <span className="font-medium">{pending.email}</span>.
          </p>
        )}

        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

        <Button className="mt-6 w-full" size="lg" disabled={joining} onClick={onJoin}>
          {joining && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          {joining ? "Setting up…" : pending.hasAccount ? "Join workspace" : "Create my account"}
        </Button>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Nothing is created until you click.
        </p>
      </div>
    </div>
  );
}
