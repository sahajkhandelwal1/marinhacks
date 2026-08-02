"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { Canvas, useFrame as useRenderFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import {
  buildElectrodeWeights,
  electrodeDirection,
  useBrainMesh,
  type BrainMesh,
} from "@/hooks/useBrainMesh";
import { shadeCortex } from "@/lib/cortexShading";
import { THEME } from "@/lib/theme";
import type { Electrode } from "@/lib/types";

export type BrainViz3DProps = {
  electrodes: Electrode[];
  /**
   * Live per-electrode alpha index, written in place by the transport loop.
   * A ref rather than an array prop on purpose: the values change 60 times a
   * second, and re-rendering this subtree at that rate would rebuild the r3f
   * scene graph every frame. The ref identity stays stable; only its contents
   * move.
   */
  topoRef: RefObject<Float32Array>;
  alert?: boolean;
  className?: string;
};

// Recolor is ~250k weighted sums across 20,484 vertices. The underlying topo
// data is 2 Hz, so 20 Hz of recolor is already far more than the signal
// carries, and skipping frames leaves the GPU free to hold 60 fps rotation.
const RECOLOR_HZ = 20;

function Cortex({
  mesh,
  electrodes,
  topoRef,
  alert,
}: { mesh: BrainMesh } & Omit<BrainViz3DProps, "className">) {
  const groupRef = useRef<THREE.Group>(null);
  const nElec = electrodes.length;
  const lastRecolor = useRef(0);

  const weights = useMemo(
    () => buildElectrodeWeights(mesh.dirs, electrodes),
    [mesh, electrodes],
  );

  // Snap electrodes to their nearest surface vertex so markers sit on the
  // cortex rather than floating on an imaginary sphere around it.
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
        positions[bestIdx * 3] * 1.035,
        positions[bestIdx * 3 + 1] * 1.035,
        positions[bestIdx * 3 + 2] * 1.035,
      ] as [number, number, number];
    });
  }, [mesh, electrodes]);

  // Paint once on mount so the first frame is never bare tissue.
  useEffect(() => {
    shadeCortex(mesh, weights, topoRef.current, nElec);
  }, [mesh, weights, topoRef, nElec]);

  useRenderFrame((state, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.1;

    const now = state.clock.elapsedTime;
    if (now - lastRecolor.current >= 1 / RECOLOR_HZ) {
      lastRecolor.current = now;
      shadeCortex(mesh, weights, topoRef.current, nElec);
    }
  });

  return (
    <group ref={groupRef}>
      {/* DoubleSide is required: the two hemispheres are separate open
          surfaces, so with backface culling you look straight through the far
          hemisphere into the background from many angles. */}
      <mesh geometry={mesh.geometry}>
        <meshStandardMaterial
          vertexColors
          roughness={0.72}
          metalness={0}
          side={THREE.DoubleSide}
        />
      </mesh>

      {electrodes.map((e, i) => (
        <mesh key={e.label ?? i} position={markerPositions[i]}>
          <sphereGeometry args={[0.018, 10, 10]} />
          <meshBasicMaterial color={alert ? THEME.alert : THEME.ink} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * 3D cortical surface visualization.
 *
 * Geometry is the real fsaverage5 pial surface (FreeSurfer template brain,
 * MRI-derived) exported by scripts/export_brain_mesh.py — genuine gyri and
 * sulci, not a wrinkled sphere.
 *
 * HONESTY: electrode values are *scalp* measurements. Projecting them onto a
 * cortex is presentational only — no inverse problem is solved, so this is not
 * source localization, and the panel says so on screen.
 */
export function BrainViz3D({ electrodes, topoRef, alert = false, className }: BrainViz3DProps) {
  const { mesh, error } = useBrainMesh();

  return (
    <div className={`relative ${className ?? ""}`}>
      {mesh ? (
        <Canvas
          camera={{ position: [0, 0.35, 2.6], fov: 42 }}
          gl={{ alpha: true, antialias: true }}
          dpr={[1, 2]}
        >
          {/* Lit like a specimen on a light table: a strong key from upper
              front, a cool fill from below so the underside doesn't go muddy,
              and enough ambient that no face reads as black. */}
          <ambientLight intensity={1.15} />
          <directionalLight position={[2, 3, 2]} intensity={1.6} />
          <directionalLight position={[-2.5, -1, -1.5]} intensity={0.5} color="#dbe6f5" />
          <Cortex mesh={mesh} electrodes={electrodes} topoRef={topoRef} alert={alert} />
          <OrbitControls
            enablePan={false}
            enableZoom
            minDistance={1.5}
            maxDistance={5}
            dampingFactor={0.08}
          />
        </Canvas>
      ) : (
        <div className="flex h-full items-center justify-center text-2xs text-ink-3">
          {error ? `cortex mesh failed to load: ${error.message}` : "loading cortical surface…"}
        </div>
      )}
    </div>
  );
}
