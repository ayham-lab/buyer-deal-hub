import { NavLink, useLocation } from "react-router-dom";
import { Users, Search, LayoutGrid, BarChart3, ShieldCheck, ChevronsLeft, ChevronsRight, Building2, UsersRound, Home, CheckSquare, Settings as SettingsIcon, GitBranch, Lock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useActiveLocation } from "@/contexts/LocationContext";
import { cn } from "@/lib/utils";
import { useState } from "react";
import logo from "@/assets/logo.png";

const items = [
  { to: "/", label: "Dashboard", icon: Home, exact: true },
  { to: "/kpis", label: "KPI Dashboard", icon: BarChart3 },
  { to: "/finder", label: "Buyer Finder", icon: Search },
  { to: "/pipeline", label: "Deal Pipeline", icon: LayoutGrid },
  { to: "/buyers", label: "Buyer Rolodex", icon: Users },
  { to: "/archive", label: "Archive", icon: Lock },
  { to: "/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/title-companies", label: "Title Companies", icon: Building2 },
  { to: "/team", label: "Team", icon: UsersRound },
  { to: "/settings/pipelines", label: "Pipeline Mapping", icon: GitBranch },
  { to: "/settings", label: "Settings", icon: SettingsIcon, exact: true },
];

export function Sidebar() {
  const { isAdmin } = useAuth();
  const { isIframed } = useActiveLocation();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "shrink-0 bg-sidebar text-sidebar-foreground flex flex-col h-screen sticky top-0 transition-[width] duration-200",
        collapsed ? "w-[68px]" : "w-60"
      )}
    >
      {/* Logo */}
      <div className="h-14 flex items-center gap-3 px-4 border-b border-sidebar-border">
        <img src={logo} alt="Logo" className="h-8 w-8 rounded-md shrink-0 object-contain" />
        {!collapsed && (
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight text-white truncate">Dispo Tool</div>
            <div className="text-[10px] text-sidebar-foreground/70 uppercase tracking-wider">AcquiredCRM</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {items.filter((it) => {
          // In iframe, hide all /settings routes EXCEPT /settings/pipelines
          // (Pipeline Mapping is per-location and safe for tenant members).
          if (!isIframed) return true;
          if (it.to === "/settings/pipelines") return true;
          return !it.to.startsWith("/settings");
        }).map((it) => {
          const active = it.exact ? pathname === it.to : pathname.startsWith(it.to);
          return (
            <NavLink
              key={it.to}
              to={it.to}
              title={collapsed ? it.label : undefined}
              className={cn(
                "relative flex items-center gap-3 px-3 py-2 rounded-md text-[13px] font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-white"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-white"
              )}
            >
              {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-primary rounded-r" />}
              <it.icon className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span className="truncate">{it.label}</span>}
            </NavLink>
          );
        })}
        {isAdmin && !isIframed && (
          <div className="pt-3 mt-3 border-t border-sidebar-border">
            {!collapsed && (
              <div className="px-3 pb-1 text-[10px] uppercase tracking-wider text-sidebar-foreground/60 font-semibold">
                Admin
              </div>
            )}
            <NavLink
              to="/admin"
              title={collapsed ? "Admin Console" : undefined}
              className={cn(
                "relative flex items-center gap-3 px-3 py-2 rounded-md text-[13px] font-medium transition-colors",
                pathname.startsWith("/admin")
                  ? "bg-primary/15 text-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-white"
              )}
            >
              {pathname.startsWith("/admin") && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-primary rounded-r" />}
              <ShieldCheck className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span className="truncate">Admin Console</span>}
            </NavLink>
          </div>
        )}
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-sidebar-border p-2">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-white text-xs"
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : (<><ChevronsLeft className="h-4 w-4" /> Collapse</>)}
        </button>
      </div>
    </aside>
  );
}
