import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Rocket,
  Check,
  Users,
  Building2,
  GitBranch,
  LayoutGrid,
  CheckSquare,
  CreditCard,
  UsersRound,
  PlayCircle,
  ExternalLink,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

type Item = {
  id: string;
  label: string;
  desc: string;
  to: string;
  icon: any;
};

const ITEMS: Item[] = [
  {
    id: "import_buyers",
    label: "Import your buyer list",
    desc: "Upload your existing cash buyers so deals can match instantly.",
    to: "/buyers?import=1",
    icon: Users,
  },
  {
    id: "import_title",
    label: "Add your title companies & attorneys",
    desc: "Build your closing rolodex — search the shared archive or add your own.",
    to: "/title-companies",
    icon: Building2,
  },
  {
    id: "connect_crm",
    label: "Connect your CRM (GHL)",
    desc: "Map pipelines so opportunities sync into Dispo automatically.",
    to: "/settings/pipelines",
    icon: GitBranch,
  },
  {
    id: "add_team",
    label: "Add your team (Acq, VA, Dispo)",
    desc: "Invite teammates and set their roles so assignments work end-to-end.",
    to: "/settings?tab=team",
    icon: UsersRound,
  },
  {
    id: "configure_checklist",
    label: "Configure your deal checklist",
    desc: "Set the default tasks (with due-date presets) that seed every new deal.",
    to: "/settings?tab=checklist",
    icon: CheckSquare,
  },
  {
    id: "add_deal",
    label: "Add your first deal",
    desc: "Drop a property in the pipeline and watch the matching engine fire.",
    to: "/pipeline",
    icon: LayoutGrid,
  },
  {
    id: "billing",
    label: "Add a card on file",
    desc: "Required for credits, buyer pulls, and premium add-ons.",
    to: "/settings?tab=billing",
    icon: CreditCard,
  },
];

// Optional: drop a real walkthrough URL here later. Keep YouTube/Loom embed-ready.
const WALKTHROUGH_VIDEO_URL = "";

function storageKey(uid?: string) {
  return `launchpad:done:${uid ?? "anon"}`;
}

function useDone(uid?: string) {
  const [done, setDone] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(uid));
      setDone(raw ? JSON.parse(raw) : {});
    } catch {
      setDone({});
    }
  }, [uid]);
  const toggle = (id: string) => {
    setDone((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(storageKey(uid), JSON.stringify(next));
      } catch {}
      return next;
    });
  };
  return { done, toggle };
}

export function Launchpad({ collapsed }: { collapsed: boolean }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const { done, toggle } = useDone(user?.id);

  const completed = useMemo(
    () => ITEMS.filter((i) => done[i.id]).length,
    [done]
  );
  const pct = Math.round((completed / ITEMS.length) * 100);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          title={collapsed ? "Launchpad" : undefined}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-md text-[13px] font-medium transition-colors",
            "bg-primary/10 hover:bg-primary/20 text-white border border-primary/30"
          )}
        >
          <Rocket className="h-[18px] w-[18px] shrink-0 text-primary" />
          {!collapsed && (
            <div className="min-w-0 flex-1 text-left">
              <div className="truncate">Launchpad</div>
              <div className="mt-1 h-1 rounded bg-sidebar-accent/60 overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}
          {!collapsed && (
            <span className="text-[10px] text-sidebar-foreground/70 shrink-0">
              {completed}/{ITEMS.length}
            </span>
          )}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            Welcome to Dispo Tool — Launchpad
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Your setup progress</span>
            <span>
              {completed} of {ITEMS.length} complete ({pct}%)
            </span>
          </div>
          <Progress value={pct} className="h-2" />
        </div>

        <div className="mt-4 space-y-2">
          {ITEMS.map((it) => {
            const isDone = !!done[it.id];
            const Icon = it.icon;
            return (
              <div
                key={it.id}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-md border transition-colors",
                  isDone
                    ? "bg-muted/50 border-border"
                    : "bg-card border-border hover:border-primary/40"
                )}
              >
                <button
                  onClick={() => toggle(it.id)}
                  className={cn(
                    "mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                    isDone
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-muted-foreground/40 hover:border-primary"
                  )}
                  aria-label={isDone ? "Mark incomplete" : "Mark complete"}
                >
                  {isDone && <Check className="h-3 w-3" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span
                      className={cn(
                        "text-sm font-medium",
                        isDone && "line-through text-muted-foreground"
                      )}
                    >
                      {it.label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {it.desc}
                  </p>
                </div>
                <Link
                  to={it.to}
                  onClick={() => setOpen(false)}
                  className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  Open <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            );
          })}
        </div>

        <div className="mt-6 border-t pt-4">
          <div className="flex items-center gap-2 mb-2">
            <PlayCircle className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Product walkthrough</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            A guided tour of Dispo CRM — pipeline, buyers, title companies, and how it
            all ties together.
          </p>
          <div className="aspect-video w-full rounded-md overflow-hidden bg-muted border border-border flex items-center justify-center">
            {WALKTHROUGH_VIDEO_URL ? (
              <iframe
                src={WALKTHROUGH_VIDEO_URL}
                title="Dispo CRM walkthrough"
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <div className="text-center text-muted-foreground text-sm p-6">
                <PlayCircle className="h-10 w-10 mx-auto mb-2 opacity-50" />
                Walkthrough video coming soon
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
