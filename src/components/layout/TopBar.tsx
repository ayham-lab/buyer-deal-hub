import { HelpCircle, ChevronDown, LogOut, Building2, ShieldCheck, UserCog, Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useActiveLocation } from "@/contexts/LocationContext";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { CreditsPill } from "@/components/credits/CreditsPill";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface MembershipOption {
  location_id: string;
  location_name: string | null;
  is_owner: boolean;
}

export function TopBar() {
  const { profile, signOut, isAdmin, isSuperAdmin, user } = useAuth();
  const { activeLocation, isIframed } = useActiveLocation();
  const [memberships, setMemberships] = useState<MembershipOption[] | null>(null);
  const [loadingMemberships, setLoadingMemberships] = useState(false);
  const [iframeLocationName, setIframeLocationName] = useState<string | null>(null);

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

  const activeLocationId = activeLocation?.locationId ?? null;
  const activeMembership = memberships?.find((m) => m.location_id === activeLocationId) ?? null;
  const locationLabel = isIframed
    ? (activeLocation ? (iframeLocationName ?? "Unnamed location") : "GHL")
    : activeMembership?.location_name
      || (activeLocationId
        ? "Unnamed location"
        : (isSuperAdmin ? "Admin view" : "Select workspace"));

  // Iframe: fetch friendly name from ghl_location_tokens for the active loc.
  useEffect(() => {
    if (!isIframed || !activeLocationId) {
      setIframeLocationName(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("ghl_location_tokens")
        .select("location_name")
        .eq("ghl_location_id", activeLocationId)
        .maybeSingle();
      if (!cancelled) setIframeLocationName((data as any)?.location_name ?? null);
    })();
    return () => { cancelled = true; };
  }, [isIframed, activeLocationId]);


  async function loadMemberships() {
    if (isIframed || !user) return;
    setLoadingMemberships(true);
    const { data: rows } = await supabase
      .from("location_memberships")
      .select("location_id, is_owner")
      .eq("user_id", user.id)
      .order("is_owner", { ascending: false });
    const byId = new Map<string, MembershipOption>();
    (rows ?? []).forEach((r: any) => {
      byId.set(r.location_id, { location_id: r.location_id, location_name: null, is_owner: r.is_owner });
    });
    // Super-admins see every connected location, even if not a member.
    if (isSuperAdmin) {
      const { data: allTokens } = await supabase
        .from("ghl_location_tokens")
        .select("ghl_location_id, location_name");
      (allTokens ?? []).forEach((t: any) => {
        if (!t.ghl_location_id) return;
        const existing = byId.get(t.ghl_location_id);
        if (existing) {
          existing.location_name = existing.location_name ?? t.location_name ?? null;
        } else {
          byId.set(t.ghl_location_id, {
            location_id: t.ghl_location_id,
            location_name: t.location_name ?? null,
            is_owner: false,
          });
        }
      });
    }
    // Single query to fetch all friendly names
    const ids = Array.from(byId.keys());
    if (ids.length > 0) {
      const { data: tokens } = await supabase
        .from("ghl_location_tokens")
        .select("ghl_location_id, location_name")
        .in("ghl_location_id", ids);
      (tokens ?? []).forEach((t: any) => {
        const e = byId.get(t.ghl_location_id);
        if (e) e.location_name = t.location_name ?? null;
      });
    }
    const opts = Array.from(byId.values()).sort((a, b) => Number(b.is_owner) - Number(a.is_owner));
    setMemberships(opts);
    setLoadingMemberships(false);

    // Don't get stuck with no active location: standalone non-super-admin
    // users with at least one workspace get auto-switched to their first one.
    // Super-admins are intentionally allowed a "no active location" state
    // (Admin view) so they can land on /admin without picking a workspace.
    if (!activeLocationId && opts.length > 0 && !isSuperAdmin) {
      try {
        sessionStorage.setItem(
          "ghl_active_location",
          JSON.stringify({ locationId: opts[0].location_id, companyId: null }),
        );
      } catch {}
      window.location.reload();
    }
  }

  useEffect(() => {
    if (!isIframed && user && memberships === null) {
      loadMemberships();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isIframed, isSuperAdmin]);

  function pickLocation(locationId: string) {
    if (locationId === activeLocationId) return;
    try {
      sessionStorage.setItem(
        "ghl_active_location",
        JSON.stringify({ locationId, companyId: null }),
      );
    } catch {}
    window.location.reload();
  }

  function pickAdminView() {
    clearActiveLocation();
    navigate("/admin");
  }

  return (
    <header className="h-14 bg-card border-b border-border flex items-center px-4 gap-3 sticky top-0 z-20">
      {/* Location switcher */}
      {isIframed ? (
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-background text-sm">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium truncate max-w-[160px]">{locationLabel}</span>
        </div>
      ) : (
        <DropdownMenu onOpenChange={(o) => { if (o) loadMemberships(); }}>
          <DropdownMenuTrigger asChild>
            <button className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-background hover:bg-muted text-sm transition-colors">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium truncate max-w-[200px]">{locationLabel}</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuLabel>Switch workspace</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {isSuperAdmin && (
              <>
                <DropdownMenuItem onClick={pickAdminView} className="cursor-pointer">
                  <div className="flex items-center gap-2 w-full">
                    <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">
                        Admin view
                        <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-blue-500">
                          All workspaces
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Cross-tenant Admin Console
                      </div>
                    </div>
                    {!activeLocationId && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </div>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            {loadingMemberships && (
              <div className="px-2 py-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
              </div>
            )}
            {!loadingMemberships && memberships && memberships.length === 0 && (
              <div className="px-2 py-3 text-xs text-muted-foreground">
                You're not a member of any workspace yet.
              </div>
            )}
            {!loadingMemberships && memberships?.map((m) => {
              const active = m.location_id === activeLocationId;
              return (
                <DropdownMenuItem
                  key={m.location_id}
                  onClick={() => pickLocation(m.location_id)}
                  className="cursor-pointer"
                >
                  <div className="flex items-center gap-2 w-full">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {m.location_name ?? `Loc ${m.location_id.slice(0, 8)}`}
                        {m.is_owner && (
                          <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-primary">
                            Owner
                          </span>
                        )}
                        {!m.is_owner && isSuperAdmin && (
                          <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-blue-500">
                            Admin
                          </span>
                        )}
                      </div>
                      {m.location_name && (
                        <div className="text-[10px] font-mono text-muted-foreground truncate">
                          {m.location_id}
                        </div>
                      )}
                    </div>
                    {active && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </div>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

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

