import type { Condition, ConditionData, SubjectBundle } from "./types";

/** Linear sample of a 1-D series at a fractional index. */
export function sampleSeries(series: number[], index: number): number {
  if (series.length === 0) return 0;
  const clamped = Math.min(series.length - 1, Math.max(0, index));
  const i = Math.floor(clamped);
  const f = clamped - i;
  if (i >= series.length - 1) return series[series.length - 1];
  return series[i] + (series[i + 1] - series[i]) * f;
}

/** SDP at time t (seconds). */
export function sdpAt(data: ConditionData, fs: number, t: number): number {
  return sampleSeries(data.sdp, t * fs);
}

/**
 * Per-electrode alpha index at time t, interpolated between the 2 Hz rows the
 * bundler ships. Writes into `out` to keep the render loop allocation-free.
 */
export function topoAt(data: ConditionData, fs: number, t: number, out: Float32Array): Float32Array {
  const rows = data.topo;
  if (rows.length === 0) return out;
  const pos = Math.min(rows.length - 1, Math.max(0, t * fs));
  const i = Math.floor(pos);
  const f = pos - i;
  const a = rows[i];
  const b = rows[Math.min(rows.length - 1, i + 1)];
  for (let c = 0; c < a.length; c++) out[c] = a[c] + (b[c] - a[c]) * f;
  return out;
}

/**
 * Depth-of-anesthesia band for an SDP value.
 *
 * The thresholds are the conventional BIS reading bands. SDP is not BIS and we
 * do not claim it is (PRD §7.1) — it is deliberately scaled 0-100 so a
 * clinician's existing intuition applies, and applying that intuition is the
 * entire point of the demo: the monitor says "unconscious" about someone who
 * is answering questions.
 */
export type DepthBand = "awake" | "sedated" | "general" | "deep";

export function depthBand(sdp: number): DepthBand {
  if (sdp >= 85) return "awake";
  if (sdp >= 60) return "sedated";
  if (sdp >= 40) return "general";
  return "deep";
}

export const DEPTH_BAND_LABEL: Record<DepthBand, string> = {
  awake: "AWAKE",
  sedated: "SEDATED",
  general: "GENERAL ANESTHESIA",
  deep: "DEEP ANESTHESIA",
};

export const DEPTH_BAND_NOTE: Record<DepthBand, string> = {
  awake: "responsive to voice expected",
  sedated: "light sedation range",
  general: "surgical range — response not expected",
  deep: "burst suppression risk range",
};

/**
 * Scalp regions for the 10-20 labels we ship. Deliberately named by scalp
 * position, not by cortical area: a topomap is a scalp measurement and calling
 * an electrode "prefrontal cortex" would be a claim the data cannot support.
 */
const REGION_BY_LABEL: Record<string, string> = {
  Fp1: "FRONTOPOLAR L",
  Fp2: "FRONTOPOLAR R",
  F3: "FRONTAL L",
  F4: "FRONTAL R",
  Fz: "FRONTAL MIDLINE",
  C3: "CENTRAL L",
  C4: "CENTRAL R",
  Cz: "CENTRAL MIDLINE",
  P3: "PARIETAL L",
  P4: "PARIETAL R",
  O1: "OCCIPITAL L",
  O2: "OCCIPITAL R",
};

export function regionOf(label: string): string {
  return REGION_BY_LABEL[label] ?? label.toUpperCase();
}

/** Index of the electrode carrying the most alpha power right now. */
export function peakChannel(values: ArrayLike<number>): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i] > values[best]) best = i;
  return best;
}

export function conditionOf(bundle: SubjectBundle, condition: Condition): ConditionData {
  return bundle.conditions[condition];
}
