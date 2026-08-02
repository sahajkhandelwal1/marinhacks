import { TOPO_LUT } from "./color";
import type { Electrode } from "./types";

/**
 * Scalp field interpolation for the topomap: inverse-distance weighting over
 * the electrode positions, rasterized into an ImageData at low resolution and
 * scaled up by the browser's own bilinear filter. That is the whole trick —
 * a 96x96 field upscaled reads as a smooth clinical topomap and costs ~1 ms,
 * where interpolating at display resolution costs 25x that for no visible gain.
 *
 * vigil-prd.md §8 is explicit that this is a 2D topomap and not a 3D brain:
 * a flat topomap reads as an instrument, a rotating mesh reads as a video game.
 */

export const FIELD_SIZE = 96;
/**
 * Higher power = each electrode dominates a wider neighbourhood before the
 * average takes over. At 2.6 the disc collapses to near-uniform mean green
 * with only pinpoint halos at the sensors: technically correct, visually
 * uninformative. 4.0 keeps regional differences readable without going full
 * nearest-neighbour (which would render as hard Voronoi tiles and imply a
 * spatial precision 12 electrodes do not have).
 */
const IDW_POWER = 4.0;
/** Below this the nearest electrode wins outright — avoids a division blowup. */
const EPSILON = 1e-4;

/**
 * Electrodes sit inside the head outline, not on it. Fp1/Fp2/O1/O2 are at
 * radius exactly 1.0 in the data contract, so mapping the unit circle onto the
 * full disc would put them on the clipped boundary — their own values would
 * never appear in the field. Every consumer (field raster and screen-space dot
 * layout) must apply this same factor or the dots drift off their own colors.
 */
export const SCALP_INSET = 0.92;

export interface FieldGeometry {
  /** Electrode positions in field-pixel space. */
  px: Float32Array;
  py: Float32Array;
}

export function fieldGeometry(electrodes: Electrode[]): FieldGeometry {
  const n = electrodes.length;
  const px = new Float32Array(n);
  const py = new Float32Array(n);
  const center = FIELD_SIZE / 2;
  const r = (FIELD_SIZE / 2 - 0.5) * SCALP_INSET;
  for (let i = 0; i < n; i++) {
    // Contract: unit circle, nose at +y. Canvas y grows downward, so flip.
    px[i] = center + electrodes[i].x * r;
    py[i] = center - electrodes[i].y * r;
  }
  return { px, py };
}

/**
 * Rasterize the field. Pixels outside the head disc get alpha 0 so the panel
 * surface shows through and the head outline drawn on top stays the only edge.
 */
export function renderField(
  image: ImageData,
  { px, py }: FieldGeometry,
  values: ArrayLike<number>,
): void {
  const data = image.data;
  const n = values.length;
  const center = FIELD_SIZE / 2;
  const radius = center - 0.5;

  for (let y = 0; y < FIELD_SIZE; y++) {
    for (let x = 0; x < FIELD_SIZE; x++) {
      const o = (y * FIELD_SIZE + x) * 4;
      const dx = x + 0.5 - center;
      const dy = y + 0.5 - center;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > radius) {
        data[o + 3] = 0;
        continue;
      }

      let num = 0;
      let den = 0;
      let exact = -1;
      for (let i = 0; i < n; i++) {
        const ex = x + 0.5 - px[i];
        const ey = y + 0.5 - py[i];
        const d2 = ex * ex + ey * ey;
        if (d2 < EPSILON) {
          exact = i;
          break;
        }
        const w = 1 / Math.pow(d2, IDW_POWER / 2);
        num += w * values[i];
        den += w;
      }

      const v = exact >= 0 ? values[exact] : num / den;
      const rgb = TOPO_LUT[Math.min(255, Math.max(0, Math.round(v * 255)))];

      data[o] = rgb.r;
      data[o + 1] = rgb.g;
      data[o + 2] = rgb.b;
      // Feather the last pixel ring so the disc edge is not stair-stepped.
      data[o + 3] = dist > radius - 1 ? Math.round(255 * (radius - dist)) : 255;
    }
  }
}
