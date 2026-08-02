"use client";

import { DEPTH_BAND_LABEL, DEPTH_BAND_NOTE, depthBand, sdpAt } from "@/lib/signal";
import type { Condition, SubjectBundle } from "@/lib/types";
import { useTime } from "@/state/monitor";

/**
 * The hero number. PRD §8: "Numbers in a monospace face at a size that is
 * frankly too large. The number *is* the interface."
 *
 * Sampled at 12 Hz rather than every frame — a monitor readout that updates
 * 60 times a second is unreadable, and real ones don't.
 *
 * Tabular figures on purpose: this value changes continuously, and
 * proportional digits make it shimmer as the glyph widths change.
 */
export function SdpReadout({
  bundle,
  condition,
  size = "hero",
}: {
  bundle: SubjectBundle;
  condition: Condition;
  size?: "hero" | "compact";
}) {
  const t = useTime(12);
  const value = sdpAt(bundle.conditions[condition], bundle.sdpFs, t);
  const band = depthBand(value);

  return (
    <div className="flex h-full flex-col justify-between gap-2 p-3">
      <div className="flex items-baseline justify-between">
        <span className="eyebrow">SDP</span>
        <span className="readout text-2xs text-ink-3">0–100</span>
      </div>

      <div className="flex items-end gap-2">
        <span
          className={`readout font-medium leading-none text-signal ${
            size === "hero" ? "text-[5.5rem] sm:text-[7rem]" : "text-5xl"
          }`}
        >
          {value.toFixed(0)}
        </span>
      </div>

      <div className="border-t border-rule pt-2">
        <p className="readout text-sm uppercase tracking-widest text-ink">
          {DEPTH_BAND_LABEL[band]}
        </p>
        <p className="mt-1 text-2xs text-ink-2">{DEPTH_BAND_NOTE[band]}</p>
        <p className="mt-2 eyebrow text-ink-3">spectral proxy, not BIS</p>
      </div>
    </div>
  );
}
