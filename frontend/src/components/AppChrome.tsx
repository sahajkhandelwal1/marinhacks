"use client";

import type { Manifest } from "@/lib/types";
import { useMonitor } from "@/state/monitor";

export function AppHeader({ manifest }: { manifest: Manifest | null }) {
  const { state, store } = useMonitor();

  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-rule bg-surface px-3 py-2">
      <div className="flex items-baseline gap-3">
        <span className="readout text-sm font-semibold tracking-widest text-ink">VIGIL</span>
        <span className="hidden text-2xs text-ink-3 sm:inline">
          is the brain still listening to the room?
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="inline-block h-1.5 w-1.5 bg-signal" aria-hidden />
        <span className="eyebrow text-ink-2">replay</span>
      </div>

      <nav className="flex items-center gap-1" aria-label="View">
        {(
          [
            ["monitor", "monitor"],
            ["compare", "two patients"],
          ] as const
        ).map(([view, label]) => (
          <button
            key={view}
            type="button"
            onClick={() => store.set({ view })}
            className={`border px-2.5 py-1 readout text-2xs uppercase tracking-widest ${
              state.view === view
                ? "border-signal text-signal"
                : "border-rule text-ink-3 hover:border-rule-bright hover:text-ink-2"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <span className="ml-auto readout text-2xs text-ink-3">
        {manifest ? `n=${manifest.subjects.length} · 4 conditions · ${manifest.electrodes.length} ch` : "loading"}
      </span>
    </header>
  );
}

/**
 * Honesty labels, non-negotiable (PRD §8).
 *
 * The source line says synthetic because it is: real SDP and topomap math
 * (scripts/sdp.py) over synthetic EEG, in the Chennu file layout, pending the
 * real recordings. PRD §10 is explicit that a synthesized fallback ships with
 * the footer labeled — the label is what makes it honest, not a defect.
 */
export function AppFooter({ manifest }: { manifest: Manifest | null }) {
  return (
    <footer className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-rule bg-surface px-3 py-2 text-2xs text-ink-3">
      <span>
        Replaying: <span className="text-ink-2">synthetic EEG, real SDP/topomap math</span> — Chennu et
        al. 2016 file contract, n={manifest?.subjects.length ?? 20}, propofol sedation
      </span>
      <span>SDP is a spectral proxy, not BIS</span>
      <span>Trace is reconstructed from band ratio, not raw EEG</span>
      <span>CI not measured — no stimulus-locked audio in the public release</span>
    </footer>
  );
}
