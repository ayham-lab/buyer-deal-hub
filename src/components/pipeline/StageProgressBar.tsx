import { STATUS_COLS } from "./utils";
import { cn } from "@/lib/utils";

type Status = (typeof STATUS_COLS)[number]["id"];

export function StageProgressBar({
  value,
  onChange,
}: {
  value: Status | null | undefined;
  onChange: (s: Status) => void;
}) {
  const currentIdx = STATUS_COLS.findIndex((s) => s.id === value);
  return (
    <div className="flex w-full overflow-x-auto gap-0.5 py-1">
      {STATUS_COLS.map((s, i) => {
        const isCurrent = i === currentIdx;
        const isPast = currentIdx >= 0 && i < currentIdx;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(s.id)}
            title={s.label}
            className={cn(
              "relative flex-1 min-w-[88px] h-8 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap px-3 transition-colors",
              "first:rounded-l-md last:rounded-r-md",
              isCurrent
                ? "bg-primary text-primary-foreground"
                : isPast
                ? "bg-muted text-muted-foreground hover:bg-muted/80"
                : "bg-secondary text-muted-foreground hover:bg-secondary/70"
            )}
            style={{
              clipPath:
                i === STATUS_COLS.length - 1
                  ? "polygon(0 0, 100% 0, 100% 100%, 0 100%, 12px 50%)"
                  : i === 0
                  ? "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%)"
                  : "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%)",
            }}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
