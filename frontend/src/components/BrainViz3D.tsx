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
import { makeGlowGeometry, recolorCortex } from "@/lib/cortexShading";
import { cn } from "@/lib/utils";

export type BrainViz3DProps = {
  electrodes: Electrode[];
  topo: number[];
  alert?: boolean;
  className?: string;
};

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

  // Second geometry for the additive glow pass. Shares the position/index/
  // normal buffers with the tissue mesh -- only the color attribute differs,
  // so this costs one Float32Array, not a duplicate mesh.
  const glowGeo = useMemo(() => makeGlowGeometry(mesh), [mesh]);

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

  useEffect(() => {
    recolorCortex(mesh, glowGeo, weights, topo, nElec);
  }, [mesh, glowGeo, weights, topo, nElec]);

  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.12;
  });

  return (
    <group ref={groupRef}>
      {/* Lit tissue. DoubleSide is required: the two hemispheres are separate
          open surfaces, so with backface culling you look straight through the
          far hemisphere into the background from many angles. */}
      <mesh geometry={mesh.geometry}>
        <meshStandardMaterial
          vertexColors
          roughness={0.85}
          metalness={0.03}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Additive activation glow. Black contributes nothing, so inactive
          cortex is untouched and hot regions genuinely emit light. */}
      <mesh geometry={glowGeo}>
        <meshBasicMaterial
          vertexColors
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {electrodes.map((e, i) => (
        <mesh key={e.label ?? i} position={markerPositions[i]}>
          <sphereGeometry args={[0.02, 10, 10]} />
          <meshBasicMaterial color={alert ? "#FDE68A" : "#E8F4F8"} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * 3D cortical surface visualization.
 *
 * Geometry is the real fsaverage5 pial surface (FreeSurfer template brain,
 * MRI-derived) exported by scripts/export_brain_mesh.py -- genuine gyri and
 * sulci, not a wrinkled sphere. Deliberately overrides PRD §8's "do not build
 * a 3D brain" guidance per explicit direction.
 *
 * HONESTY: electrode values are *scalp* measurements. Projecting them onto
 * cortex is presentational only -- no inverse problem is solved, so this is
 * not source localization, and the UI says so.
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
          // No tone mapping: ACES would compress exactly the highlights the
          // additive glow pass is trying to blow out.
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.NoToneMapping;
          }}
        >
          <ambientLight intensity={0.38} />
          <directionalLight position={[2, 3, 2]} intensity={1.1} />
          <directionalLight position={[-2, -1, -2]} intensity={0.35} color="#7dd3fc" />
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
