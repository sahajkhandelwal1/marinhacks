import type { BrainMesh } from "@/hooks/useBrainMesh";

/**
 * Manual mode — the beam sandbox.
 *
 * READ THIS FIRST. Nothing in this file is measured. There is no beam, there
 * is no device, and no dataset in this repo contains an intervention. This is
 * a didactic toy model: a hand-written response curve that lets someone feel
 * what "suppress the frontal lobe" or "drive gamma" would do to a depth index,
 * so the rest of the demo's argument has something to push against.
 *
 * It is kept honest in three ways, and all three should survive any edit:
 *   1. Every panel in this mode is labeled SIMULATION on screen.
 *   2. The targets are real anatomy — Destrieux parcels carried in the mesh —
 *      rather than invented coordinates, so at least the geometry is true.
 *   3. The model is stated in the open, right here, instead of being buried
 *      in a component where it could be mistaken for analysis.
 *
 * If this ever grows into something that claims to predict a real response,
 * it needs a citation and a validation set, not a nicer curve.
 */

export type BeamMode = "suppress" | "stimulate";
export type RegionId = "frontal" | "temporal" | "parietal" | "occipital" | "thalamus";

export interface RegionSpec {
  id: RegionId;
  label: string;
  /** Matches Destrieux parcel names carried in the cortex manifest. */
  pattern: RegExp | null;
  note: string;
}

/**
 * `pattern: null` means the target has no cortical parcel. The thalamus is
 * subcortical and simply is not on this surface — pretending otherwise would
 * be the one outright lie available here. It is modeled as a diffuse
 * thalamocortical effect instead, which is also the physiologically sensible
 * reading: thalamic suppression does not light up one patch of cortex.
 */
export const REGIONS: RegionSpec[] = [
  {
    id: "frontal",
    label: "Frontal lobe",
    pattern: /front|precentral|orbital|opercul/i,
    note: "Where the alpha–delta pattern clinicians read is strongest",
  },
  {
    id: "temporal",
    label: "Temporal lobe",
    pattern: /tempor/i,
    note: "Auditory cortex — first stop for anything said in the room",
  },
  {
    id: "parietal",
    label: "Parietal lobe",
    pattern: /pariet|postcentral|supramar|angular|precuneus/i,
    note: "Posterior hot zone implicated in conscious content",
  },
  {
    id: "occipital",
    label: "Occipital lobe",
    pattern: /occip|calcarine|cuneus|lingual/i,
    note: "Where resting alpha sits when the eyes are closed",
  },
  {
    id: "thalamus",
    label: "Thalamus",
    pattern: null,
    note: "Subcortical — not on this surface. Modeled as a diffuse effect.",
  },
];

export interface BandSpec {
  id: string;
  label: string;
  lo: number;
  hi: number;
}

export const BANDS: BandSpec[] = [
  { id: "delta", label: "Delta", lo: 0.5, hi: 4 },
  { id: "alpha", label: "Alpha", lo: 8, hi: 12 },
  { id: "beta", label: "Beta", lo: 13, hi: 30 },
  { id: "gamma", label: "Gamma", lo: 30, hi: 100 },
];

export const HZ_MIN = 0.5;
export const HZ_MAX = 100;

export function bandFor(hz: number): BandSpec | null {
  return BANDS.find((b) => hz >= b.lo && hz <= b.hi) ?? null;
}

/** Hz slider position, log-scaled — 0.5–100 Hz is two and a half decades. */
export function hzToSlider(hz: number): number {
  return (Math.log(hz) - Math.log(HZ_MIN)) / (Math.log(HZ_MAX) - Math.log(HZ_MIN));
}

export function sliderToHz(t: number): number {
  const hz = Math.exp(Math.log(HZ_MIN) + t * (Math.log(HZ_MAX) - Math.log(HZ_MIN)));
  return Math.round(hz * 10) / 10;
}

export interface BeamState {
  region: RegionId;
  mode: BeamMode;
  /** 0–1. */
  intensity: number;
  hz: number;
}

export const BASELINE_BEAM: BeamState = {
  region: "frontal",
  mode: "suppress",
  intensity: 0,
  hz: 10,
};

export interface Preset {
  id: string;
  label: string;
  description: string;
  beam: BeamState;
}

export const PRESETS: Preset[] = [
  {
    id: "coma",
    label: "Deep coma suppression",
    description: "Diffuse thalamic suppression at full power, driving delta",
    beam: { region: "thalamus", mode: "suppress", intensity: 1, hz: 1.5 },
  },
  {
    id: "spike",
    label: "Localized frontal spike",
    description: "Focal frontal excitation in the gamma range",
    beam: { region: "frontal", mode: "stimulate", intensity: 0.85, hz: 45 },
  },
  {
    id: "reset",
    label: "Reset to baseline",
    description: "Beam off — the recording as it was",
    beam: BASELINE_BEAM,
  },
];

/**
 * Unit direction of a region's centroid, plus its angular spread, derived from
 * the real parcel membership carried in the mesh. The beam is aimed at the
 * centroid and falls off as a Gaussian with the lobe's own spread, so the spot
 * lands on the right anatomy at roughly the right size rather than being a
 * hand-placed blob.
 */
