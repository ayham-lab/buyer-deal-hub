import { NavLink, useLocation } from "react-router-dom";
import { Users, Search, LayoutGrid, BarChart3, ShieldCheck, Settings, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const items = [
  { to: "/kpis", label: "KPI Dashboard", icon: BarChart3 },
  { to: "/finder", label: "Buyer Finder", icon: Search },
  { to: "/pipeline", label: "Deal Pipeline", icon: LayoutGrid },
  { to: "/buyers", label: "Buyer Rolodex", icon: Users },
];

export function Sidebar() {
  const { profile, isAdmin, signOut } = useAuth();
  const { pathname } = useLocation();

  return (
    <aside className="w-60 shrink-0 bg-sidebar border-r border-border flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-5 border-b border-border">
        <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center font-bold text-primary-foreground">
          D
        </div>
        <div>
          <div className="text-sm font-bold leading-tight">Dispo Tool</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">AcquiredCRM</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2 space-y-1">
        {items.map((it) => {
          const active = pathname.startsWith(it.to);
          return (
            <NavLink
              key={it.to}
              to={it.to}
              className={cn(
                "relative flex items-center gap-3 px-4 py-2.5 rounded-md text-sm transition-colors",
                active ? "text-foreground bg-secondary" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
              )}
            >
              {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-primary rounded-r" />}
              <it.icon className="h-4 w-4" />
              {it.label}
            </NavLink>
          );
        })}
        {isAdmin && (
          <NavLink
            to="/admin"
            className={({ isActive }) => cn(
              "relative flex items-center gap-3 px-4 py-2.5 rounded-md text-sm transition-colors",
              isActive ? "text-foreground bg-secondary" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
            )}
          >
            {pathname.startsWith("/admin") && <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-primary rounded-r" />}
            <ShieldCheck className="h-4 w-4" />
            Admin
          </NavLink>
        )}
      </nav>

      {/* Footer user */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="h-9 w-9 rounded-full bg-secondary border border-border flex items-center justify-center text-sm font-semibold">
            {(profile?.name || profile?.email || "?").slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{profile?.name || profile?.email}</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {profile?.ghl_location_id ? `Loc ${profile.ghl_location_id.slice(0, 8)}` : "Standalone"}
            </div>
          </div>
          <button
            onClick={signOut}
            className="text-muted-foreground hover:text-foreground p-1.5 rounded"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
