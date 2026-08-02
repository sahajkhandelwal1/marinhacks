// Data contract + clinical-threshold logic shared across the instrument.

export interface Electrode {
  label: string;
  x: number;
  y: number;
}

export interface Frame {
  t: number;
  topo: number[];
  sdp: number;
  ci: number | null;
  classifier_prob: number | null;
}

export interface Recording {
  subject: string;
  display_name: string;
  condition: string;
  responsive: boolean;
  drug_concentration_ug_ml: number | null;
  fs: number;
  feed: "vigil" | "raw";
  source_label: string;
  electrodes: Electrode[];
  frames: Frame[];
}

export interface ManifestPatient {
  id: string;
  name: string;
  responsive: boolean;
  note: string;
  feed: "vigil" | "raw";
  conditions: { condition: string; file: string }[];
}

export interface Manifest {
  generated_note: string;
  patients: ManifestPatient[];
}

const base = import.meta.env.BASE_URL;

export async function loadManifest(): Promise<Manifest> {
  const res = await fetch(`${base}data/manifest.json`);
  if (!res.ok) throw new Error(`manifest ${res.status}`);
  return res.json();
}

export async function loadRecording(file: string): Promise<Recording> {
  const res = await fetch(`${base}data/${file}`);
  if (!res.ok) throw new Error(`recording ${file} ${res.status}`);
  return res.json();
}

// ---- Clinical interpretation -------------------------------------------------
// SDP is a 0–100 depth index in the vocabulary of processed-EEG depth monitors
// (BIS/SedLine): ~40–60 is the general-anaesthesia target, below that reads as
// deep / "unconscious". CI is a 0–1 coupling fraction against the patient's own
// awake baseline: above ~0.5 the brain is still tracking the room.

export type Verdict = "awake" | "sedated" | "unconscious";

export function sdpVerdict(sdp: number): Verdict {
  if (sdp >= 65) return "awake";
  if (sdp >= 45) return "sedated";
  return "unconscious";
}

export function sdpLabel(sdp: number): string {
  return { awake: "AWAKE", sedated: "SEDATED", unconscious: "UNCONSCIOUS" }[
    sdpVerdict(sdp)
  ];
}

export function ciVerdict(ci: number): "tracking" | "fading" | "decoupled" {
  if (ci >= 0.5) return "tracking";
  if (ci >= 0.35) return "fading";
  return "decoupled";
}

export function ciLabel(ci: number): string {
  return { tracking: "TRACKING ROOM", fading: "FADING", decoupled: "DECOUPLED" }[
    ciVerdict(ci)
  ];
}

export function classifierLabel(p: number): string {
  return p >= 0.5 ? "PREDICTS RESPONSIVE" : "PREDICTS DROWSY";
}

// The demo's core event: the conventional monitor calls the patient
// unconscious while coupling shows the brain still tracking the room.
export function isDisagreement(frame: Frame): boolean {
  if (frame.ci == null) return false;
  return sdpVerdict(frame.sdp) === "unconscious" && frame.ci >= 0.5;
}
