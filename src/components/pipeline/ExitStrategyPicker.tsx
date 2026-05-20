import { useEffect, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { EXIT_STRATEGIES, EXIT_STRATEGY_MAP } from "./exitStrategies";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

function arraysEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  for (const k of a) if (!b.includes(k)) return false;
  return true;
}

export function ExitStrategyPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState<string[]>(value || []);
  // Ref mirrors latest local — read this in close/unmount handlers to avoid stale closures.
  const localRef = useRef<string[]>(value || []);
  const initialOnOpenRef = useRef<string[]>(value || []);
  const openRef = useRef(false);
  const onChangeRef = useRef(onChange);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { openRef.current = open; }, [open]);

  // Keep ref in lockstep with state.
  useEffect(() => {
    const prev = localRef.current;
    localRef.current = local;
    console.log("[ExitStrategyPicker local change]", { from: prev, to: local, refAfter: localRef.current });
  }, [local]);

  // Sync from parent only when closed.
  useEffect(() => {
    if (!open) {
      setLocal(value || []);
      localRef.current = value || [];
    }
  }, [value, open]);

  function commitFromRef(reason: string) {
    const before = initialOnOpenRef.current;
    const current = localRef.current;
    const changed = !arraysEqual(before, current);
    console.log("[ExitStrategyPicker close]", {
      reason,
      initial: before,
      localState: local,
      refValue: current,
      changed,
      willCallOnChange: changed,
    });
    if (changed) {
      onChangeRef.current(current);
      // Treat committed value as the new baseline so subsequent fallback commits don't double-fire.
      initialOnOpenRef.current = current;
    }
  }

  // Fallback commit on unmount (e.g., parent sheet closes while picker still open).
  useEffect(() => {
    return () => {
      if (openRef.current) commitFromRef("unmount");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(key: string) {
    setLocal((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      localRef.current = next; // update ref synchronously so rapid clicks see latest
      return next;
    });
  }

  function handleOpenChange(next: boolean) {
    if (next) {
      initialOnOpenRef.current = value || [];
      setLocal(value || []);
      localRef.current = value || [];
      console.log("[ExitStrategyPicker open]", { initialValue: value || [], setLocalTo: value || [] });
    } else {
      commitFromRef("openChange");
    }
    setOpen(next);
  }

  const selected = open ? local : value || [];

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full min-h-10 flex items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm hover:border-primary/40 transition-colors"
        >
          <div className="flex flex-wrap gap-1 flex-1">
            {selected.length === 0 ? (
              <span className="text-muted-foreground/70 text-sm">None selected</span>
            ) : (
              selected.map((k) => {
                const meta = EXIT_STRATEGY_MAP[k];
                return (
                  <span
                    key={k}
                    className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", meta?.cls)}
                  >
                    {meta?.label || k}
                  </span>
                );
              })
            )}
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-2"
        align="start"
        onInteractOutside={() => commitFromRef("interactOutside")}
        onEscapeKeyDown={() => commitFromRef("escape")}
      >
        <div className="space-y-0.5">
          {EXIT_STRATEGIES.map((s) => {
            const checked = local.includes(s.key);
            return (
              <label
                key={s.key}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm"
              >
                <Checkbox checked={checked} onCheckedChange={() => toggle(s.key)} />
                <span className="flex-1">{s.label}</span>
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
