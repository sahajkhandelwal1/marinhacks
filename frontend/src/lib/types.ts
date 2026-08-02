/**
 * Wire types for public/data, produced by scripts/bundle-data.mjs from
 * data/synthetic (the probe-prd.md §6 contract, repacked columnar).
 *
 * When real Chennu-derived JSON replaces data/synthetic, the bundler's input
 * changes and nothing here does — same schema, same field meanings.
 */

export const CONDITIONS = ["baseline", "mild", "moderate", "recovery"] as const;
export type Condition = (typeof CONDITIONS)[number];

export interface Electrode {
  /** 10-20 label, e.g. "Fp1". */
  label: string;
  /** Normalized scalp coordinates on the unit circle, nose at +y. */
  x: number;
  y: number;
}

export interface ConditionData {
  condition: Condition;
  /** Propofol target concentration, µg/mL. 0 at baseline. */
  drugConcentration: number;
  /** Behavioral outcome at moderate sedation; constant across a subject's files. */
  responsive: boolean;
  /** Spectral Depth Proxy, 0-100, one value per frame at `sdpFs`. */
  sdp: number[];
  /** Per-electrode alpha index 0-1, one row per frame at `topoFs`. */
  topo: number[][];
  /** Coupling Index — null when Tier 1 did not ship, which is the real state. */
  ci: (number | null)[] | null;
  stats: { median: number; p25: number; p75: number; min: number; max: number };
}

export interface SubjectBundle {
  subject: string;
  responsive: boolean;
  sdpFs: number;
  topoFs: number;
  durationSec: number;
  electrodes: Electrode[];
  conditions: Record<Condition, ConditionData>;
}

export interface ManifestEntry {
  subject: string;
  responsive: boolean;
  conditions: Record<
    Condition,
    { drugConcentration: number; median: number; p25: number; p75: number; min: number; max: number }
  >;
}

export interface Manifest {
  generatedAt: string;
  source: string;
  conditions: Condition[];
  electrodes: Electrode[];
  subjects: ManifestEntry[];
  /** False for every fixture today. Drives the NOT MEASURED panel. */
  ciMeasured: boolean;
}

export const CONDITION_LABEL: Record<Condition, string> = {
  baseline: "BASELINE",
  mild: "MILD",
  moderate: "MODERATE",
  recovery: "RECOVERY",
};
