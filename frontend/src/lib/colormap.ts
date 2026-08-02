// Shared 3-stop colormap (cyan -> emerald -> amber), interpolated in HSL.
// Extracted from TopomapCanvas so the 2D and 3D visualizations stay visually
// consistent instead of drifting into two different color languages.

export type Hsl = [number, number, number]; // h: 0-360, s: 0-1, l: 0-1

export function hexToHsl(hex: string): Hsl {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return [h, s, l];
}

export function hslToRgb([h, s, l]: Hsl): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rgb: [number, number, number];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = l - c / 2;
  return [
    Math.round((rgb[0] + m) * 255),
    Math.round((rgb[1] + m) * 255),
    Math.round((rgb[2] + m) * 255),
  ];
}

function lerpHsl(a: Hsl, b: Hsl, u: number): Hsl {
  let dh = b[0] - a[0];
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  return [a[0] + dh * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

const STOP_CYAN = hexToHsl("#06B6D4");
const STOP_EMERALD = hexToHsl("#10B981");
const STOP_AMBER = hexToHsl("#F59E0B");

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Map a normalized value [0,1] to rgba, cyan -> emerald -> amber. */
export function colormap(t: number): { r: number; g: number; b: number; a: number } {
  const v = clamp01(t);
  const hsl =
    v < 0.5
      ? lerpHsl(STOP_CYAN, STOP_EMERALD, v * 2)
      : lerpHsl(STOP_EMERALD, STOP_AMBER, (v - 0.5) * 2);
  const [r, g, b] = hslToRgb(hsl);
  return { r, g, b, a: 0.8 + 0.15 * v };
}

export function colormapCss(t: number, alpha = 1): string {
  const { r, g, b } = colormap(t);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Same colormap, returned as [0,1] floats for three.js vertex colors. */
export function colormapRgb01(t: number): [number, number, number] {
  const { r, g, b } = colormap(t);
  return [r / 255, g / 255, b / 255];
}
