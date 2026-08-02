"use client";

import { useMemo, useRef } from "react";
import { BrainViz3D } from "./BrainViz3D";
import { peakChannel, regionOf, topoAt } from "@/lib/signal";
import type { Condition, SubjectBundle } from "@/lib/types";
import { useFrame, useMonitor, useTime } from "@/state/monitor";

/**
 * Binds the cortical surface to the transport.
 *
 * The seam between the two render loops lives here: this component's
 * subscription to the app clock writes the current alpha index into a
 * Float32Array, and the three.js loop inside <BrainViz3D> reads that same
 * array on its own schedule. Neither re-renders React to do it, so scrubbing a
 * 5-minute recording costs no reconciliation at all.
 */
export function BrainStage({
  bundle,
  condition,
}: {
  bundle: SubjectBundle;
  condition: Condition;
}) {
  const { state } = useMonitor();
  const topoRef = useRef<Float32Array>(new Float32Array(bundle.electrodes.length));
  const data = bundle.conditions[condition];

  useFrame((t) => {
    topoAt(data, bundle.topoFs, t, topoRef.current);
  });

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <BrainViz3D
          electrodes={bundle.electrodes}
          topoRef={topoRef}
          alert={state.view === "monitor" && bundle.responsive}
          className="h-full w-full"
        />
      </div>
      <BrainFooter bundle={bundle} condition={condition} />
    </div>
  );
}

/**
 * The honesty line, and the one piece of live text the stage carries. Kept
 * outside the WebGL canvas so it is real selectable text rather than pixels.
 */
function BrainFooter({ bundle, condition }: { bundle: SubjectBundle; condition: Condition }) {
  const t = useTime(6);
  const { state } = useMonitor();
  const values = useMemo(
    () => new Float32Array(bundle.electrodes.length),
    [bundle.electrodes.length],
  );

  topoAt(bundle.conditions[condition], bundle.topoFs, t, values);
  const focus = state.focusChannel ?? peakChannel(values);
  const electrode = bundle.electrodes[focus];

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-rule px-4 py-2.5">
      <p className="text-2xs text-ink-3">
        fsaverage5 pial surface (FreeSurfer) · {bundle.electrodes.length} electrodes ·{" "}
        <span className="font-medium text-alert-text">
          scalp projection, not source localized
        </span>
      </p>
      <p className="text-2xs text-ink-2">
        peak <span className="metric font-semibold text-ink">{electrode.label}</span>{" "}
        <span className="text-ink-3">{regionOf(electrode.label).toLowerCase()}</span>
      </p>
    </div>
  );
}
