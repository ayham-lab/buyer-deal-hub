import { HelpCircle, ChevronDown, LogOut, Building2, ShieldCheck, UserCog } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useActiveLocation } from "@/contexts/LocationContext";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { CreditsPill } from "@/components/credits/CreditsPill";
import { Link } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function TopBar() {
  const { profile, signOut, isAdmin } = useAuth();
  const { activeLocation, isIframed } = useActiveLocation();

  // In iframe mode the identity comes from the GHL SSO payload, never the
  // Lovable workspace user. Standalone keeps the Lovable user.
  const ghlName = activeLocation?.userName || null;
  const ghlEmail = activeLocation?.email || null;
  const ghlRole = activeLocation?.role || null;

  const displayName = isIframed ? ghlName : (profile?.name || null);
  const displayEmail = isIframed ? ghlEmail : (profile?.email || null);
  const displayBadge = isIframed
    ? (ghlRole ? ghlRole.toUpperCase() : null)
    : (isAdmin ? "ADMIN" : null);
  const showAdminUI = !isIframed && isAdmin;
  const initial = (displayName || displayEmail || "?").slice(0, 1).toUpperCase();

  const locationLabel = isIframed
    ? (activeLocation ? `Loc ${activeLocation.locationId.slice(0, 8)}` : "GHL")
    : (profile?.ghl_location_id ? `Loc ${profile.ghl_location_id.slice(0, 8)}` : "Standalone");

  return (
    <header className="h-14 bg-card border-b border-border flex items-center px-4 gap-3 sticky top-0 z-20">
      {/* Location switcher */}
      <button className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-background hover:bg-muted text-sm transition-colors">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium truncate max-w-[160px]">{locationLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      <div className="flex-1" />

      {/* Right actions */}
      {showAdminUI && (
        <Link
          to="/admin"
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary/10 text-primary hover:bg-primary/20 text-xs font-semibold uppercase tracking-wider transition-colors"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Admin
        </Link>
      )}
      <CreditsPill />
      <button className="h-9 w-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted">
        <HelpCircle className="h-4 w-4" />
      </button>
      <NotificationBell />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-md hover:bg-muted">
            <div className={`h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold ${displayBadge ? "ring-2 ring-primary/40" : ""}`}>
              {initial}
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="font-normal">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold truncate">{displayName || displayEmail || "User"}</div>
              {displayBadge && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                  {displayBadge}
                </span>
              )}
            </div>
            {displayEmail && (
              <div className="text-xs text-muted-foreground truncate">{displayEmail}</div>
            )}
            {isIframed && (
              <div className="text-[10px] text-muted-foreground/70 mt-1 uppercase tracking-wider">
                via GHL SSO
              </div>
            )}
          </DropdownMenuLabel>
          {!isIframed && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/profile" className="cursor-pointer">
                  <UserCog className="h-4 w-4 mr-2" /> Profile & Account
                </Link>
              </DropdownMenuItem>
              {isAdmin && (
                <DropdownMenuItem asChild>
                  <Link to="/admin" className="cursor-pointer">
                    <ShieldCheck className="h-4 w-4 mr-2 text-primary" /> Admin Console
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                <LogOut className="h-4 w-4 mr-2" /> Sign out
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

