import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useActiveLocation } from "@/contexts/LocationContext";
import { Loader2 } from "lucide-react";

export function AppLayout({
  children,
  requireAdmin,
  standaloneOnly,
}: {
  children: ReactNode;
  requireAdmin?: boolean;
  standaloneOnly?: boolean;
}) {
  const { user, loading, isAdmin } = useAuth();
  const { isIframed } = useActiveLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  // Tenant pages (Dashboard / Buyers / Pipeline / Tasks / Settings tabs) all
  // depend on a Supabase session because their RLS policies match
  // auth.uid() = user_id. localStorage-backed Supabase sessions carry into
  // the GHL iframe at the same origin, so requiring `user` here works in
  // both standalone AND iframe. Bouncing to /login is safe: Login.tsx
  // detects iframe and redirects to /embed for the SSO handshake.
  if (!user) return <Navigate to="/login" replace />;
  // Account/workspace settings are for the standalone Lovable session only.
  if (standaloneOnly && isIframed) return <Navigate to="/" replace />;
  // Admin Console is a cross-tenant tool — never expose it inside a GHL iframe.
  if (requireAdmin && isIframed) return <Navigate to="/" replace />;
  if (requireAdmin && !isAdmin) return <Navigate to="/buyers" replace />;

  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  tabs,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  tabs?: ReactNode;
}) {
  return (
    <div className="bg-card border-b border-border sticky top-14 z-10">
      <div className="px-6 lg:px-8 pt-5 pb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      </div>
      {tabs && <div className="px-6 lg:px-8">{tabs}</div>}
    </div>
  );
}
