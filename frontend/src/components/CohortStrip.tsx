"use client";

import type { Condition, Manifest } from "@/lib/types";

const RESPONDED = "#c98500";
const NO_RESPONSE = "#199e70";

/**
 * Every subject's median SDP at one condition, split by behavioral outcome.
 *
 * This is the aggregate version of the closing argument: if SDP could see
 * connected consciousness, the two rows would separate. They do not — the
 * distributions sit on top of each other.
 *
 * Two categorical colors (the validated pair), plus a legend, plus fill vs
 * ring as a second channel, plus the numbers in text. Identity never rests on
 * hue alone.
 */
export function CohortStrip({
  manifest,
  condition,
  highlight = [],
}: {
  manifest: Manifest;
  condition: Condition;
  /** Subject ids to call out by name. */
  highlight?: string[];
}) {
  const responded = manifest.subjects.filter((s) => s.responsive);
  const notResponded = manifest.subjects.filter((s) => !s.responsive);

  return (
    <div className="p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-2xs text-ink-2">
          Median SDP per subject at{" "}
          <span className="readout uppercase text-ink">{condition}</span> · n={manifest.subjects.length}
        </p>
        <Legend />
      </div>

      <div className="relative mt-4">
        <Axis />
        <Row
          label="did not respond"
          count={notResponded.length}
          color={NO_RESPONSE}
          filled
          subjects={notResponded.map((s) => ({ id: s.subject, v: s.conditions[condition].median }))}
          highlight={highlight}
        />
        <Row
          label="responded to command"
          count={responded.length}
          color={RESPONDED}
          filled={false}
          subjects={responded.map((s) => ({ id: s.subject, v: s.conditions[condition].median }))}
          highlight={highlight}
        />
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-4">
      <span className="flex items-center gap-1.5 text-2xs text-ink-2">
        <span className="h-2 w-2" style={{ background: NO_RESPONSE }} />
        did not respond
      </span>
      <span className="flex items-center gap-1.5 text-2xs text-ink-2">
        <span className="h-2 w-2 border" style={{ borderColor: RESPONDED }} />
        responded to command
      </span>
    </div>
  );
}

function Axis() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 bottom-4">
      {[0, 25, 50, 75, 100].map((tick) => (
        <div key={tick} className="absolute top-0 bottom-0" style={{ left: `${tick}%` }}>
          <div className="h-full w-px bg-rule" />
          <span className="absolute -bottom-4 -translate-x-1/2 readout text-2xs text-ink-3">{tick}</span>
        </div>
      ))}
    </div>
  );
}

function Row({
  label,
  count,
  color,
  filled,
  subjects,
  highlight,
}: {
  label: string;
  count: number;
  color: string;
  filled: boolean;
  subjects: Array<{ id: string; v: number }>;
  highlight: string[];
}) {
  return (
    <div className="relative mb-6">
      <p className="mb-1 eyebrow">
        {label} · n={count}
      </p>
      <div className="relative h-7">
        {subjects.map(({ id, v }) => {
          const called = highlight.includes(id);
          return (
            <span
              key={id}
              className="absolute top-2"
              style={{ left: `${v}%`, transform: "translateX(-50%)" }}
              title={`${id} · median SDP ${v.toFixed(1)}`}
            >
              <span
                className="block h-2.5 w-2.5 border-2"
                style={{
                  background: filled ? color : "transparent",
                  borderColor: filled ? "#0a0e0f" : color,
                  outline: called ? "1px solid #e4ece9" : "none",
                  outlineOffset: "2px",
                }}
              />
              {called ? (
                <span className="absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap readout text-2xs text-ink">
                  {id}
                </span>
              ) : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}
