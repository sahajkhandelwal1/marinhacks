/**
 * Cortex shading constants.
 *
 * This file previously held a cyan/emerald/amber colormap and a black->white-hot
 * thermal ramp for an additive glow pass. Both were built for the dark theme
 * and neither survives the move to a light one: additive blending over a white
 * card washes straight to white, and a near-black cortex on an off-white page
 * reads as a hole punched in the layout. Activation now comes from the app's
 * single sequential ramp in lib/color.ts (`activationRgb01`), composited
 * normally, so the 3D cortex and the 2D scalp field speak the same color
 * language — which was the original reason this module was extracted.
 */

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * Unactivated cortical tissue: a warm neutral gray, light enough to sit on a
 * white card without reading as a silhouette, desaturated enough that any
 * blue activation on top of it is unambiguous.
 */
export const CORTEX_BASE: [number, number, number] = [0.78, 0.765, 0.755];

/** How much darker a sulcal fundus is than a gyral crown. */
export const SULC_DARKEN = 0.3;
