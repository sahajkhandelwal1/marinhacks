"use client";

import { CohortStrip } from "./CohortStrip";
import { SdpTimeline } from "./SdpTimeline";
import { Topomap, TopoLegend } from "./Topomap";
import { Panel } from "./ui/Panel";
import { useSubjectBundle } from "@/hooks/useSubjectBundle";
import { DEPTH_BAND_LABEL, depthBand, sdpAt } from "@/lib/signal";
import { THEME } from "@/lib/theme";
import type { Manifest, SubjectBundle } from "@/lib/types";
import { useMonitor, useTime } from "@/state/monitor";

/**
 * PRD §8's closing move. Same drug concentration, two patients, SDP nearly
 * identical, one of them was answering questions.
 *
 * Labeled by outcome, not by subject id — the ids are on screen only so a
 * skeptic can check them against data/synthetic/ and subjects.csv.
 */
export function CompareView({ manifest }: { manifest: Manifest }) {
  const { state } = useMonitor();
  const a = useSubjectBundle(state.compareA);
  const b = useSubjectBundle(state.compareB);
  const t = useTime(8);

  const sdpA = a ? sdpAt(a.conditions.moderate, a.sdpFs, t) : null;
  const sdpB = b ? sdpAt(b.conditions.moderate, b.sdpFs, t) : null;
  const gap = sdpA !== null && sdpB !== null ? Math.abs(sdpA - sdpB) : null;

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
          <PatientCard bundle={a} slot="A" />
          <PatientCard bundle={b} slot="B" />
        </div>

        <p className="border-t border-rule px-3 py-2 text-2xs text-ink-2">
          Same drug, same depth reading, opposite behavior. The monitor is not
          wrong about the rhythm — the rhythm is not the question.
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

function PatientCard({ bundle, slot }: { bundle: SubjectBundle | null; slot: "A" | "B" }) {
  const t = useTime(12);

  if (!bundle) {
    return <div className="h-[380px] border border-rule bg-well" aria-hidden />;
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
        <span className="metric text-2xs text-ink-3">{bundle.subject}</span>
      </header>

      <div className="h-[240px]">
        <Topomap bundle={bundle} condition="moderate" interactive={false} showLabels={false} />
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
