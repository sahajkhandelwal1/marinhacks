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
        className="flex items-center gap-2 rounded-md bg-accent px-3.5 py-1.5 text-2xs font-semibold text-white transition-colors hover:bg-accent-text"
      >
        {state.playing ? <PauseIcon /> : <PlayIcon />}
        {state.playing ? "Pause" : "Play"}
      </button>

      <div className="flex items-center gap-1.5">
        <span className="label">Rate</span>
        <div className="flex items-center gap-0.5 rounded-md bg-well p-0.5">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => store.set({ speed: s })}
              className={`rounded px-2 py-1 metric text-2xs font-medium transition-colors ${
                state.speed === s
                  ? "bg-surface text-ink shadow-card"
                  : "text-ink-3 hover:text-ink-2"
              }`}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      <div className="metric text-2xs text-ink-2">
        <span className="font-semibold text-ink">{formatClock(t)}</span>
        <span className="text-ink-3"> / {formatClock(bundle?.durationSec ?? 0)}</span>
      </div>

      <div className="metric text-2xs text-ink-3">
        frame {Math.floor(t * (bundle?.sdpFs ?? 10))} · stream {bundle?.sdpFs ?? 10} Hz
      </div>

      <span className="ml-auto hidden text-2xs text-ink-3 sm:inline">
        space play/pause · ←/→ step · drag the trace to scrub
      </span>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg width="9" height="10" viewBox="0 0 9 10" fill="currentColor" aria-hidden>
      <path d="M0 0.5v9l9-4.5z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="9" height="10" viewBox="0 0 9 10" fill="currentColor" aria-hidden>
      <path d="M0 0h3v10H0zM6 0h3v10H6z" />
    </svg>
  );
}
