"use client";

import { ChannelBars } from "./ChannelBars";
import { CiPanel } from "./CiPanel";
import { DepthSlider } from "./DepthSlider";
import { SdpReadout } from "./SdpReadout";
import { SdpTimeline } from "./SdpTimeline";
import { StatusPanel } from "./StatusPanel";
import { Topomap, TopoLegend } from "./Topomap";
import { TRACE_WINDOW_SEC, TraceStrip } from "./TraceStrip";
import { Transport } from "./Transport";
import { SubjectRoster } from "./SubjectRoster";
import { Panel } from "./ui/Panel";
import { CONDITION_LABEL, type Manifest, type SubjectBundle } from "@/lib/types";
import { useMonitor } from "@/state/monitor";

/**
 * Single-patient monitor. Layout follows PRD §8: topomap and the two big
 * numbers on the top row, the trace under them, depth and transport at the
 * bottom, everything else at the edges.
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
    <div className="grid gap-2 xl:grid-cols-[210px_minmax(0,1fr)_260px]">
      <Panel
        label="cohort"
        aside={CONDITION_LABEL[state.condition]}
        className="order-2 max-h-[300px] overflow-y-auto xl:order-1 xl:max-h-none"
      >
        <SubjectRoster manifest={manifest} />
      </Panel>

      <div className="order-1 flex min-w-0 flex-col gap-2 xl:order-2">
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_200px_200px]">
          <Panel
            label={`scalp topography · ${state.subjectId}`}
            aside="click an electrode to pin"
            bodyClassName="flex flex-col"
          >
            <div className="min-h-[300px] flex-1">
              {bundle ? <Topomap bundle={bundle} condition={state.condition} /> : null}
            </div>
            <div className="border-t border-rule">
              <TopoLegend />
            </div>
          </Panel>

          <Panel className="min-h-[220px]">
            {bundle ? <SdpReadout bundle={bundle} condition={state.condition} /> : null}
          </Panel>

          <Panel className="min-h-[220px]">
            {bundle ? <CiPanel bundle={bundle} condition={state.condition} /> : null}
          </Panel>
        </div>

        <Panel
          label="EEG trace · reconstructed"
          aside={`${TRACE_WINDOW_SEC}s window · not raw EEG`}
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

      <div className="order-3 flex flex-col gap-2">
        <Panel label="model status">
          {bundle ? <StatusPanel bundle={bundle} condition={state.condition} /> : null}
        </Panel>
        <Panel label="channel alpha index" aside="vs baseline">
          {bundle ? <ChannelBars bundle={bundle} condition={state.condition} /> : null}
        </Panel>
      </div>
    </div>
  );
}
