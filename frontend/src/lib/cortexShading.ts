import type { BrainMesh } from "@/hooks/useBrainMesh";
import { activationRgb01, divergingPoleRgb01 } from "@/lib/color";
import { clamp01 } from "@/lib/colormap";

/**
 * Shared by the monitor's cortex and the home-screen thumbnails, so the two
 * cannot drift into different-looking renderings of the same data.
 *
 * Light-theme compositing, not the additive glow pass this file originally
 * held. Additive blending over a white card washes straight to white, and a
 * dark cortex on an off-white page reads as a hole punched in the layout. Here
 * activation blends tissue toward the app's single sequential ramp with normal
 * compositing: more active means more saturated and darker, which is the only
 * direction that survives a light ground.
 *
 * One consequence worth knowing: because tissue and activation share a single
 * color attribute, this rewrites every vertex rather than only the lit ones.
 * That is why the monitor throttles it (RECOLOR_HZ in BrainViz3D) instead of
 * running it on every frame.
 */

/** Unactivated cortical tissue: light warm neutral gray. */
export const CORTEX_BASE: [number, number, number] = [0.78, 0.765, 0.755];

/** How much darker a sulcal fundus is than a gyral crown. */
export const SULC_DARKEN = 0.3;

/**
 * Display contrast stretch. Fixed bounds rather than per-frame min/max:
 * per-frame renormalization would make a flat brain look dramatic and wouldn't
 * be comparable between frames or between subjects — which matters especially
 * on the home screen, where cards sit side by side.
 *
 * Widened from 0.36–0.66 once topo gained real anteriorization structure: the
 * projected range is now roughly 0.29 posterior to 0.71 frontal at moderate
 * sedation, and the old window flattened the whole frontal region to one tone
 * instead of showing the gradient.
 */
export const ACTIVITY_LO = 0.3;
export const ACTIVITY_HI = 0.8;

/** Below this a vertex stays bare tissue, so inactive cortex reads as anatomy. */
export const TINT_FLOOR = 0.1;
export const TINT_EXP = 1.1;

/**
 * Project the scalp values onto the surface and write the vertex colors.
 *
 * The projection is inverse-distance weighting from electrode directions,
 * precomputed per mesh. It is a display projection: no inverse problem is
 * solved here, so this is not source localization.
 */
export function shadeCortex(
  mesh: BrainMesh,
  weights: Float32Array,
  topo: ArrayLike<number>,
  nElec: number,
): void {
  const attr = mesh.geometry.getAttribute("color") as {
    array: Float32Array;
    needsUpdate: boolean;
  };
  const colors = attr.array;
  const nVerts = mesh.sulc.length;

  for (let v = 0; v < nVerts; v++) {
    let a = 0;
    const base = v * nElec;
    for (let e = 0; e < nElec; e++) a += weights[base + e] * (topo[e] ?? 0);
    a = clamp01(a);

    // Fold shading: fundi darker than crowns. This is what makes gyri and
    // sulci legible independently of scene lighting.
    const shade = 1 - SULC_DARKEN * mesh.sulc[v];
    const s = clamp01((a - ACTIVITY_LO) / (ACTIVITY_HI - ACTIVITY_LO));

    if (s <= TINT_FLOOR) {
      colors[v * 3] = CORTEX_BASE[0] * shade;
      colors[v * 3 + 1] = CORTEX_BASE[1] * shade;
      colors[v * 3 + 2] = CORTEX_BASE[2] * shade;
      continue;
    }

    const k = Math.pow((s - TINT_FLOOR) / (1 - TINT_FLOOR), TINT_EXP);
    const [r, g, b] = activationRgb01(s);
    colors[v * 3] = (CORTEX_BASE[0] * (1 - k) + r * k) * shade;
    colors[v * 3 + 1] = (CORTEX_BASE[1] * (1 - k) + g * k) * shade;
    colors[v * 3 + 2] = (CORTEX_BASE[2] * (1 - k) + b * k) * shade;
  }

  attr.needsUpdate = true;
}

