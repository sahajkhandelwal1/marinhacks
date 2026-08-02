"use client";

import type { Manifest } from "@/lib/types";
import { useMonitor } from "@/state/monitor";

/**
 * The cohort. Each row carries the subject's median SDP at the selected
 * condition and its behavioral outcome, so the overlap between the two groups
 * is visible before anyone opens the two-patient view.
 *
 * Outcome is on the row as text and as a colored mark — never color alone.
 */
export function SubjectRoster({ manifest }: { manifest: Manifest }) {
  const { state, store } = useMonitor();

  return (
    <ul className="divide-y divide-rule">
      {manifest.subjects.map((entry) => {
        const stats = entry.conditions[state.condition];
        const active = entry.subject === state.subjectId;
        return (
          <li key={entry.subject}>
            <button
              type="button"
              onClick={() => store.set({ subjectId: entry.subject })}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-raised ${
                active ? "bg-raised" : ""
              }`}
              aria-current={active}
            >
              <span
                className="h-[10px] w-[2px] shrink-0"
                style={{ background: active ? "#2ace8c" : "transparent" }}
              />
              <span className={`readout w-9 shrink-0 text-2xs ${active ? "text-ink" : "text-ink-2"}`}>
                {entry.subject}
              </span>

              <span className="relative h-[6px] flex-1 bg-raised" title={`median SDP ${stats.median}`}>
                <span
                  className="absolute inset-y-0 left-0"
                  style={{
                    width: `${stats.median}%`,
                    background: entry.responsive ? "#c98500" : "#199e70",
                  }}
                />
              </span>

              <span className={`readout w-6 shrink-0 text-right text-2xs ${active ? "text-ink" : "text-ink-3"}`}>
                {stats.median.toFixed(0)}
              </span>
              <span
                className="readout w-16 shrink-0 text-right text-2xs"
                style={{ color: entry.responsive ? "#c98500" : "#56635f" }}
              >
                {entry.responsive ? "responded" : "no resp."}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
