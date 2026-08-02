import * as THREE from "three";
import type { BrainMesh } from "@/hooks/useBrainMesh";
import { clamp01, heatRgb01 } from "@/lib/colormap";

// Shared by the full monitor view and the home-screen thumbnails so the two
// can't drift into different-looking renderings of the same data.

// Cortical tissue base: deliberately dark. Additive glow over a mid-gray
// substrate washes out to pastel; over dark tissue it reads as emitted light.
export const CORTEX_BASE: [number, number, number] = [0.19, 0.205, 0.235];
export const SULC_DARKEN = 0.55; // sulcal fundi vs gyral crowns

// Display contrast stretch. Projected activity occupies a narrow band, so
// without this almost every vertex clears the glow threshold and the whole
// cortex washes uniformly. Fixed bounds rather than per-frame min/max:
// per-frame renormalization would make a flat brain look dramatic and
// wouldn't be comparable between frames or between subjects -- which matters
// especially on the home screen, where cards sit side by side.
// Retuned after topo gained real anteriorization structure: the projected
// range widened (~0.29 posterior to ~0.71 frontal at moderate sedation), and
// the previous 0.36-0.66 window clipped the entire frontal region to solid
// white-hot instead of showing the gradient.
export const ACTIVITY_LO = 0.30;
export const ACTIVITY_HI = 0.80;

export const GLOW_FLOOR = 0.12; // applied to the stretched value
export const GLOW_EXP = 1.65; // >1 tightens the hot core
// Just above 1: enough to read as emitted light, low enough that the ramp's
// color survives instead of clipping every channel toward white.
export const GLOW_GAIN = 1.45;

/**
 * Second geometry for the additive glow pass. Shares the tissue mesh's
 * position/index/normal buffers -- only the color attribute differs, so this
 * costs one Float32Array rather than a duplicate mesh.
 */
export function makeGlowGeometry(mesh: BrainMesh): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", mesh.geometry.getAttribute("position"));
  g.setAttribute("normal", mesh.geometry.getAttribute("normal"));
  const idx = mesh.geometry.getIndex();
  if (idx) g.setIndex(idx);
  g.setAttribute(
    "color",
    new THREE.BufferAttribute(new Float32Array(mesh.sulc.length * 3), 3)
  );
  return g;
}

/**
 * Tissue colors depend only on sulcal depth, which never changes -- so this
 * runs once per mesh rather than per frame. Rewriting it every frame also
 * forced a redundant ~245KB GPU buffer upload each time.
 */
export function initTissueColors(mesh: BrainMesh) {
  const attr = mesh.geometry.getAttribute("color") as THREE.BufferAttribute;
  const tissue = attr.array as Float32Array;
  for (let v = 0; v < mesh.sulc.length; v++) {
    const shade = 1 - SULC_DARKEN * mesh.sulc[v];
    tissue[v * 3] = CORTEX_BASE[0] * shade;
    tissue[v * 3 + 1] = CORTEX_BASE[1] * shade;
    tissue[v * 3 + 2] = CORTEX_BASE[2] * shade;
  }
  attr.needsUpdate = true;
}

/** Per-frame: writes only the additive-glow colors for the given topo frame. */
export function recolorCortex(
  mesh: BrainMesh,
  glowGeo: THREE.BufferGeometry,
  weights: Float32Array,
  topo: number[],
  nElec: number
) {
  const glowAttr = glowGeo.getAttribute("color") as THREE.BufferAttribute;
  const glow = glowAttr.array as Float32Array;
  const nVerts = mesh.sulc.length;

  for (let v = 0; v < nVerts; v++) {
    // Scalp-projected activity (display projection -- not source localized).
    let a = 0;
    const base = v * nElec;
    for (let e = 0; e < nElec; e++) a += weights[base + e] * (topo[e] ?? 0);
    a = clamp01(a);

    const shade = 1 - SULC_DARKEN * mesh.sulc[v];
    const s = clamp01((a - ACTIVITY_LO) / (ACTIVITY_HI - ACTIVITY_LO));
    if (s <= GLOW_FLOOR) {
      glow[v * 3] = 0;
      glow[v * 3 + 1] = 0;
      glow[v * 3 + 2] = 0;
      continue;
    }
    const k = (s - GLOW_FLOOR) / (1 - GLOW_FLOOR);
    const [r, g, b] = heatRgb01(Math.pow(k, GLOW_EXP), GLOW_GAIN);
    // Carry fold shading into the glow too, so gyri/sulci stay legible in the
    // overexposed hot core instead of flattening into a solid blob.
    const gs = 0.34 + 0.66 * shade;
    glow[v * 3] = r * gs;
    glow[v * 3 + 1] = g * gs;
    glow[v * 3 + 2] = b * gs;
  }

  glowAttr.needsUpdate = true;
}
