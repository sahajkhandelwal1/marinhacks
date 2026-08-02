"use client";

import { CONDITIONS, CONDITION_LABEL, type SubjectBundle } from "@/lib/types";
import { useMonitor } from "@/state/monitor";

/**
 * Anesthetic depth. PRD §8: "The slider is the product. One control, labeled
 * anesthetic depth, scrubbing through the four conditions."
 *
 * A real <input type=range> under the rail, so it is keyboard- and
 * screen-reader-operable rather than a div that only responds to a mouse —
 * a judge will drag this, but the person after them may tab to it.
 */
export function DepthSlider({ bundle }: { bundle: SubjectBundle | null }) {
  const { state, store } = useMonitor();
  const index = CONDITIONS.indexOf(state.condition);

  return (
    <div className="px-4 py-3.5">
      <div className="flex items-baseline justify-between">
        <span className="panel-title">Anesthetic depth</span>
        <span className="text-2xs text-ink-2">
          propofol target ·{" "}
          <span className="metric font-semibold text-ink">
            {bundle?.conditions[state.condition].drugConcentration != null
              ? `${bundle.conditions[state.condition].drugConcentration!.toFixed(1)} µg/mL`
              : "unknown"}
          </span>
        </span>
      </div>

      <div className="relative mt-4">
        <div className="absolute inset-x-0 top-[7px] h-0.5 rounded-full bg-rule" />
        <div className="relative flex justify-between">
          {CONDITIONS.map((c, i) => {
            const active = i === index;
            return (
              <button
                key={c}
                type="button"
                onClick={() => store.set({ condition: c })}
                className="group flex flex-col items-center gap-2"
                aria-pressed={active}
                aria-label={`${CONDITION_LABEL[c]} sedation`}
              >
                <span
                  className={`h-4 w-4 rounded-full border-2 border-surface transition-colors ${
                    active ? "bg-accent shadow-card" : "bg-rule-strong group-hover:bg-ink-3"
                  }`}
                />
                <span
                  className={`text-2xs font-semibold ${
                    active ? "text-ink" : "text-ink-3 group-hover:text-ink-2"
                  }`}
                >
                  {CONDITION_LABEL[c]}
                </span>
                <span className="metric text-2xs text-ink-3">
                  {bundle && bundle.conditions[c].drugConcentration != null
                    ? bundle.conditions[c].drugConcentration!.toFixed(1)
                    : "—"}
                </span>
              </button>
            );
          })}
        </div>

        <input
          className="scrub absolute inset-x-0 top-0 h-[18px] opacity-0"
          type="range"
          min={0}
          max={CONDITIONS.length - 1}
          step={1}
          value={index}
          onChange={(e) => store.set({ condition: CONDITIONS[Number(e.target.value)] })}
          aria-label="Anesthetic depth"
          aria-valuetext={CONDITION_LABEL[state.condition]}
        />
      </div>
    </div>
  );
}
