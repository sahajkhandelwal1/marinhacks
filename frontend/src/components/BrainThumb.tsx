"use client";

import { useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import type { Electrode } from "@/hooks/useVigilData";
import { buildElectrodeWeights, useBrainMesh, type BrainMesh } from "@/hooks/useBrainMesh";
import { makeGlowGeometry, recolorCortex } from "@/lib/cortexShading";
import { cn } from "@/lib/utils";

export type BrainThumbProps = {
  electrodes: Electrode[];
  topo: number[];
  /** Fixed yaw. Default is a left-facing lateral view, which puts the
   *  anterior-posterior alpha gradient across the screen. */
  yaw?: number;
  className?: string;
};

function ThumbCortex({
  mesh,
  electrodes,
  topo,
  yaw = -Math.PI / 2,
}: { mesh: BrainMesh } & Omit<BrainThumbProps, "className">) {
  const nElec = electrodes.length;

  const weights = useMemo(
    () => buildElectrodeWeights(mesh.dirs, electrodes),
    [mesh, electrodes]
  );
  const glowGeo = useMemo(() => makeGlowGeometry(mesh), [mesh]);

  // Single static frame -- these cards show one representative moment, not a
  // playback, so this runs once rather than per-frame.
  useEffect(() => {
    recolorCortex(mesh, glowGeo, weights, topo, nElec);
  }, [mesh, glowGeo, weights, topo, nElec]);

  // Static, identical viewpoint on every card. These exist to be compared at a
  // glance; auto-rotating them means two cards can show different faces at the
  // same moment, which defeats the entire point of the gallery.
  return (
    <group rotation={[0, yaw, 0]}>
      <mesh geometry={mesh.geometry}>
        <meshStandardMaterial
          vertexColors
          roughness={0.85}
          metalness={0.03}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh geometry={glowGeo}>
        <meshBasicMaterial
          vertexColors
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

/**
 * Compact, non-interactive cortex render for the home-screen gallery. Uses the
 * same geometry and shading path as the full monitor view (see
 * lib/cortexShading.ts) so a card can't look different from what the monitor
 * shows for the same data.
 */
export function BrainThumb({ electrodes, topo, yaw, className }: BrainThumbProps) {
  const { mesh, error } = useBrainMesh();

  return (
    <div className={cn("relative", className)}>
      {mesh ? (
        <Canvas
          camera={{ position: [0, 0.3, 2.75], fov: 42 }}
          gl={{ alpha: true, antialias: true }}
          dpr={[1, 1.75]}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.NoToneMapping;
          }}
        >
          <ambientLight intensity={0.38} />
          <directionalLight position={[2, 3, 2]} intensity={1.1} />
          <directionalLight position={[-2, -1, -2]} intensity={0.35} color="#7dd3fc" />
          <ThumbCortex mesh={mesh} electrodes={electrodes} topo={topo} yaw={yaw} />
        </Canvas>
      ) : (
        <div className="flex h-full items-center justify-center font-mono text-[9px] tracking-[0.15em] text-[var(--text-muted)]">
          {error ? "MESH ERROR" : "LOADING..."}
        </div>
      )}
    </div>
  );
}
