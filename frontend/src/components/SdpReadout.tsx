"use client";

import { DEPTH_BAND_LABEL, DEPTH_BAND_NOTE, depthBand, sdpAt } from "@/lib/signal";
import type { Condition, SubjectBundle } from "@/lib/types";
import { useTime } from "@/state/monitor";

/**
 * The hero number. Sampled at 12 Hz rather than every frame — a readout that
 * updates 60 times a second is unreadable, and real monitors don't.
 *
 * Tabular figures on purpose: this value changes continuously, and
 * proportional digits make it shimmer as glyph widths change.
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
    <div className="flex h-full flex-col justify-between gap-3 p-4">
      <div className="flex items-baseline justify-between">
        <span className="panel-title">SDP</span>
        <span className="label">0–100</span>
      </div>

      <p
        className={`metric-hero text-ink ${
          size === "hero" ? "text-[4.5rem] sm:text-[5.25rem]" : "text-5xl"
        }`}
      >
        {value.toFixed(0)}
      </p>

      <div className="border-t border-rule pt-3">
        <p className="status text-accent-text">{DEPTH_BAND_LABEL[band]}</p>
        <p className="mt-1.5 text-2xs leading-relaxed text-ink-2">{DEPTH_BAND_NOTE[band]}</p>
        <p className="mt-2 text-2xs text-ink-3">spectral proxy, not BIS</p>
      </div>
    </div>
  );
}
