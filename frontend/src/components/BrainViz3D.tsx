"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { Electrode } from "@/hooks/useVigilData";
import { clamp01, colormapRgb01 } from "@/lib/colormap";
import { cn } from "@/lib/utils";

export type BrainViz3DProps = {
  electrodes: Electrode[];
  topo: number[];
  alert?: boolean;
  className?: string;
};

// Slightly more than a hemisphere, matching how an EEG cap actually extends
// a bit past the "equator" toward ear level -- a pure hemisphere reads as a
// dome with a hard flat cutoff.
const THETA_LENGTH = (100 * Math.PI) / 180;
const SPHERE_SEGMENTS_W = 64;
const SPHERE_SEGMENTS_H = 40;
const IDW_EPSILON = 0.02;

/** Same 2D unit-disc electrode coords (nose at +y) -> 3D point on the unit
 * sphere, using the same (phi, theta) parameterization as THREE.SphereGeometry
 * so electrode markers sit exactly on the mesh surface. */
function discToSphere(ex: number, ey: number): [number, number, number] {
  const r = clamp01(Math.sqrt(ex * ex + ey * ey));
  const theta2d = Math.atan2(ex, ey); // 0 = nose, +PI/2 = right
  const phi = theta2d + Math.PI / 2;
  const theta = r * THETA_LENGTH;
  const x = -Math.cos(phi) * Math.sin(theta);
  const y = Math.cos(theta);
  const z = Math.sin(phi) * Math.sin(theta);
  return [x, y, z];
}

function buildGeometry(electrodes: Electrode[], topo: number[]) {
  const geo = new THREE.SphereGeometry(
    1, SPHERE_SEGMENTS_W, SPHERE_SEGMENTS_H, 0, Math.PI * 2, 0, THETA_LENGTH
  );
  const pos = geo.attributes.position;
  const electrode3D = electrodes.map((e, i) => {
    const [x, y, z] = discToSphere(e.x, e.y);
    return { x, y, z, v: clamp01(topo[i] ?? 0) };
  });

  const colors = new Float32Array(pos.count * 3);
  for (let vi = 0; vi < pos.count; vi++) {
    const vx = pos.getX(vi);
    const vy = pos.getY(vi);
    const vz = pos.getZ(vi);
    let num = 0;
    let den = 0;
    for (const p of electrode3D) {
      const dx = vx - p.x;
      const dy = vy - p.y;
      const dz = vz - p.z;
      const w = 1 / (dx * dx + dy * dy + dz * dz + IDW_EPSILON);
      num += w * p.v;
      den += w;
    }
    const [r, g, b] = colormapRgb01(den > 0 ? num / den : 0.5);
    colors[vi * 3] = r;
    colors[vi * 3 + 1] = g;
    colors[vi * 3 + 2] = b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return { geo, electrode3D };
}

function HeadMesh({ electrodes, topo, alert }: Omit<BrainViz3DProps, "className">) {
  const ringRef = useRef<THREE.Mesh>(null);

  const { geo, electrode3D } = useMemo(
    () => buildGeometry(electrodes, topo),
    [electrodes, topo]
  );

  useFrame((_, delta) => {
    if (ringRef.current) {
      ringRef.current.rotation.z += delta * 0.25;
    }
  });

  const ringColor = alert ? "#F59E0B" : "#06B6D4";

  return (
    <group rotation={[0.15, 0, 0]}>
      {/* Vertex-colored scalp surface, unlit so it reads as a glowing
          clinical display rather than a lit/shaded 3D-rendered object. */}
      <mesh geometry={geo}>
        <meshBasicMaterial vertexColors side={THREE.DoubleSide} transparent opacity={alert ? 0.92 : 1} />
      </mesh>

      {/* Faint wireframe overlay for a scan-grid feel. */}
      <mesh geometry={geo}>
        <meshBasicMaterial color="#0a4a52" wireframe transparent opacity={0.12} />
      </mesh>

      {/* Electrode markers, pinned exactly on the surface. */}
      {electrode3D.map((p, i) => (
        <mesh key={electrodes[i]?.label ?? i} position={[p.x, p.y, p.z]}>
          <sphereGeometry args={[0.018, 8, 8]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      ))}

      {/* Rotating scan ring at the equator, echoing the 2D topomap's sweep ring. */}
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.04, 1.07, 64]} />
        <meshBasicMaterial color={ringColor} transparent opacity={0.35} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/**
 * 3D scalp visualization -- deliberately overrides the PRD's "no 3D brain"
 * guidance (§8) per explicit direction. Uses three.js directly (not any of
 * the computational-neuroscience simulation libraries -- none of those do
 * 3D rendering). Vertex colors use the same IDW + colormap logic as the 2D
 * TopomapCanvas (src/lib/colormap.ts), just projected onto a sphere instead
 * of a flat disc, so the two stay visually consistent.
 */
export function BrainViz3D({ electrodes, topo, alert = false, className }: BrainViz3DProps) {
  return (
    <div className={cn("relative", className)}>
      <Canvas
        camera={{ position: [0, 0.55, 2.5], fov: 42 }}
        gl={{ alpha: true, antialias: true }}
        dpr={[1, 2]}
      >
        <HeadMesh electrodes={electrodes} topo={topo} alert={alert} />
        <OrbitControls
          enablePan={false}
          enableZoom
          minDistance={1.6}
          maxDistance={4}
          autoRotate
          autoRotateSpeed={0.7}
          dampingFactor={0.08}
        />
      </Canvas>
    </div>
  );
}
