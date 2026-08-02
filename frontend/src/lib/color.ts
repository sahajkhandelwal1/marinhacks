/**
 * OKLCH -> sRGB, so sequential ramps are perceptually monotone in lightness
 * rather than monotone in raw RGB (which bands and creates false edges).
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
    return Math.min(1, Math.max(0, c));
  }) as [number, number, number];
}

/**
 * The activation ramp, shared by the 2D scalp field and the 3D cortex.
 *
 * Magnitude is "alpha power relative to this subject's own baseline range"
 * (scripts/sdp.py), 0-1 — a single ordered quantity, so: one hue, and on a
 * light surface it runs light -> dark. That direction is not cosmetic. The
 * dark-theme version ran dark -> bright because low values had to recede
 * toward a near-black card; against white, a bright high end would disappear
 * into the surface exactly where the data matters most.
 *
 * Hue is the accent blue. The low end keeps a trace of chroma so near-zero
 * still reads as "measured and low" rather than as an empty region.
 */
const RAMP_HUE = 248;
const RAMP_STOPS: Array<[number, number]> = [
  // [L, C] at evenly spaced t
  [0.965, 0.012],
  [0.905, 0.038],
  [0.83, 0.072],
  [0.745, 0.108],
  [0.655, 0.135],
  [0.56, 0.15],
  [0.45, 0.145],
];

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Ramp sample in 0-1 float channels — the form three.js vertex colors want. */
export function activationRgb01(t: number): [number, number, number] {
  const clamped = Math.min(1, Math.max(0, t));
  const pos = clamped * (RAMP_STOPS.length - 1);
  const i = Math.min(RAMP_STOPS.length - 2, Math.floor(pos));
  const f = pos - i;
  const L = RAMP_STOPS[i][0] + (RAMP_STOPS[i + 1][0] - RAMP_STOPS[i][0]) * f;
  const C = RAMP_STOPS[i][1] + (RAMP_STOPS[i + 1][1] - RAMP_STOPS[i][1]) * f;
  return oklchToSrgb(L, C, RAMP_HUE);
}

/** 256-entry lookup table — the 2D field samples this per pixel, per frame. */
export const TOPO_LUT: Rgb[] = Array.from({ length: 256 }, (_, i) => {
  const [r, g, b] = activationRgb01(i / 255);
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
});

export function topoColor(t: number): Rgb {
  const i = Math.min(255, Math.max(0, Math.round(t * 255)));
  return TOPO_LUT[i];
}

export function topoCss(t: number): string {
  const { r, g, b } = topoColor(t);
  return `rgb(${r} ${g} ${b})`;
}

/**
 * Ink for text drawn on top of a ramp fill. The ramp darkens as it climbs, so
 * this flips the opposite way from the dark theme's version: white over the
 * saturated high end, deep slate over the pale low end.
 */
export function inkOn(t: number): string {
  return t > 0.55 ? "#ffffff" : "#0f172a";
}

/**
 * Diverging scale for manual mode, −1…+1.
 *
 * A different form from the sequential ramp above because it encodes a
 * different kind of quantity: beam effect is *signed*, so it needs two poles
 * that read as opposite and a midpoint that reads as nothing happening.
 * Cool teal for suppression, warm amber for excitation, and a neutral at zero
 * — never a hue at the midpoint, or "no effect" would look like an effect.
 *
 * The two poles are the app's existing accent and alert hues rather than new
 * colors. Amber means "responded to command" elsewhere in the app; here it
 * means excitation. No view shows both encodings at once, and both readings
 * point the same direction — toward arousal.
 */
const COOL_HUE = 210;
const WARM_HUE = 52;

export function divergingRgb01(v: number): [number, number, number] {
  const t = Math.min(1, Math.max(-1, v));
  const magnitude = Math.abs(t);

  // Neutral midpoint: the unmodulated tissue tone.
  const L = 0.86 - 0.3 * magnitude;
  const C = 0.005 + 0.15 * magnitude;
  return oklchToSrgb(L, C, t < 0 ? COOL_HUE : WARM_HUE);
}

export function divergingCss(v: number): string {
  const [r, g, b] = divergingRgb01(v);
  return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
}
