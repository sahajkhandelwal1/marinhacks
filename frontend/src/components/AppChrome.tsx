"use client";

import Link from "next/link";

import { ConnectDeviceButton } from "@/components/ConnectDeviceButton";
import type { DataSource, Manifest } from "@/lib/types";
import { DATA_SOURCE_DEFAULTS, useMonitor } from "@/state/monitor";

export function AppHeader({ manifest }: { manifest: Manifest | null }) {
  const { state, store } = useMonitor();

  return (
    <header className="sticky top-0 z-20 flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-rule bg-surface px-4 py-3">
      <div className="flex items-baseline gap-3">
        <Link
          href="/"
          className="text-base font-semibold tracking-tight text-ink hover:text-accent-text"
        >
          PROBE
        </Link>
        <span className="hidden text-2xs text-ink-3 sm:inline" title="Patient Response Observation Brain Encoder">
          Patient Response Observation Brain Encoder
        </span>
        <Link href="/" className="text-2xs text-ink-3 hover:text-ink-2">
          ← all cases
        </Link>
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
            ["manual", "Manual"],
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

      <DataSourceToggle />

      <span className="ml-auto metric text-2xs text-ink-3">
        {manifest
          ? `n=${manifest.subjects.length} · 4 conditions · ${manifest.electrodes.length} ch`
          : "loading"}
      </span>

      <ConnectDeviceButton />
    </header>
  );
}

/**
 * Data-source A/B toggle. Switching re-fetches the manifest and the current
 * subject bundle for the new source through the exact same mechanism a
 * subject/condition change already uses (state.dataSource flows into
 * useMonitor's store like every other selection — see Dashboard.tsx and
 * useSubjectBundle's dependency array). Resets subjectId/compareA/compareB
 * to that source's defaults, since the two datasets don't share subject IDs.
 */
function DataSourceToggle() {
  const { state, store } = useMonitor();

  return (
    <nav className="flex items-center gap-1 rounded-lg bg-well p-1" aria-label="Data source">
      {(
        [
          ["synthetic", "Synthetic"],
          ["real", "Real"],
        ] as const satisfies ReadonlyArray<[DataSource, string]>
      ).map(([source, label]) => (
        <button
          key={source}
          type="button"
          onClick={() => store.set({ dataSource: source, ...DATA_SOURCE_DEFAULTS[source] })}
          title={source === "real" ? "Real EEGLAB sedation recordings" : "Fabricated EEG, real SDP math"}
          className={`rounded-md px-3 py-1.5 text-2xs font-semibold transition-colors ${
            state.dataSource === source ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink"
          }`}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}

/**
 * Honesty labels, non-negotiable (PRD §8).
 *
 * The source line switches with state.dataSource: synthetic EEG with real
 * SDP math (the original fallback, PRD §10) vs real EEGLAB recordings with
 * the same SDP math (pipeline/load_local_eeglab.py, scripts/emit_real_json.py).
 * Either way the label is what makes it honest, not a defect.
 */
export function AppFooter({ manifest }: { manifest: Manifest | null }) {
  const { state } = useMonitor();
  const notes = [
    "SDP is a spectral proxy, not BIS",
    "Cortical surface is a scalp projection, not source localization",
    "EEG trace is reconstructed from band ratio, not raw",
    "CI not measured — no stimulus-locked audio in either dataset",
  ];

  const sourceLabel =
    state.dataSource === "real" ? (
      <>
        <span className="font-medium text-ink">real EEG (EEGLAB sedation recordings)</span> with real SDP math
      </>
    ) : (
      <>
        <span className="font-medium text-ink">synthetic EEG with real SDP math</span>
      </>
    );

  return (
    <footer className="mt-1 border-t border-rule bg-surface px-4 py-3">
      <p className="text-2xs text-ink-2">
        Replaying {sourceLabel} — Chennu et al. 2016 file contract, n={manifest?.subjects.length ?? 20}, propofol
        sedation
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