/**
 * Below this a vertex is treated as unmodulated, so numerical dribble at the
 * edge of a beam's falloff stays bare tissue instead of a faint wash.
 */
const MOD_FLOOR = 0.06;

/** The measured-activation inputs, when a caller wants to tint over them. */
export interface ActivationSource {
  weights: Float32Array;
  topo: ArrayLike<number>;
  nElec: number;
}

/** Tissue-or-activation base tone for one vertex, before sulcal shading. */
function baseTone(
  v: number,
  activation: ActivationSource | null,
  out: [number, number, number],
): void {
  if (!activation) {
    out[0] = CORTEX_BASE[0];
    out[1] = CORTEX_BASE[1];
    out[2] = CORTEX_BASE[2];
    return;
  }

  const { weights, topo, nElec } = activation;
  let a = 0;
  const base = v * nElec;
  for (let e = 0; e < nElec; e++) a += weights[base + e] * (topo[e] ?? 0);
  const s = clamp01((clamp01(a) - ACTIVITY_LO) / (ACTIVITY_HI - ACTIVITY_LO));

  if (s <= TINT_FLOOR) {
    out[0] = CORTEX_BASE[0];
    out[1] = CORTEX_BASE[1];
    out[2] = CORTEX_BASE[2];
    return;
  }

  const k = Math.pow((s - TINT_FLOOR) / (1 - TINT_FLOOR), TINT_EXP);
  const [r, g, b] = activationRgb01(s);
  out[0] = CORTEX_BASE[0] * (1 - k) + r * k;
  out[1] = CORTEX_BASE[1] * (1 - k) + g * k;
  out[2] = CORTEX_BASE[2] * (1 - k) + b * k;
}

/**
 * Paint the cortex by signed beam effect, composited over what was there.
 *
 * The distinction from an earlier version of this that lived in BeamStage: it
 * *replaced* every vertex with a sample of the diverging ramp, so a diffuse
 * target — the thalamus fills every vertex with the same value — repainted the
 * whole surface a flat off-palette color, and entering the sandbox read as the
 * brain changing material rather than as tissue being modulated. Here the base
 * tone is whatever the surface already means (bare tissue, or the measured
 * activation shading if `activation` is supplied) and the pole color is
 * blended over it by magnitude, exactly the way activation is blended over
 * tissue in `shadeCortex`.
 *
 * That gives the two properties a scene transition needs. At `mix` 0 with an
 * activation source this is pixel-for-pixel `shadeCortex`, so a caller easing
 * the sandbox in never crosses a boundary between two materials. At any `mix`
 * an unmodulated vertex is exactly its unmodulated tone, so the palette cannot
 * shift out from under the rest of the scene.
 */
export function shadeModulated(
  mesh: BrainMesh,
  modulation: ArrayLike<number>,
  mix = 1,
  activation: ActivationSource | null = null,
): void {
  const attr = mesh.geometry.getAttribute("color") as {
    array: Float32Array;
    needsUpdate: boolean;
  };
  const colors = attr.array;
  const nVerts = mesh.sulc.length;
  const strength = clamp01(mix);
  const tone: [number, number, number] = [0, 0, 0];

  for (let v = 0; v < nVerts; v++) {
    const shade = 1 - SULC_DARKEN * mesh.sulc[v];
    const m = modulation[v] * strength;
    const magnitude = Math.min(1, Math.abs(m));

    baseTone(v, activation, tone);

    if (magnitude <= MOD_FLOOR) {
      colors[v * 3] = tone[0] * shade;
      colors[v * 3 + 1] = tone[1] * shade;
      colors[v * 3 + 2] = tone[2] * shade;
      continue;
    }

    const k = Math.pow((magnitude - MOD_FLOOR) / (1 - MOD_FLOOR), TINT_EXP);
    const [r, g, b] = divergingPoleRgb01(m);
    colors[v * 3] = (tone[0] * (1 - k) + r * k) * shade;
    colors[v * 3 + 1] = (tone[1] * (1 - k) + g * k) * shade;
    colors[v * 3 + 2] = (tone[2] * (1 - k) + b * k) * shade;
  }

  attr.needsUpdate = true;
}
