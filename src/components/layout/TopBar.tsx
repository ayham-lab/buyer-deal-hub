import { Search, HelpCircle, Bell, ChevronDown, LogOut, Building2, ShieldCheck, UserCog } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
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
  const initial = (profile?.name || profile?.email || "?").slice(0, 1).toUpperCase();
  const locationLabel = profile?.ghl_location_id
    ? `Loc ${profile.ghl_location_id.slice(0, 8)}`
    : "Standalone";

  return (
    <header className="h-14 bg-card border-b border-border flex items-center px-4 gap-3 sticky top-0 z-20">
      {/* Location switcher */}
      <button className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-background hover:bg-muted text-sm transition-colors">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium truncate max-w-[160px]">{locationLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {/* Search */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search buyers, deals, addresses…"
          className="pl-9 h-9 bg-background"
        />
      </div>

      <div className="flex-1" />

      {/* Right actions */}
      {isAdmin && (
        <Link
          to="/admin"
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary/10 text-primary hover:bg-primary/20 text-xs font-semibold uppercase tracking-wider transition-colors"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Admin
        </Link>
      )}
      <button className="h-9 w-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted">
        <HelpCircle className="h-4 w-4" />
      </button>
      <button className="h-9 w-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted relative">
        <Bell className="h-4 w-4" />
        <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-md hover:bg-muted">
            <div className={`h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold ${isAdmin ? "ring-2 ring-primary/40" : ""}`}>
              {initial}
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="font-normal">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold truncate">{profile?.name || profile?.email || "User"}</div>
              {isAdmin && <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/15 text-primary">Admin</span>}
            </div>
            <div className="text-xs text-muted-foreground truncate">{profile?.email}</div>
          </DropdownMenuLabel>
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
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
