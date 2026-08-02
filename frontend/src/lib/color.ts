/**
 * OKLCH -> sRGB, so the topomap's sequential ramp is perceptually monotone in
 * lightness rather than monotone in raw RGB (which bands and creates false
 * edges in a heatmap). One hue, dark -> bright: the sequential rule.
 */

function oklchToSrgb(L: number, C: number, hDeg: number): [number, number, number] {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];

  return lin.map((v) => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, c)) * 255);
  }) as [number, number, number];
}

/**
 * The topomap ramp. Magnitude is "alpha power relative to this subject's own
 * baseline range" (scripts/sdp.py), 0-1 — a single ordered quantity, so: one
 * hue, light end brightest. The dark end sits just above the panel surface so
 * near-zero recedes without vanishing into it.
 */
const RAMP_HUE = 158;
const RAMP_STOPS: Array<[number, number]> = [
  // [L, C] at evenly spaced t. The lightness range is deliberately wide —
  // observed alpha-index values cluster in 0.3-0.7, and a ramp that spends
  // most of its lightness outside that window renders the scalp as one flat
  // glowing disc with the actual variation invisible.
  [0.13, 0.01],
  [0.26, 0.07],
  [0.38, 0.12],
  [0.5, 0.155],
  [0.63, 0.17],
  [0.78, 0.15],
  [0.93, 0.08],
];

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

function sampleRamp(t: number): Rgb {
  const clamped = Math.min(1, Math.max(0, t));
  const pos = clamped * (RAMP_STOPS.length - 1);
  const i = Math.min(RAMP_STOPS.length - 2, Math.floor(pos));
  const f = pos - i;
  const L = RAMP_STOPS[i][0] + (RAMP_STOPS[i + 1][0] - RAMP_STOPS[i][0]) * f;
  const C = RAMP_STOPS[i][1] + (RAMP_STOPS[i + 1][1] - RAMP_STOPS[i][1]) * f;
  const [r, g, b] = oklchToSrgb(L, C, RAMP_HUE);
  return { r, g, b };
}

/** 256-entry lookup table — the topomap samples this per pixel, per frame. */
export const TOPO_LUT: Rgb[] = Array.from({ length: 256 }, (_, i) => sampleRamp(i / 255));

export function topoColor(t: number): Rgb {
  const i = Math.min(255, Math.max(0, Math.round(t * 255)));
  return TOPO_LUT[i];
}

export function topoCss(t: number): string {
  const { r, g, b } = topoColor(t);
  return `rgb(${r} ${g} ${b})`;
}

/**
 * Ink for text drawn *on top of* a ramp fill — dark over the bright end, light
 * over the dark end. Without this, electrode labels vanish into their own
 * field wherever the value is high.
 */
export function inkOn(t: number): string {
  return t > 0.62 ? "#06100c" : "#e4ece9";
}
