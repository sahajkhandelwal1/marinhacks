"use client";

import { sampleSeries } from "@/lib/signal";
import type { Condition, SubjectBundle } from "@/lib/types";
import { useTime } from "@/state/monitor";

/**
 * The Coupling Index panel.
 *
 * `ci` is null in every shipped file and this greyed panel is the intended end
 * state, not a placeholder (PRD §6). Tier 1 is confirmed dead on the public
 * Chennu release: its events.tsv carries only 10-second epoch boundaries, so
 * there is no stimulus timing to regress EEG against.
 *
 * It is also the argument. NOT MEASURED is exactly what every monitor in every
 * operating room reports for this quantity today.
 */
export function CiPanel({
  bundle,
  condition,
}: {
  bundle: SubjectBundle;
  condition: Condition;
}) {
  const ci = bundle.conditions[condition].ci;
  const t = useTime(12);

  if (!ci) {
    return (
      <div className="flex h-full flex-col justify-between gap-3 p-4">
        <div className="flex items-baseline justify-between">
          <span className="panel-title text-ink-2">CI</span>
          <span className="label">0–1</span>
        </div>

        {/* Where the number would be. A single rule, not a row of dashes —
            em-dashes at this size render as a solid bar and read as a filled
            meter, i.e. as data. */}
        <span className="mb-5 block h-0.5 w-16 rounded bg-rule-strong" aria-label="no value" />

        <div className="border-t border-rule pt-3">
          <p className="status text-ink-2">not measured</p>
          <p className="mt-1.5 text-2xs leading-relaxed text-ink-2">
            needs stimulus-locked audio; the public release has none
          </p>
          <p className="mt-2 text-2xs text-ink-3">what every OR reports today</p>
        </div>
      </div>
    );
  }

  // Live branch: unreachable with today's fixtures, kept so a Tier 1 emitter
  // lights this panel up with no frontend change.
  const value = sampleSeries(ci.map((v) => v ?? 0), t * bundle.sdpFs);

  return (
    <div className="flex h-full flex-col justify-between gap-3 p-4">
      <div className="flex items-baseline justify-between">
        <span className="panel-title">CI</span>
        <span className="label">0–1</span>
      </div>

      <p className="metric-hero text-[4.5rem] text-ink sm:text-[5.25rem]">{value.toFixed(2)}</p>

      <div className="border-t border-rule pt-3">
        <p className="status text-alert-text">
          {value > 0.5 ? "tracking the room" : "decoupled"}
        </p>
        <p className="mt-1.5 text-2xs leading-relaxed text-ink-2">
          fraction of this patient&apos;s own baseline coupling
        </p>
      </div>
    </div>
  );
}
