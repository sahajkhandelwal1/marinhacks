import { useEffect, useState } from "react";
import * as THREE from "three";
import type { Electrode } from "@/hooks/useVigilData";
import { clamp01 } from "@/lib/colormap";

export type BrainMeshManifest = {
  source: string;
  note: string;
  n_vertices: number;
  n_faces: number;
  n_left_vertices: number;
  region_names: string[];
};

export type BrainMesh = {
  manifest: BrainMeshManifest;
  geometry: THREE.BufferGeometry;
  /** Per-vertex sulcal depth, 0 (gyral crown) - 1 (sulcal fundus). */
  sulc: Float32Array;
  /** Per-vertex parcel id, indexes manifest.region_names. */
  labels: Uint8Array;
  /** Unit direction from brain centroid, per vertex -- the "which part of the
   *  scalp sits above this vertex" proxy used for projecting electrodes. */
  dirs: Float32Array;
};

/**
 * Same azimuthal-equidistant convention the 2D topomap uses: electrode disc
 * coords (nose at +y, unit circle) -> a direction on the head.
 */
export function electrodeDirection(ex: number, ey: number): [number, number, number] {
  const r = clamp01(Math.sqrt(ex * ex + ey * ey));
  const azimuth = Math.atan2(ex, ey); // 0 = anterior, +PI/2 = right
  const polar = r * (Math.PI * 0.62); // disc edge maps a bit past the equator
  const sinP = Math.sin(polar);
  // three.js frame: x = right, y = up (superior), z = toward viewer (anterior)
  return [Math.sin(azimuth) * sinP, Math.cos(polar), Math.cos(azimuth) * sinP];
}

/**
 * Precompute normalized IDW weights mapping each electrode onto every vertex.
 * Done once per (mesh, electrode set) so per-frame recoloring is a cheap
 * weighted sum instead of a full O(verts x electrodes) distance pass.
 */
export function buildElectrodeWeights(
  dirs: Float32Array,
  electrodes: Electrode[]
): Float32Array {
  const nVerts = dirs.length / 3;
  const nElec = electrodes.length;
  const weights = new Float32Array(nVerts * nElec);
  const ed = electrodes.map((e) => electrodeDirection(e.x, e.y));
  const EPS = 0.05; // keeps electrode centers finite and softens the falloff

  for (let v = 0; v < nVerts; v++) {
    const vx = dirs[v * 3];
    const vy = dirs[v * 3 + 1];
    const vz = dirs[v * 3 + 2];
    let sum = 0;
    const base = v * nElec;
    for (let e = 0; e < nElec; e++) {
      const dx = vx - ed[e][0];
      const dy = vy - ed[e][1];
      const dz = vz - ed[e][2];
      const d2 = dx * dx + dy * dy + dz * dz;
      const w = 1 / (d2 * d2 + EPS); // squared-distance^2 -> tighter, more localized blobs
      weights[base + e] = w;
      sum += w;
    }
    if (sum > 0) {
      for (let e = 0; e < nElec; e++) weights[base + e] /= sum;
    }
  }
  return weights;
}

/** Loads the fsaverage5 cortical surface exported by scripts/export_brain_mesh.py. */
export function useBrainMesh() {
  const [mesh, setMesh] = useState<BrainMesh | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [manifestRes, binRes] = await Promise.all([
          fetch("/data/brain/cortex.json"),
          fetch("/data/brain/cortex.bin"),
        ]);
        if (!manifestRes.ok) throw new Error(`cortex.json ${manifestRes.status}`);
        if (!binRes.ok) throw new Error(`cortex.bin ${binRes.status}`);

        const manifest: BrainMeshManifest = await manifestRes.json();
        const buf = await binRes.arrayBuffer();

        const nV = manifest.n_vertices;
        const nF = manifest.n_faces;

        let off = 0;
        const positions = new Float32Array(buf, off, nV * 3);
        off += nV * 3 * 4;
        const indices = new Uint16Array(buf, off, nF * 3);
        off += nF * 3 * 2;
        const sulcRaw = new Uint8Array(buf, off, nV);
        off += nV;
        const labels = new Uint8Array(buf, off, nV);

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometry.setAttribute(
          "color",
          new THREE.BufferAttribute(new Float32Array(nV * 3), 3)
        );
        geometry.computeVertexNormals();

        const sulc = new Float32Array(nV);
        for (let i = 0; i < nV; i++) sulc[i] = sulcRaw[i] / 255;

        // Unit direction from centroid, per vertex.
        const dirs = new Float32Array(nV * 3);
        let cx = 0;
        let cy = 0;
        let cz = 0;
        for (let i = 0; i < nV; i++) {
          cx += positions[i * 3];
          cy += positions[i * 3 + 1];
          cz += positions[i * 3 + 2];
        }
        cx /= nV;
        cy /= nV;
        cz /= nV;
        for (let i = 0; i < nV; i++) {
          const dx = positions[i * 3] - cx;
          const dy = positions[i * 3 + 1] - cy;
          const dz = positions[i * 3 + 2] - cz;
          const len = Math.hypot(dx, dy, dz) || 1;
          dirs[i * 3] = dx / len;
          dirs[i * 3 + 1] = dy / len;
          dirs[i * 3 + 2] = dz / len;
        }

        if (!cancelled) setMesh({ manifest, geometry, sulc, labels, dirs });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { mesh, error };
}
