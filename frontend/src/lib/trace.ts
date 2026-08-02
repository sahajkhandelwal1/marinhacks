/**
 * Waveform reconstruction for the scrolling trace.
 *
 * READ THIS BEFORE BELIEVING THE TRACE. The data contract (vigil-prd.md §6)
 * deliberately does not ship raw EEG — 10 fps of index values goes to the
 * browser, 250 Hz of samples does not. So the trace is *reconstructed* from
 * the two things we do ship: SDP (frontal alpha/delta balance) and the
 * per-electrode alpha index. It reproduces the generator in
 * scripts/emit_json.py — alpha component, delta component, 1/f background,
 * amplitudes driven by sedation depth — so the shape and the band balance
 * track the real index values, sample-for-sample it is not the patient's EEG.
 * The UI labels it RECONSTRUCTED wherever it appears. Do not present it as raw.
 *
 * Everything is a pure function of absolute time, so scrubbing lands on the
 * exact same waveform as playing to that point — no ring buffer, no drift.
 */

const ALPHA_HZ = 10;
const DELTA_HZ = 1.5;
const OCTAVES = 12;

function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * 1/f-weighted background, built from fixed-frequency components with seeded
 * phases: continuous in t (so it survives scrubbing) and cheap enough to
 * evaluate once per pixel column, per channel, per frame.
 */
function background(t: number, seed: number): number {
  let sum = 0;
  let norm = 0;
  for (let k = 0; k < OCTAVES; k++) {
    const f = 2 + k * 3.5;
    const amp = 1 / Math.pow(f, 0.9);
    sum += amp * Math.sin(2 * Math.PI * f * t + hash01(seed * 31 + k) * Math.PI * 2);
    norm += amp;
  }
  return sum / norm;
}

export interface TraceParams {
  /** SDP 0-100 at this instant — sets the alpha/delta balance. */
  sdp: number;
  /** This channel's alpha index 0-1, relative to the channel mean. */
  alphaIndex: number;
  /** Stable per-channel seed so each row has its own phase. */
  seed: number;
}

/**
 * Amplitude at time `t` in arbitrary units, roughly -4..4.
 * Mirrors scripts/emit_json.py `_synthetic_eeg`: as depth rises, alpha
 * collapses and delta grows — the frontal alpha-delta pattern clinicians read
 * as proof of unconsciousness.
 */
export function traceSample(t: number, { sdp, alphaIndex, seed }: TraceParams): number {
  const depth = 1 - Math.min(100, Math.max(0, sdp)) / 100;
  const alphaAmp = (1 - 0.75 * depth) * (0.55 + 0.9 * alphaIndex);
  const deltaAmp = 0.3 + 2.6 * depth;

  const phaseA = hash01(seed) * Math.PI * 2;
  const phaseD = hash01(seed + 17) * Math.PI * 2;

  return (
    alphaAmp * Math.sin(2 * Math.PI * ALPHA_HZ * t + phaseA) +
    deltaAmp * Math.sin(2 * Math.PI * DELTA_HZ * t + phaseD) +
    0.6 * background(t, seed)
  );
}