export interface RegionGeometry {
  /** Unit direction from the brain centroid. Null for non-cortical targets. */
  dir: [number, number, number] | null;
  /** Angular standard deviation, radians. */
  spread: number;
}

export function regionGeometry(mesh: BrainMesh, region: RegionSpec): RegionGeometry {
  if (!region.pattern) return { dir: null, spread: 0 };

  const names = mesh.manifest.region_names;
  const wanted = new Set<number>();
  names.forEach((name, i) => {
    if (region.pattern!.test(name)) wanted.add(i);
  });

  let cx = 0;
  let cy = 0;
  let cz = 0;
  let n = 0;
  const nVerts = mesh.labels.length;
  for (let v = 0; v < nVerts; v++) {
    if (!wanted.has(mesh.labels[v])) continue;
    cx += mesh.dirs[v * 3];
    cy += mesh.dirs[v * 3 + 1];
    cz += mesh.dirs[v * 3 + 2];
    n++;
  }
  if (n === 0) return { dir: null, spread: 0 };

  const len = Math.hypot(cx, cy, cz) || 1;
  const dir: [number, number, number] = [cx / len, cy / len, cz / len];

  // Angular spread of the parcel set about its own centroid.
  let sum = 0;
  for (let v = 0; v < nVerts; v++) {
    if (!wanted.has(mesh.labels[v])) continue;
    const dot =
      mesh.dirs[v * 3] * dir[0] +
      mesh.dirs[v * 3 + 1] * dir[1] +
      mesh.dirs[v * 3 + 2] * dir[2];
    const angle = Math.acos(Math.min(1, Math.max(-1, dot)));
    sum += angle * angle;
  }
  return { dir, spread: Math.max(0.35, Math.sqrt(sum / n)) };
}

/**
 * Per-vertex signed modulation in −1…+1. Negative is suppression, positive is
 * excitation, zero is untouched tissue.
 *
 * Writes into `out` so the render loop stays allocation-free.
 */
export function beamModulation(
  mesh: BrainMesh,
  geometry: RegionGeometry,
  beam: BeamState,
  out: Float32Array,
): Float32Array {
  const sign = beam.mode === "stimulate" ? 1 : -1;
  const amount = sign * beam.intensity;
  const nVerts = mesh.labels.length;

  if (!geometry.dir) {
    // Diffuse target (thalamus): every vertex, no spatial structure. Slightly
    // under full strength so it stays distinguishable from a focal beam at the
    // same intensity.
    out.fill(amount * 0.8);
    return out;
  }

  const [dx, dy, dz] = geometry.dir;
  const twoSigmaSq = 2 * geometry.spread * geometry.spread;

  for (let v = 0; v < nVerts; v++) {
    const dot =
      mesh.dirs[v * 3] * dx + mesh.dirs[v * 3 + 1] * dy + mesh.dirs[v * 3 + 2] * dz;
    const angle = Math.acos(Math.min(1, Math.max(-1, dot)));
    out[v] = amount * Math.exp(-(angle * angle) / twoSigmaSq);
  }
  return out;
}

/**
 * Effect of the beam on the depth index, as a signed delta in SDP points.
 *
 * The shape of this curve is asserted, not fitted. Two things it deliberately
 * encodes, both of which are the point of the exercise rather than a result:
 *
 *   - Suppression pushes the index down hard; excitation lifts it less. A
 *     depth index is far better at detecting slowing than arousal, which is
 *     the asymmetry the whole product argument rests on.
 *   - Driving in delta drags the index down whichever way the beam points,
 *     because SDP is a log alpha/delta ratio and delta sits in its denominator.
 *     Drive enough delta and the monitor reports a deeper patient — without
 *     anything having happened to consciousness.
 */
export function sdpDelta(beam: BeamState): number {
  if (beam.intensity <= 0) return 0;

  const directional = beam.mode === "suppress" ? -34 : 16;
  const bandPull = beam.hz <= 4 ? -18 : beam.hz >= 30 ? 6 : 0;
  return (directional + bandPull) * beam.intensity;
}

/**
 * One sample of the simulated response trace.
 *
 * Baseline is the patient's own reconstructed rhythm (see lib/trace.ts); the
 * beam adds a driven component at its own frequency and rescales the rest.
 */
export function manualTraceSample(
  t: number,
  baseline: number,
  beam: BeamState,
  seed: number,
): number {
  if (beam.intensity <= 0) return baseline;

  const phase = (seed % 7) * 0.9;
  const driven = Math.sin(2 * Math.PI * beam.hz * t + phase);

  if (beam.mode === "suppress") {
    // Intrinsic rhythm is damped and a slow wave is imposed on top of it.
    return baseline * (1 - 0.75 * beam.intensity) + driven * 1.6 * beam.intensity;
  }
  // Excitation rides on top without erasing what was already there.
  return baseline * (1 + 0.35 * beam.intensity) + driven * 1.1 * beam.intensity;
}
