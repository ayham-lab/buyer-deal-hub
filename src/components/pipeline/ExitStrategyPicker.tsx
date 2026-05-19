import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { EXIT_STRATEGIES, EXIT_STRATEGY_MAP } from "./exitStrategies";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

export function ExitStrategyPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = value || [];

  function toggle(key: string) {
    const next = selected.includes(key)
      ? selected.filter((k) => k !== key)
      : [...selected, key];
    onChange(next);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
      <PopoverContent className="w-64 p-2" align="start">
        <div className="space-y-0.5">
          {EXIT_STRATEGIES.map((s) => {
            const checked = selected.includes(s.key);
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
