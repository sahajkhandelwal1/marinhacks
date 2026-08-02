"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { Electrode } from "@/hooks/useVigilData";
import {
  buildElectrodeWeights,
  electrodeDirection,
  useBrainMesh,
  type BrainMesh,
} from "@/hooks/useBrainMesh";
import { clamp01, colormapRgb01 } from "@/lib/colormap";
import { cn } from "@/lib/utils";

export type BrainViz3DProps = {
  electrodes: Electrode[];
  topo: number[];
  alert?: boolean;
  className?: string;
};

// Cortical tissue base color (dark, desaturated) -- activity heat reads on
// top of this rather than competing with it.
const CORTEX_BASE: [number, number, number] = [0.42, 0.44, 0.48];
const SULC_DARKEN = 0.42; // how much sulcal fundi darken vs gyral crowns
const ACTIVITY_FLOOR = 0.18; // below this, show tissue rather than heat
const MARKER_LIFT = 1.035; // push electrode markers just off the surface

function recolor(
  mesh: BrainMesh,
  weights: Float32Array,
  topo: number[],
  nElec: number
) {
  const colorAttr = mesh.geometry.getAttribute("color") as THREE.BufferAttribute;
  const colors = colorAttr.array as Float32Array;
  const nVerts = mesh.sulc.length;

  for (let v = 0; v < nVerts; v++) {
    // Scalp-projected activity at this vertex (display projection only --
    // this is not a source-localized cortical estimate).
    let a = 0;
    const base = v * nElec;
    for (let e = 0; e < nElec; e++) a += weights[base + e] * (topo[e] ?? 0);
    a = clamp01(a);

    // Sulcal shading: fundi darker than crowns, which is what makes the
    // folds legible even before scene lighting is applied.
    const shade = 1 - SULC_DARKEN * mesh.sulc[v];
    const br = CORTEX_BASE[0] * shade;
    const bg = CORTEX_BASE[1] * shade;
    const bb = CORTEX_BASE[2] * shade;

    if (a <= ACTIVITY_FLOOR) {
      colors[v * 3] = br;
      colors[v * 3 + 1] = bg;
      colors[v * 3 + 2] = bb;
      continue;
    }

    const k = (a - ACTIVITY_FLOOR) / (1 - ACTIVITY_FLOOR);
    const [hr, hg, hb] = colormapRgb01(a);
    // Keep the fold shading visible through the heat overlay so ridges don't
    // wash out where activity is high.
    colors[v * 3] = br * (1 - k) + hr * shade * k;
    colors[v * 3 + 1] = bg * (1 - k) + hg * shade * k;
    colors[v * 3 + 2] = bb * (1 - k) + hb * shade * k;
  }
  colorAttr.needsUpdate = true;
}

function Cortex({
  mesh,
  electrodes,
  topo,
  alert,
}: { mesh: BrainMesh } & Omit<BrainViz3DProps, "className">) {
  const groupRef = useRef<THREE.Group>(null);
  const nElec = electrodes.length;

  const weights = useMemo(
    () => buildElectrodeWeights(mesh.dirs, electrodes),
    [mesh, electrodes]
  );

  // Snap each electrode to its nearest surface vertex so markers sit on the
  // cortex instead of floating on an imaginary sphere around it.
  const markerPositions = useMemo(() => {
    const nVerts = mesh.dirs.length / 3;
    const positions = mesh.geometry.getAttribute("position").array as Float32Array;
    return electrodes.map((e) => {
      const [ex, ey, ez] = electrodeDirection(e.x, e.y);
      let bestIdx = 0;
      let bestD2 = Infinity;
      for (let v = 0; v < nVerts; v++) {
        const dx = mesh.dirs[v * 3] - ex;
        const dy = mesh.dirs[v * 3 + 1] - ey;
        const dz = mesh.dirs[v * 3 + 2] - ez;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < bestD2) {
          bestD2 = d2;
          bestIdx = v;
        }
      }
      return [
        positions[bestIdx * 3] * MARKER_LIFT,
        positions[bestIdx * 3 + 1] * MARKER_LIFT,
        positions[bestIdx * 3 + 2] * MARKER_LIFT,
      ] as [number, number, number];
    });
  }, [mesh, electrodes]);

  useEffect(() => {
    recolor(mesh, weights, topo, nElec);
  }, [mesh, weights, topo, nElec]);

  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.12;
  });

  return (
    <group ref={groupRef}>
      <mesh geometry={mesh.geometry}>
        {/* Lit material (unlike the earlier sphere version): real gyri/sulci
            need actual shading to read as folds, not just vertex tint. */}
        <meshStandardMaterial
          vertexColors
          roughness={0.82}
          metalness={0.04}
          side={THREE.FrontSide}
        />
      </mesh>

      {electrodes.map((e, i) => (
        <mesh key={e.label ?? i} position={markerPositions[i]}>
          <sphereGeometry args={[0.022, 10, 10]} />
          <meshBasicMaterial color={alert ? "#FDE68A" : "#FFFFFF"} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * 3D cortical surface visualization.
 *
 * Geometry is the real fsaverage5 pial surface (FreeSurfer template brain,
 * MRI-derived) with the Destrieux atlas, exported by
 * scripts/export_brain_mesh.py -- genuine gyri and sulci, not a wrinkled
 * sphere.
 *
 * Deliberately overrides the PRD §8 "do not build a 3D brain" guidance per
 * explicit direction.
 *
 * HONESTY: electrode values are *scalp* measurements. Projecting them onto
 * cortex here is presentational only -- no inverse problem is solved, so this
 * is not source localization and the UI says so.
 */
export function BrainViz3D({ electrodes, topo, alert = false, className }: BrainViz3DProps) {
  const { mesh, error } = useBrainMesh();

  return (
    <div className={cn("relative", className)}>
      {mesh ? (
        <Canvas
          camera={{ position: [0, 0.35, 2.6], fov: 42 }}
          gl={{ alpha: true, antialias: true }}
          dpr={[1, 2]}
        >
          <ambientLight intensity={0.55} />
          <directionalLight position={[2, 3, 2]} intensity={1.5} />
          <directionalLight position={[-2, -1, -2]} intensity={0.5} color="#7dd3fc" />
          <Cortex mesh={mesh} electrodes={electrodes} topo={topo} alert={alert} />
          <OrbitControls
            enablePan={false}
            enableZoom
            minDistance={1.5}
            maxDistance={5}
            dampingFactor={0.08}
          />
        </Canvas>
      ) : (
        <div className="flex h-full items-center justify-center font-mono text-xs tracking-[0.15em] text-[var(--text-muted)]">
          {error ? `CORTEX MESH ERROR: ${error.message}` : "LOADING CORTICAL SURFACE..."}
        </div>
      )}

      <div className="pointer-events-none absolute bottom-1 left-1 right-1 flex flex-col gap-0.5">
        <span className="font-mono text-[9px] tracking-[0.12em] text-[var(--accent-amber)]">
          SCALP PROJECTION — NOT SOURCE LOCALIZED
        </span>
        <span className="font-mono text-[8px] tracking-[0.1em] text-[var(--text-muted)]">
          fsaverage5 pial surface (FreeSurfer) · {electrodes.length} electrodes
        </span>
      </div>
    </div>
  );
}
