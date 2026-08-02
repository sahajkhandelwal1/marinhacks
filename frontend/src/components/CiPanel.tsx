"use client";

import { sampleSeries } from "@/lib/signal";
import type { Condition, SubjectBundle } from "@/lib/types";
import { useTime } from "@/state/monitor";

/**
 * The Coupling Index panel.
 *
 * `ci` is null in every shipped file and this greyed panel is the intended
 * end state, not a placeholder (PRD §6). Tier 1 is confirmed dead on the
 * public Chennu release: its events.tsv carries only 10-second epoch
 * boundaries, so there is no stimulus timing to regress EEG against.
 *
 * It is also the argument. NOT MEASURED is exactly what every monitor in
 * every operating room reports for this quantity today.
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
      <div className="flex h-full flex-col justify-between gap-2 p-3">
        <div className="flex items-baseline justify-between">
          <span className="eyebrow">CI — coupling index</span>
          <span className="readout text-2xs text-ink-3">0–1</span>
        </div>

        <div className="flex items-end">
          {/* Where the number would be. A single rule, not a row of dashes —
              two em-dashes at this size render as a solid bar and read as a
              filled meter, i.e. as data. */}
          <span className="mb-6 block h-px w-14 bg-ink-3" aria-label="no value" />
        </div>

        <div className="border-t border-rule pt-2">
          <p className="readout text-base uppercase tracking-widest text-ink-2">not measured</p>
          <p className="mt-1 text-2xs text-ink-2">
            needs stimulus-locked audio; the public release has none
          </p>
          <p className="mt-2 eyebrow text-ink-3">what every OR reports today</p>
        </div>
      </div>
    );
  }

  // Live branch: unreachable with today's fixtures, kept so a Tier 1 emitter
  // lights this panel up with no frontend change.
  const value = sampleSeries(ci.map((v) => v ?? 0), t * bundle.sdpFs);

  return (
    <div className="flex h-full flex-col justify-between gap-2 p-3">
      <div className="flex items-baseline justify-between">
        <span className="eyebrow">CI — coupling index</span>
        <span className="readout text-2xs text-ink-3">0–1</span>
      </div>

      <div className="flex items-end">
        <span className="readout text-[5.5rem] font-medium leading-none text-alarm sm:text-[7rem]">
          {value.toFixed(2)}
        </span>
      </div>

      <div className="border-t border-rule pt-2">
        <p className="readout text-sm uppercase tracking-widest text-ink">
          {value > 0.5 ? "tracking the room" : "decoupled"}
        </p>
        <p className="mt-1 text-2xs text-ink-2">fraction of this patient&apos;s own baseline coupling</p>
      </div>
    </div>
  );
}
