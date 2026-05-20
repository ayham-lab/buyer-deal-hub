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
  // Dedupe: once we've committed for the current open session, ignore further close events.
  const savedThisSessionRef = useRef(false);
  // Track previous open value so we only re-sync from value on the open transition (false → true).
  const prevOpenRef = useRef(false);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { openRef.current = open; }, [open]);

  // Keep ref in lockstep with state.
  useEffect(() => {
    const prev = localRef.current;
    localRef.current = local;
    console.log("[ExitStrategyPicker local change]", { from: prev, to: local, refAfter: localRef.current });
  }, [local]);

  // Architectural fix (C): only sync from parent on the open transition. Once open=false,
  // we do NOT react to value changes — this prevents a stale parent refetch from clobbering
  // our just-committed local state and re-saving the pre-save value.
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (open && !wasOpen) {
      // Opening: reseed from parent.
      initialOnOpenRef.current = value || [];
      setLocal(value || []);
      localRef.current = value || [];
      savedThisSessionRef.current = false;
      console.log("[ExitStrategyPicker open]", { initialValue: value || [], setLocalTo: value || [] });
    }
  }, [open, value]);

  function commitFromRef(reason: string) {
    if (savedThisSessionRef.current) {
      console.log("[ExitStrategyPicker close skipped]", { reason, why: "already saved this session" });
      return;
    }
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
    // Mark as saved regardless of whether the value changed — we've handled this close.
    savedThisSessionRef.current = true;
    if (changed) {
      onChangeRef.current(current);
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
      localRef.current = next;
      return next;
    });
  }

  function handleOpenChange(next: boolean) {
    if (!next && openRef.current) {
      // True open → close transition. Commit once.
      commitFromRef("openChange");
    }
    setOpen(next);
  }

  // While open, render from local. While closed, render from local too (we don't trust
  // the value prop to be fresh — it may arrive stale before the DB commit completes).
  const selected = open ? local : (savedThisSessionRef.current ? local : (value || []));

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
