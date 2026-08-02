import { cn } from "@/lib/utils";

export type RangeMeterProps = {
  value: number | null;
  min: number;
  max: number;
  tone?: "emerald" | "amber";
  minLabel: string;
  maxLabel: string;
};

/** Slim animated fill bar showing where a value sits within its known range. */
export function RangeMeter({
  value,
  min,
  max,
  tone = "emerald",
  minLabel,
  maxLabel,
}: RangeMeterProps) {
  const pct =
    value === null ? 0 : Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  return (
    <div className="flex flex-col gap-1.5">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500 ease-out",
            tone === "amber"
              ? "bg-[var(--accent-amber)] shadow-[0_0_10px_var(--accent-amber)]"
              : "bg-[var(--accent-emerald)] shadow-[0_0_10px_var(--accent-emerald)]"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between font-mono text-[9px] tracking-[0.1em] text-[var(--text-muted)]">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  );
}
