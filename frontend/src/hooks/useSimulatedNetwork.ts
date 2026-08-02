import { useEffect, useState } from "react";

export type SimulatedNetworkData = {
  depth: number;
  n_neurons: number;
  duration_s: number;
  rate_bin_ms: number;
  spikes: { t: number; neuron: number }[];
  population_rate_hz: number[];
};

const DEPTH_BUCKETS = [0, 25, 50, 75, 100];

/**
 * Loads all 5 precomputed Brian2 network buckets once (see
 * scripts/simulate_network.py). Illustrative/synthetic only -- not derived
 * from any patient data, real or otherwise.
 */
export function useSimulatedNetwork() {
  const [buckets, setBuckets] = useState<Record<number, SimulatedNetworkData> | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      DEPTH_BUCKETS.map((b) =>
        fetch(`/data/simulated/depth_${String(b).padStart(3, "0")}.json`).then((r) => {
          if (!r.ok) throw new Error(`failed to load depth_${b} (${r.status})`);
          return r.json() as Promise<SimulatedNetworkData>;
        })
      )
    )
      .then((results) => {
        if (cancelled) return;
        const map: Record<number, SimulatedNetworkData> = {};
        DEPTH_BUCKETS.forEach((b, i) => {
          map[b] = results[i];
        });
        setBuckets(map);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const pickBucket = (depth01: number): SimulatedNetworkData | null => {
    if (!buckets) return null;
    const clamped = Math.min(1, Math.max(0, depth01));
    const nearest = DEPTH_BUCKETS.reduce((best, b) =>
      Math.abs(b / 100 - clamped) < Math.abs(best / 100 - clamped) ? b : best
    );
    return buckets[nearest] ?? null;
  };

  return { buckets, error, pickBucket };
}
