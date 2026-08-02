import { cn } from "@/lib/utils";
import { RangeMeter } from "@/components/RangeMeter";

export type MetricReadoutProps = {
  title: string;
  subtitle: string;
  value: number | null;
  unit?: string;
  fallback?: {
    label: string;
    sublabel: string;
  };
  status?: string;
  statusTone?: "emerald" | "amber";
  isAmber?: boolean;
  range?: { min: number; max: number; minLabel: string; maxLabel: string };
};

export function MetricReadout({
  title,
  subtitle,
  value,
  unit,
  fallback,
  status,
  statusTone = "emerald",
  isAmber = false,
  range,
}: MetricReadoutProps) {
  return (
    <div
      className={cn(
        "relative flex min-h-[240px] flex-col justify-between overflow-hidden rounded-2xl border p-5 backdrop-blur-md",
        "shadow-[0_20px_60px_-25px_rgba(0,0,0,0.7)] transition-colors duration-300",
        isAmber
          ? "border-[var(--border-alert)] bg-[var(--bg-panel-alert)]"
          : "border-[var(--border-hairline)] bg-[var(--bg-panel)]"
      )}
    >
      {/* Header */}
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <h2 className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-primary)]">
            {title}
          </h2>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">
            {subtitle}
          </p>
        </div>
      </div>

      {/* Value */}
      <div className="flex flex-col gap-4">
        {value === null ? (
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-xl font-semibold tracking-wider text-[var(--accent-amber)]">
              {fallback?.label ?? "[ NO DATA ]"}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">
              {fallback?.sublabel ?? ""}
            </span>
          </div>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-6xl font-semibold tabular-nums leading-none tracking-tight text-[var(--text-primary)] md:text-7xl">
                {value.toFixed(2)}
              </span>
              {unit && (
                <span className="font-sans text-sm font-medium tracking-[0.15em] text-[var(--text-muted)]">
                  {unit}
                </span>
              )}
            </div>
            {range && (
              <RangeMeter
                value={value}
                min={range.min}
                max={range.max}
                minLabel={range.minLabel}
                maxLabel={range.maxLabel}
                tone={statusTone}
              />
            )}
          </>
        )}
      </div>

      {/* Status pill */}
      {status && (
        <div className="mt-4">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px] tracking-[0.12em] transition-colors duration-300",
              statusTone === "amber"
                ? "border-[var(--accent-amber-a40)] bg-[var(--accent-amber-a10)] text-[var(--accent-amber)]"
                : "border-[var(--accent-emerald-a30)] bg-[var(--accent-emerald-a10)] text-[var(--accent-emerald)]"
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full bg-current",
                statusTone === "amber"
                  ? "shadow-[0_0_14px_currentColor]"
                  : "shadow-[0_0_8px_currentColor]"
              )}
            />
            {status}
          </span>
        </div>
      )}
    </div>
  );
}
