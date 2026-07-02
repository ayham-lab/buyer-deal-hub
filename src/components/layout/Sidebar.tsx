import { NavLink, useLocation, Link, useNavigate, useSearchParams } from "react-router-dom";
import { Users, LayoutGrid, ShieldCheck, ChevronsLeft, ChevronsRight, Building2, UsersRound, Home, CheckSquare, Settings as SettingsIcon, GitBranch, Stamp, LayoutDashboard, Briefcase, Database, Landmark, UserCog, Tag, ScrollText } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useActiveLocation } from "@/contexts/LocationContext";
import { cn } from "@/lib/utils";
import { useState } from "react";
import logo from "@/assets/logo.png";
import { Launchpad } from "./Launchpad";

const items = [
  { to: "/", label: "Dashboard", icon: Home, exact: true },
  { to: "/pipeline", label: "Deal Pipeline", icon: LayoutGrid },
  { to: "/buyers", label: "Buyers", icon: Users },
  { to: "/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/title-companies", label: "Title Companies", icon: Building2 },
  { to: "/realtors", label: "Realtors", icon: UsersRound },
  { to: "/notaries", label: "Notaries", icon: Stamp },
  { to: "/settings/pipelines", label: "Pipeline Mapping", icon: GitBranch },
  { to: "/settings", label: "Settings", icon: SettingsIcon, exact: true },
];

export function Sidebar() {
  const { isAdmin, isSuperAdmin } = useAuth();
  const { isIframed, clearActiveLocation } = useActiveLocation();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const onAdmin = pathname.startsWith("/admin");
  const adminTab = searchParams.get("tab") || "overview";

  // Super-admins land in the Admin Console when they click the brand logo;
  // everyone else goes to the dashboard root.
  const goAdminView = (e?: React.MouseEvent) => {
    e?.preventDefault();
    clearActiveLocation();
    navigate("/admin");
  };
  const goHome = (e: React.MouseEvent) => {
    if (isAdmin && !isIframed) goAdminView(e);
  };

  type AdminLeaf = { value: string; label: string; icon: React.ComponentType<any>; show?: boolean };
  type AdminSection = { label?: string; items: AdminLeaf[] };
  type AdminGroup = { label?: string; sections: AdminSection[] };
  const adminNav: AdminGroup[] = [
    { sections: [{ items: [{ value: "overview", label: "Dashboard", icon: LayoutDashboard }] }] },
    { sections: [{ items: [{ value: "users", label: "Users & Roles", icon: Users }] }] },
    {
      label: "Database",
      sections: [
        {
          items: [
            { value: "deals", label: "Deals", icon: Briefcase },
            { value: "buyer_database", label: "Buyer Database", icon: Database, show: isAdmin },
            { value: "archive_title", label: "Archive Title Cos", icon: Landmark, show: isSuperAdmin },
            { value: "archive_realtors", label: "Archive Realtors", icon: Building2, show: isSuperAdmin },
            { value: "archive_notaries", label: "Archive Notaries", icon: Stamp, show: isSuperAdmin },
            { value: "operator_accounts", label: "Operator Accounts", icon: UserCog, show: isSuperAdmin },
          ],
        },
      ],
    },
    { sections: [{ items: [{ value: "pricing", label: "Pricing", icon: Tag }] }] },
    { sections: [{ items: [{ value: "audit_log", label: "Audit Log", icon: ScrollText }] }] },
  ];

  return (
    <aside
      className={cn(
        "shrink-0 bg-sidebar text-sidebar-foreground flex flex-col h-screen sticky top-0 transition-[width] duration-200",
        collapsed ? "w-[68px]" : "w-60"
      )}
    >
      {/* Logo */}
      <Link to={isAdmin && !isIframed ? "/admin" : "/"} onClick={goHome} className="h-14 flex items-center gap-3 px-4 border-b border-sidebar-border hover:bg-sidebar-accent/40 transition-colors">
        <img src={logo} alt="Logo" className="h-8 w-8 rounded-md shrink-0 object-contain" />
        {!collapsed && (
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight text-white truncate">Dispo Tool</div>
            <div className="text-[10px] text-sidebar-foreground/70 uppercase tracking-wider">AcquiredCRM</div>
          </div>
        )}
      </Link>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        <div className="pb-2 mb-2 border-b border-sidebar-border">
          <Launchpad collapsed={collapsed} />
        </div>
        {items.map((it) => {
          // Settings is now visible in iframe too — Settings.tsx filters tabs
          // (hides Profile + GHL Connections, shows Checklist/Team/Notifs).
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
              onClick={goAdminView}
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

            {/* Admin sub-nav — visible only while inside /admin */}
            {onAdmin && !collapsed && (
              <div className="mt-2 ml-2 pl-3 border-l border-sidebar-border space-y-3">
                {adminNav.map((group, gi) => {
                  const hasVisibleSection = group.sections.some((s) => s.items.some((i) => i.show !== false));
                  if (!hasVisibleSection) return null;
                  return (
                    <div key={gi}>
                      {group.label && (
                        <div className="px-2 pb-1 text-[10px] uppercase tracking-wider text-sidebar-foreground/50 font-semibold">
                          {group.label}
                        </div>
                      )}
                      <div className="space-y-2">
                        {group.sections.map((section, si) => {
                          const sectionItems = section.items.filter((i) => i.show !== false);
                          if (sectionItems.length === 0) return null;
                          return (
                            <div key={si}>
                              {section.label && (
                                <div className="px-2 pb-1 text-[10px] uppercase tracking-wider text-sidebar-foreground/50 font-semibold">
                                  {section.label}
                                </div>
                              )}
                              <div className="space-y-0.5">
                                {sectionItems.map((item) => {
                                  const Icon = item.icon;
                                  const active = adminTab === item.value;
                                  return (
                                    <button
                                      key={item.value}
                                      onClick={() => navigate(`/admin?tab=${item.value}`)}
                                      className={cn(
                                        "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] text-left transition-colors",
                                        active
                                          ? "bg-sidebar-accent text-white font-medium"
                                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-white"
                                      )}
                                    >
                                      <Icon className="h-3.5 w-3.5 shrink-0" />
                                      <span className="truncate">{item.label}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
