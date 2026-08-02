"use client";

import { THEME } from "@/lib/theme";
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
              className={`flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-well ${
                active ? "bg-accent-wash" : ""
              }`}
              aria-current={active}
            >
              <span
                className={`w-9 shrink-0 metric text-2xs ${
                  active ? "font-semibold text-accent-text" : "font-medium text-ink-2"
                }`}
              >
                {entry.subject}
              </span>

              <span
                className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-well"
                title={`median SDP ${stats.median}`}
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${stats.median}%`,
                    background: entry.responsive ? THEME.alert : THEME.accent,
                  }}
                />
              </span>

              <span
                className={`w-6 shrink-0 metric text-right text-2xs ${
                  active ? "text-ink" : "text-ink-3"
                }`}
              >
                {stats.median.toFixed(0)}
              </span>
              <span
                className="w-16 shrink-0 text-right text-2xs font-medium"
                style={{ color: entry.responsive ? THEME.alertText : THEME.ink3 }}
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
