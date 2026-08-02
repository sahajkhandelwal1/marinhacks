/**
 * Wire types for public/data, produced by scripts/bundle-data.mjs from
 * data/synthetic (the probe-prd.md §6 contract, repacked columnar).
 *
 * When real Chennu-derived JSON replaces data/synthetic, the bundler's input
 * changes and nothing here does — same schema, same field meanings.
 */

export const CONDITIONS = ["baseline", "mild", "moderate", "recovery"] as const;
export type Condition = (typeof CONDITIONS)[number];

/**
 * Which bundled dataset the dashboard reads from: "synthetic" (fabricated
 * EEG, real SDP math, the original default) or "real" (real EEGLAB
 * sedation recordings — see pipeline/load_local_eeglab.py and
 * scripts/emit_real_json.py). Both ship in every build, toggled at
 * runtime — see frontend/src/state/monitor.tsx.
 */
export const DATA_SOURCES = ["synthetic", "real"] as const;
export type DataSource = (typeof DATA_SOURCES)[number];

export interface Electrode {
  /** 10-20 label, e.g. "Fp1". */
  label: string;
  /** Normalized scalp coordinates on the unit circle, nose at +y. */
  x: number;
  y: number;
}

export interface ConditionData {
  condition: Condition;
  /** Propofol target concentration, µg/mL. 0 at baseline. Null when the
   * source dataset has no known dosage figure (the real dataset — see
   * scripts/emit_real_json.py). */
  drugConcentration: number | null;
  /** Behavioral outcome at moderate sedation; constant across a subject's files. */
  responsive: boolean;
  /** Spectral Depth Proxy, 0-100, one value per frame at `sdpFs`. */
  sdp: number[];
  /** Per-electrode alpha index 0-1, one row per frame at `topoFs`. */
  topo: number[][];
  /** Coupling Index — null when Tier 1 did not ship, which is the real state. */
  ci: (number | null)[] | null;
  stats: { median: number; p25: number; p75: number; min: number; max: number };
  /** Length of THIS condition. Conditions differ in length on real
   *  recordings, so the bundle-level value cannot be used for time mapping. */
  durationSec: number;
}

export interface SubjectBundle {
  subject: string;
  responsive: boolean;
  sdpFs: number;
  topoFs: number;
  /** Longest condition. A fallback — use the active condition's own
   *  durationSec for anything that maps time to position. */
  durationSec: number;
  electrodes: Electrode[];
  conditions: Record<Condition, ConditionData>;
}

export interface ManifestEntry {
  subject: string;
  responsive: boolean;
  conditions: Record<
    Condition,
    { drugConcentration: number | null; median: number; p25: number; p75: number; min: number; max: number }
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
