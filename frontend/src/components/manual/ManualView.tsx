"use client";

import { useState } from "react";
import { BeamStage } from "./BeamStage";
import { ManualConsole } from "./ManualConsole";
import { ResponseTrace } from "./ResponseTrace";
import { Panel } from "../ui/Panel";
import { divergingCss } from "@/lib/color";
import { BASELINE_BEAM, REGIONS, bandFor, sdpDelta, type BeamState } from "@/lib/manual";
import { DEPTH_BAND_LABEL, depthBand, sdpAt } from "@/lib/signal";
import type { Condition, SubjectBundle } from "@/lib/types";
import { useTime } from "@/state/monitor";

/**
 * Manual mode.
 *
 * A sandbox, and it says so at the top of the screen rather than in a footnote.
 * The beams are not a device and the response is a hand-written model
 * (lib/manual.ts) — what is real here is the anatomy the beam is aimed at and
 * the patient recording underneath it.
 *
 * It earns its place by making the argument physical: drive enough delta and
 * the depth index falls, whichever direction the beam points. The monitor
 * reports a deeper patient because its denominator moved, not because anything
 * happened to consciousness.
 */
export function ManualView({
  bundle,
  condition,
}: {
  bundle: SubjectBundle | null;
  condition: Condition;
}) {
  const [beam, setBeam] = useState<BeamState>(BASELINE_BEAM);
  const t = useTime(10);

  const region = REGIONS.find((r) => r.id === beam.region) ?? REGIONS[0];
  const band = bandFor(beam.hz);

  const measured = bundle ? sdpAt(bundle.conditions[condition], bundle.sdpFs, t) : null;
  const delta = sdpDelta(beam);
  const modeled = measured === null ? null : Math.min(100, Math.max(0, measured + delta));

  return (
    <div className="flex flex-col gap-3">
      <SimulationBanner />

      {/* The console's natural height sets the row, and the viewport flexes to
          fill it. Capping the row instead scrolls the presets out of sight, and
          giving the viewport a fixed height leaves dead space beside a taller
          console — this is the one arrangement with neither problem. */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_330px]">
        <Panel
          label={`Beam target · ${region.label}`}
          aside="drag to rotate · scroll to zoom"
          bodyClassName="flex flex-col"
        >
          <div className="min-h-[360px] flex-1">
            <BeamStage beam={beam} className="h-full w-full" />
          </div>
          <EffectLegend />
        </Panel>

        <Panel label="Control console" aside="simulated">
          <ManualConsole beam={beam} onChange={setBeam} />
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_330px]">
        <Panel
          label="Live response"
          aside="reconstructed baseline + modeled beam"
        >
          <div className="h-[190px]">
            {bundle ? (
              <ResponseTrace bundle={bundle} condition={condition} beam={beam} />
            ) : null}
          </div>
        </Panel>

        <Panel label="Modeled depth index">
          <div className="flex items-end justify-between gap-4 px-4 py-4">
            <div>
              <p className="label">SDP under beam</p>
              <p className="metric-hero mt-1 text-5xl text-ink">
                {modeled === null ? "—" : modeled.toFixed(0)}
              </p>
            </div>
            <div className="text-right">
              <p className="status text-ink-2">
                {modeled === null ? "" : DEPTH_BAND_LABEL[depthBand(modeled)]}
              </p>
              <p
                className="mt-1.5 metric text-2xs font-semibold"
                style={{ color: delta === 0 ? "var(--ink-3)" : divergingCss(delta / 40) }}
              >
                {delta === 0
                  ? "beam off"
                  : `${delta > 0 ? "+" : ""}${delta.toFixed(0)} vs measured ${measured?.toFixed(0)}`}
              </p>
            </div>
          </div>

          <p className="border-t border-rule px-4 py-3 text-2xs leading-relaxed text-ink-2">
            {band && band.id === "delta" && beam.intensity > 0.2 ? (
              <>
                Driving delta pulls the index down whichever way the beam points — delta
                sits in SDP&apos;s denominator. The monitor reports a deeper patient
                because the arithmetic moved.
              </>
            ) : beam.mode === "stimulate" && beam.intensity > 0.2 ? (
              <>
                Excitation lifts the index far less than suppression drops it. A depth
                index is much better at seeing slowing than arousal.
              </>
            ) : (
              <>
                Modeled effect only. The measured value from the recording is{" "}
                <span className="metric font-semibold text-ink">
                  {measured?.toFixed(0) ?? "—"}
                </span>
                .
              </>
            )}
          </p>
        </Panel>
      </div>
    </div>
  );
}

function SimulationBanner() {
  return (
    <div
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-panel border px-4 py-3"
      style={{ borderColor: "var(--alert)", background: "var(--alert-wash)" }}
    >
      <span className="status text-alert-text">Simulation</span>
      <p className="text-2xs leading-relaxed text-ink-2">
        No such device exists and no intervention was recorded. Beams and their effects
        are a hand-written model, included to make the index&apos;s failure modes
        tangible. The anatomy and the underlying recording are real.
      </p>
    </div>
  );
}

/** A diverging scale needs a legend more than a sequential one does — the reader has to know where zero is. */
function EffectLegend() {
  const steps = Array.from({ length: 25 }, (_, i) => -1 + (2 * i) / 24);
  return (
    <div className="flex items-center gap-3 border-t border-rule px-4 py-2.5">
      <span className="label shrink-0">suppressed</span>
      <div className="flex h-2 flex-1 overflow-hidden rounded-full">
        {steps.map((s) => (
          <div key={s} className="flex-1" style={{ background: divergingCss(s) }} />
        ))}
      </div>
      <span className="label shrink-0">excited</span>
    </div>
  );
}
