"use client";

import { useMemo } from "react";
import { topoCss } from "@/lib/color";
import { peakChannel, regionOf, topoAt } from "@/lib/signal";
import type { Condition, SubjectBundle } from "@/lib/types";
import { useMonitor, useTime } from "@/state/monitor";

/**
 * Per-electrode alpha index, montage order. Bars are square-ended rather than
 * the house 4px-rounded data-end: this panel is instrument chrome and PRD §8
 * sets border radius to zero throughout. Everything else about the mark spec
 * holds — thin bars, one color, recessive track, values labeled at the tip.
 *
 * Bar color tracks the same ramp as the topomap so a row and a scalp position
 * read as the same measurement, which is the point of putting them adjacent.
 */
export function ChannelBars({
  bundle,
  condition,
}: {
  bundle: SubjectBundle;
  condition: Condition;
}) {
  const t = useTime(10);
  const { state, store } = useMonitor();
  const values = useMemo(() => new Float32Array(bundle.electrodes.length), [bundle.electrodes.length]);

  topoAt(bundle.conditions[condition], bundle.topoFs, t, values);
  const focus = state.focusChannel ?? peakChannel(values);

  return (
    <ul className="flex flex-col gap-[3px] p-3">
      {bundle.electrodes.map((electrode, i) => {
        const v = values[i];
        const isFocus = i === focus;
        return (
          <li key={electrode.label}>
            <button
              type="button"
              onClick={() => store.set({ focusChannel: state.focusChannel === i ? null : i })}
              className="flex w-full items-center gap-2 text-left"
              title={regionOf(electrode.label)}
            >
              <span
                className={`metric w-8 shrink-0 text-2xs ${isFocus ? "text-ink" : "text-ink-3"}`}
              >
                {electrode.label}
              </span>
              <span className="relative h-[7px] flex-1 bg-well">
                <span
                  className="absolute inset-y-0 left-0"
                  style={{ width: `${Math.max(1, v * 100)}%`, background: topoCss(v) }}
                />
              </span>
              <span
                className={`metric w-8 shrink-0 text-right text-2xs ${
                  isFocus ? "text-ink" : "text-ink-3"
                }`}
              >
                {v.toFixed(2)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
