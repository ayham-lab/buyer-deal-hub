import { Building2, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface PendingActivation {
  locationId: string;
  locationName: string | null;
  email: string | null;
  userName: string | null;
}

/**
 * Shown inside the GHL iframe when a sub-account has the app installed but no
 * workspace here yet. Installing no longer auto-creates accounts — a real
 * person has to opt in from this screen.
 */
export function ActivateWorkspace({
  pending,
  activating,
  error,
  onActivate,
}: {
  pending: PendingActivation;
  activating: boolean;
  error: string | null;
  onActivate: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="ghl-card w-full max-w-lg p-8 text-center">
        <div className="mx-auto h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <Sparkles className="h-6 w-6 text-primary" />
        </div>
        <h1 className="mt-4 text-xl font-semibold">Set up your dispo workspace</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This sub-account doesn't have a workspace yet. Activate it to start
          tracking deals, buyers and tasks — you'll become its owner and can
          invite your team afterwards.
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
            Your account will be created for <span className="font-medium">{pending.email}</span>.
          </p>
        )}

        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

        <Button className="mt-6 w-full" size="lg" disabled={activating} onClick={onActivate}>
          {activating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          {activating ? "Activating…" : "Activate workspace"}
        </Button>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Nothing is created until you click activate.
        </p>
      </div>
    </div>
  );
}
