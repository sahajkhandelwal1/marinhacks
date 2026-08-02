"use client";

import { BrainStage } from "./BrainStage";
import { ChannelBars } from "./ChannelBars";
import { CiPanel } from "./CiPanel";
import { DepthSlider } from "./DepthSlider";
import { NetworkPanel } from "./NetworkPanel";
import { SdpReadout } from "./SdpReadout";
import { SdpTimeline } from "./SdpTimeline";
import { StatusPanel } from "./StatusPanel";
import { TopoLegend } from "./Topomap";
import { TRACE_WINDOW_SEC, TraceStrip } from "./TraceStrip";
import { Transport } from "./Transport";
import { SubjectRoster } from "./SubjectRoster";
import { Panel } from "./ui/Panel";
import { CONDITION_LABEL, type Manifest, type SubjectBundle } from "@/lib/types";
import { useMonitor } from "@/state/monitor";

/**
 * Single-patient monitor. The cortical surface is the main stage; the two big
 * numbers sit beside it, the trace under them, depth and transport along the
 * bottom, cohort and telemetry at the edges.
 */
export function MonitorView({
  manifest,
  bundle,
}: {
  manifest: Manifest;
  bundle: SubjectBundle | null;
}) {
  const { state } = useMonitor();

  return (
    <div className="grid gap-3 xl:grid-cols-[224px_minmax(0,1fr)_272px]">
      <Panel
        label="Cohort"
        aside={CONDITION_LABEL[state.condition]}
        className="order-2 max-h-[320px] overflow-y-auto xl:order-1 xl:max-h-none"
      >
        <SubjectRoster manifest={manifest} />
      </Panel>

      <div className="order-1 flex min-w-0 flex-col gap-3 xl:order-2">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_210px_210px]">
          <Panel
            label={`Cortical activity · ${state.subjectId}`}
            aside="drag to rotate · scroll to zoom"
            bodyClassName="flex flex-col"
          >
            <div className="min-h-[340px] flex-1">
              {bundle ? <BrainStage bundle={bundle} condition={state.condition} /> : null}
            </div>
            <div className="border-t border-rule">
              <TopoLegend />
            </div>
          </Panel>

          <Panel className="min-h-[240px]">
            {bundle ? <SdpReadout bundle={bundle} condition={state.condition} /> : null}
          </Panel>

          <Panel className="min-h-[240px]">
            {bundle ? <CiPanel bundle={bundle} condition={state.condition} /> : null}
          </Panel>
        </div>

        <Panel
          label="EEG trace"
          aside={`${TRACE_WINDOW_SEC}s window · reconstructed, not raw`}
        >
          <div className="h-[176px]">
            {bundle ? <TraceStrip bundle={bundle} condition={state.condition} /> : null}
          </div>
        </Panel>

        <Panel label="SDP · full condition" aside="drag to scrub">
          <div className="h-[150px]">
            {bundle ? <SdpTimeline bundle={bundle} condition={state.condition} /> : null}
          </div>
          <div className="border-t border-rule">
            <DepthSlider bundle={bundle} />
          </div>
          <div className="border-t border-rule">
            <Transport bundle={bundle} />
          </div>
        </Panel>
      </div>

      <div className="order-3 flex flex-col gap-3">
        <Panel label="Model status">
          {bundle ? <StatusPanel bundle={bundle} condition={state.condition} /> : null}
        </Panel>
        <Panel label="Channel alpha index" aside="vs baseline">
          {bundle ? <ChannelBars bundle={bundle} condition={state.condition} /> : null}
        </Panel>
        <NetworkPanel bundle={bundle} condition={state.condition} />
      </div>
    </div>
  );
}
