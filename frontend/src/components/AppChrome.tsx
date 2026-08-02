"use client";

import type { Manifest } from "@/lib/types";
import { useMonitor } from "@/state/monitor";

export function AppHeader({ manifest }: { manifest: Manifest | null }) {
  const { state, store } = useMonitor();

  return (
    <header className="sticky top-0 z-20 flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-rule bg-surface px-4 py-3">
      <div className="flex items-baseline gap-3">
        <span className="text-base font-semibold tracking-tight text-ink">VIGIL</span>
        <span className="hidden text-2xs text-ink-3 sm:inline">
          is the brain still listening to the room?
        </span>
      </div>

      <span className="inline-flex items-center gap-2 rounded-full bg-accent-wash px-2.5 py-1">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
        <span className="status text-accent-text">replay</span>
      </span>

      <nav className="flex items-center gap-1 rounded-lg bg-well p-1" aria-label="View">
        {(
          [
            ["monitor", "Monitor"],
            ["compare", "Two patients"],
          ] as const
        ).map(([view, label]) => (
          <button
            key={view}
            type="button"
            onClick={() => store.set({ view })}
            className={`rounded-md px-3 py-1.5 text-2xs font-semibold transition-colors ${
              state.view === view ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <span className="ml-auto metric text-2xs text-ink-3">
        {manifest
          ? `n=${manifest.subjects.length} · 4 conditions · ${manifest.electrodes.length} ch`
          : "loading"}
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
  const notes = [
    "SDP is a spectral proxy, not BIS",
    "Cortical surface is a scalp projection, not source localization",
    "EEG trace is reconstructed from band ratio, not raw",
    "CI not measured — no stimulus-locked audio in the public release",
  ];

  return (
    <footer className="mt-1 border-t border-rule bg-surface px-4 py-3">
      <p className="text-2xs text-ink-2">
        Replaying <span className="font-medium text-ink">synthetic EEG with real SDP math</span> —
        Chennu et al. 2016 file contract, n={manifest?.subjects.length ?? 20}, propofol sedation
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1">
        {notes.map((note) => (
          <li key={note} className="text-2xs text-ink-3">
            {note}
          </li>
        ))}
      </ul>
    </footer>
  );
}
