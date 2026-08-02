"use client";

import { SimulatedNetworkCanvas } from "./SimulatedNetworkCanvas";
import { Panel } from "./ui/Panel";
import { useSimulatedNetwork } from "@/hooks/useSimulatedNetwork";
import { sdpAt } from "@/lib/signal";
import type { Condition, SubjectBundle } from "@/lib/types";
import { useTime } from "@/state/monitor";

/**
 * Simulated cortical population (Brian2, precomputed — scripts/simulate_network.py).
 *
 * Which of the five precomputed depth buckets is showing is driven by the
 * patient's live SDP, so the panel tracks the demo instead of running on its
 * own story. It is synthetic and says so; it illustrates the mechanism the
 * index is a proxy for, and is not evidence about this patient.
 */
export function NetworkPanel({
  bundle,
  condition,
}: {
  bundle: SubjectBundle | null;
  condition: Condition;
}) {
  const { pickBucket, error } = useSimulatedNetwork();
  const t = useTime(4);

  const sdp = bundle ? sdpAt(bundle.conditions[condition], bundle.sdpFs, t) : null;
  const depth = sdp === null ? 0.5 : Math.min(1, Math.max(0, 1 - sdp / 100));
  const bucket = pickBucket(depth);

  return (
    <Panel label="Simulated population" aside="illustrative — not patient data">
      {bucket ? (
        <>
          <div className="h-[150px]">
            <SimulatedNetworkCanvas
              spikes={bucket.spikes}
              populationRateHz={bucket.population_rate_hz}
              nNeurons={bucket.n_neurons}
              durationS={bucket.duration_s}
              className="h-full w-full"
            />
          </div>
          <p className="border-t border-rule px-4 py-2.5 text-2xs leading-relaxed text-ink-3">
            Spiking model at the depth this patient&apos;s SDP implies. As depth rises,
            firing shifts from independent to shared slow waves — the mechanism the
            index is a proxy for.
          </p>
        </>
      ) : (
        <p className="px-4 py-6 text-2xs text-ink-3">
          {error ? `simulation failed to load: ${error.message}` : "loading simulation…"}
        </p>
      )}
    </Panel>
  );
}
