"use client";

import { useRef } from "react";

import { CohortStrip } from "./CohortStrip";
import { SdpTimeline } from "./SdpTimeline";
import { BrainViz3D } from "./BrainViz3D";
import { TopoLegend } from "./Topomap";
import { Panel } from "./ui/Panel";
import { useSubjectBundle } from "@/hooks/useSubjectBundle";
import { DEPTH_BAND_LABEL, depthBand, sdpAt, topoAt } from "@/lib/signal";
import { THEME } from "@/lib/theme";
import type { Manifest, SubjectBundle } from "@/lib/types";
import { useFrame, useMonitor, useTime } from "@/state/monitor";

/**
 * PRD §8's closing move. Same drug concentration, two patients, SDP nearly
 * identical, one of them was answering questions.
 *
 * Labeled by outcome, not by subject id — the ids are on screen only so a
 * skeptic can check them against data/synthetic/ and subjects.csv.
 */
export function CompareView({ manifest }: { manifest: Manifest }) {
  const { state, store } = useMonitor();
  const a = useSubjectBundle(state.compareA, state.dataSource);
  const b = useSubjectBundle(state.compareB, state.dataSource);
  const t = useTime(8);

  const sdpA = a ? sdpAt(a.conditions.moderate, a.sdpFs, t) : null;
  const sdpB = b ? sdpAt(b.conditions.moderate, b.sdpFs, t) : null;
  const gap = sdpA !== null && sdpB !== null ? Math.abs(sdpA - sdpB) : null;

  // The caption used to be a fixed sentence asserting "opposite behavior".
  // That was safe when the pair was hardcoded; now that an operator can pick
  // any two subjects it can be flatly false on screen — two responders, or
  // two non-responders, still rendered the disagreement claim. Derive it.
  const caption = describePair(a, b, gap);

  return (
    <div className="flex flex-col gap-2">
      <Panel
        label={
          <>
            Two patients · moderate sedation · <span className="unit">1.2 µg/mL</span> propofol
          </>
        }
        aside={gap !== null ? `live SDP gap ${gap.toFixed(1)} points` : undefined}
      >
        <div className="grid gap-2 p-2 sm:grid-cols-2">
          <PatientCard
            bundle={a}
            slot="A"
            manifest={manifest}
            selected={state.compareA}
            exclude={state.compareB}
            onSelect={(id) => store.set({ compareA: id })}
          />
          <PatientCard
            bundle={b}
            slot="B"
            manifest={manifest}
            selected={state.compareB}
            exclude={state.compareA}
            onSelect={(id) => store.set({ compareB: id })}
          />
        </div>

        <p className="border-t border-rule px-3 py-2 text-2xs text-ink-2">
          {caption}
        </p>
      </Panel>

      <div className="grid gap-2 lg:grid-cols-[1fr_1fr]">
        <Panel label="SDP over 5 minutes · both patients" aside="drag to scrub">
          <div className="h-[180px]">{a ? <SdpTimeline bundle={a} condition="moderate" compare={b} /> : null}</div>
          <div className="flex items-center gap-4 border-t border-rule px-3 py-2">
            <span className="flex items-center gap-1.5 text-2xs text-ink-2">
              <span className="h-[2px] w-4" style={{ background: THEME.accent }} />
              did not respond
            </span>
            <span className="flex items-center gap-1.5 text-2xs text-ink-2">
              <span className="h-[2px] w-4" style={{ background: THEME.alert }} />
              responded to command
            </span>
          </div>
        </Panel>

        <Panel label="Whole cohort · does SDP separate them?">
          <CohortStrip
            manifest={manifest}
            condition="moderate"
            highlight={[state.compareA, state.compareB]}
          />
        </Panel>
      </div>
    </div>
  );
}

/**
 * The one-line reading of the current pair.
 *
 * Kept honest for every selectable combination rather than only the default
 * one: the disagreement claim is only made when the two outcomes actually
 * disagree, and the "same depth reading" half only when SDP really is close.
 */
function describePair(
  a: SubjectBundle | null,
  b: SubjectBundle | null,
  gap: number | null,
): string {
  if (!a || !b || gap === null) return "Loading both recordings…";

  const sameDepth = gap <= 3;

  if (a.responsive !== b.responsive) {
    return sameDepth
      ? "Same drug, same depth reading, opposite behavior. The monitor is not wrong about the rhythm — the rhythm is not the question."
      : `Same drug, opposite behavior — but SDP separates these two by ${gap.toFixed(1)} points. Pick a closer pair to see the case the monitor genuinely cannot call.`;
  }

  if (a.responsive && b.responsive) {
    return "Both of these patients responded to command at this concentration. Nothing in either reading says so.";
  }

  return "Neither of these patients responded. Shown for contrast — the disagreement needs one responder and one non-responder.";
}

