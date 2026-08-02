"use client";

import { useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { CortexLights } from "./CortexLights";
import { buildElectrodeWeights, useBrainMesh, type BrainMesh } from "@/hooks/useBrainMesh";
import { shadeCortex } from "@/lib/cortexShading";
import type { Electrode } from "@/lib/types";

export type BrainThumbProps = {
  electrodes: Electrode[];
  topo: number[];
  /**
   * Fixed yaw. The default is a left-facing lateral view, which puts the
   * anterior-posterior alpha gradient across the screen — the thing these
   * cards exist to show.
   */
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
    [mesh, electrodes],
  );

  // One representative frame, not a playback — so this runs once, not per frame.
  useEffect(() => {
    shadeCortex(mesh, weights, topo, nElec);
  }, [mesh, weights, topo, nElec]);

  // Static, identical viewpoint on every card. These exist to be compared at a
  // glance; auto-rotating them means two cards show different faces at the same
  // moment, which defeats the entire point of the gallery.
  return (
    <group rotation={[0, yaw, 0]}>
      <mesh geometry={mesh.geometry}>
        <meshStandardMaterial
          vertexColors
          roughness={0.72}
          metalness={0}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

/**
 * Compact, non-interactive cortex render for the home-screen gallery. Uses the
 * same geometry and the same shading path as the monitor (lib/cortexShading.ts)
 * so a card cannot look different from what the monitor shows for the same data.
 */
export function BrainThumb({ electrodes, topo, yaw, className }: BrainThumbProps) {
  const { mesh, error } = useBrainMesh();

  return (
    <div className={`relative ${className ?? ""}`}>
      {mesh ? (
        <Canvas
          camera={{ position: [0, 0.3, 2.75], fov: 42 }}
          gl={{ alpha: true, antialias: true }}
          dpr={[1, 1.75]}
        >
          <CortexLights />
          <ThumbCortex mesh={mesh} electrodes={electrodes} topo={topo} yaw={yaw} />
        </Canvas>
      ) : (
        <div className="flex h-full items-center justify-center text-2xs text-ink-3">
          {error ? "mesh error" : "loading…"}
        </div>
      )}
    </div>
  );
}
