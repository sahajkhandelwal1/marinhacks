"use client";

import { useEffect } from "react";
import { formatClock } from "./SdpTimeline";
import type { SubjectBundle } from "@/lib/types";
import { useMonitor, useTime } from "@/state/monitor";

const SPEEDS = [1, 2, 4, 8];

export function Transport({ bundle }: { bundle: SubjectBundle | null }) {
  const { state, store } = useMonitor();
  const t = useTime(8);

  useEffect(() => {
    if (bundle) store.duration = bundle.durationSec;
  }, [bundle, store]);

  // Space to play/pause, arrows to step — the demo is driven by hand, live,
  // in front of judges. Reaching for a mouse mid-sentence costs a beat.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "BUTTON"].includes(target.tagName)) return;
      if (e.code === "Space") {
        e.preventDefault();
        store.togglePlay();
      } else if (e.code === "ArrowLeft") {
        store.nudge(e.shiftKey ? -10 : -1);
      } else if (e.code === "ArrowRight") {
        store.nudge(e.shiftKey ? 10 : 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
      <button
        type="button"
        onClick={() => store.togglePlay()}
        className="flex items-center gap-2 border border-rule-bright px-3 py-1.5 readout text-2xs uppercase tracking-widest text-ink hover:border-signal hover:text-signal"
      >
        <span className="inline-block h-2 w-2" style={{ background: state.playing ? "#2ace8c" : "#56635f" }} />
        {state.playing ? "pause" : "play"}
      </button>

      <div className="flex items-center gap-1">
        <span className="eyebrow">rate</span>
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => store.set({ speed: s })}
            className={`border px-2 py-1 readout text-2xs ${
              state.speed === s
                ? "border-signal text-signal"
                : "border-rule text-ink-3 hover:border-rule-bright hover:text-ink-2"
            }`}
          >
            {s}×
          </button>
        ))}
      </div>

      <div className="readout text-2xs text-ink-2">
        <span className="text-ink">{formatClock(t)}</span>
        <span className="text-ink-3"> / {formatClock(bundle?.durationSec ?? 0)}</span>
      </div>

      <div className="readout text-2xs text-ink-3">
        frame {Math.floor(t * (bundle?.sdpFs ?? 10))} · stream {bundle?.sdpFs ?? 10} Hz
      </div>

      <span className="ml-auto hidden text-2xs text-ink-3 sm:inline">
        space play/pause · ←/→ step · drag the trace to scrub
      </span>
    </div>
  );
}