/**
 * Subject picker for one side of the comparison.
 *
 * A native <select> on purpose: it is keyboard and screen-reader correct for
 * free, and on the phone a judge opens this on it becomes the platform's own
 * wheel rather than a custom menu that has to be re-tested on touch.
 *
 * Options are grouped by outcome because the pairing that matters is one
 * responder against one non-responder at the same depth — grouping makes that
 * constructible at a glance instead of requiring the ids to be memorized.
 */
function SubjectPicker({
  manifest,
  selected,
  exclude,
  onSelect,
  slot,
}: {
  manifest: Manifest;
  selected: string;
  exclude: string;
  onSelect: (subject: string) => void;
  slot: "A" | "B";
}) {
  const available = manifest.subjects.filter((s) => s.subject !== exclude);
  const responders = available.filter((s) => s.responsive);
  const nonResponders = available.filter((s) => !s.responsive);

  return (
    <label className="flex items-center gap-1.5">
      <span className="sr-only">Patient {slot} subject</span>
      <select
        value={selected}
        onChange={(e) => onSelect(e.target.value)}
        className="metric cursor-pointer rounded border border-rule bg-surface px-1.5 py-0.5 text-2xs text-ink-2 hover:border-rule-strong focus:outline-none focus:ring-2 focus:ring-accent"
      >
        <optgroup label="did not respond">
          {nonResponders.map((s) => (
            <option key={s.subject} value={s.subject}>
              {s.subject}
            </option>
          ))}
        </optgroup>
        <optgroup label="responded to command">
          {responders.map((s) => (
            <option key={s.subject} value={s.subject}>
              {s.subject}
            </option>
          ))}
        </optgroup>
      </select>
    </label>
  );
}

function PatientCard({
  bundle,
  slot,
  manifest,
  selected,
  exclude,
  onSelect,
}: {
  bundle: SubjectBundle | null;
  slot: "A" | "B";
  manifest: Manifest;
  selected: string;
  /** The other card's subject, omitted from this list so the view can't be
   *  put into the degenerate state of comparing a patient against themselves. */
  exclude: string;
  onSelect: (subject: string) => void;
}) {
  const t = useTime(12);

  // Same seam as BrainStage: the transport writes into this array, the three.js
  // loop reads it, and neither re-renders React to do it.
  //
  // Every hook has to sit above the `!bundle` early return below. This card
  // renders a skeleton until its bundle resolves, so a hook placed after that
  // return runs on the loaded render but not the loading one, and React sees
  // the hook order change between renders. Allocation is deferred into the
  // frame callback rather than done during render, since the electrode count
  // isn't known until the bundle arrives.
  const topoRef = useRef<Float32Array>(new Float32Array(0));
  useFrame((clock) => {
    if (!bundle) return;
    const n = bundle.electrodes.length;
    if (topoRef.current.length !== n) topoRef.current = new Float32Array(n);
    topoAt(bundle.conditions.moderate, bundle.topoFs, clock, topoRef.current);
  });

  if (!bundle) {
    return (
      <div className="flex h-[380px] items-start justify-end border border-rule bg-well p-3">
        <SubjectPicker
          manifest={manifest}
          selected={selected}
          exclude={exclude}
          onSelect={onSelect}
          slot={slot}
        />
      </div>
    );
  }

  const sdp = sdpAt(bundle.conditions.moderate, bundle.sdpFs, t);
  const band = depthBand(sdp);
  const responded = bundle.responsive;

  return (
    <article className="overflow-hidden rounded-lg border border-rule">
      <header
        className="flex items-baseline justify-between gap-3 border-b-2 px-4 py-2.5"
        style={{ borderColor: responded ? THEME.alert : THEME.rule }}
      >
        <h3 className="status text-ink">
          Patient {slot} — {responded ? "responded to command" : "did not respond"}
        </h3>
        <SubjectPicker
          manifest={manifest}
          selected={selected}
          exclude={exclude}
          onSelect={onSelect}
          slot={slot}
        />
      </header>

      <div className="h-[240px]">
        <BrainViz3D
          electrodes={bundle.electrodes}
          topoRef={topoRef}
          alert={responded}
          spin={false}
          className="h-full w-full"
        />
      </div>
      <TopoLegend />

      <div className="flex items-end justify-between gap-3 border-t border-rule px-4 py-3.5">
        <div>
          <p className="label">SDP</p>
          <p className="metric-hero mt-1 text-5xl text-ink">{sdp.toFixed(0)}</p>
        </div>
        <div className="text-right">
          <p className="status text-ink-2">{DEPTH_BAND_LABEL[band]}</p>
          <p
            className="mt-1.5 text-2xs font-medium"
            style={{ color: responded ? THEME.alertText : THEME.ink3 }}
          >
            {responded ? "was answering questions" : "no volitional response"}
          </p>
        </div>
      </div>
    </article>
  );
}
