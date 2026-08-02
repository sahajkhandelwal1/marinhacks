"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame as useRenderFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { CortexLights } from "../CortexLights";
import { useBrainMesh, type BrainMesh } from "@/hooks/useBrainMesh";
import { shadeModulated } from "@/lib/cortexShading";
import {
  beamModulation,
  regionGeometry,
  REGIONS,
  type BeamState,
  type RegionGeometry,
} from "@/lib/manual";
import { THEME } from "@/lib/theme";

const SUPPRESS_COLOR = new THREE.Color(THEME.accent);
const STIMULATE_COLOR = new THREE.Color(THEME.alert);

/** Where the emitter sits, in units of brain radius. */
const EMITTER_DISTANCE = 1.62;

function Beam({
  geometry,
  beam,
}: {
  geometry: RegionGeometry;
  beam: BeamState;
}) {
  const pulseRef = useRef<THREE.Mesh>(null);
  const color = beam.mode === "stimulate" ? STIMULATE_COLOR : SUPPRESS_COLOR;

  // Diffuse targets have no direction to aim from, so the emitter is placed
  // above and the beam runs to the brain's center rather than to a surface spot.
  const target = useMemo(() => {
    const d = geometry.dir;
    return d ? new THREE.Vector3(d[0], d[1], d[2]).multiplyScalar(0.98) : new THREE.Vector3(0, 0, 0);
  }, [geometry]);

  const origin = useMemo(() => {
    const d = geometry.dir;
    const away = d ? new THREE.Vector3(d[0], d[1], d[2]) : new THREE.Vector3(0, 1, 0);
    return away.clone().multiplyScalar(EMITTER_DISTANCE);
  }, [geometry]);

  const { midpoint, length, quaternion } = useMemo(() => {
    const dir = new THREE.Vector3().subVectors(target, origin);
    const len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.clone().normalize(),
    );
    return {
      midpoint: new THREE.Vector3().addVectors(origin, target).multiplyScalar(0.5),
      length: len,
      quaternion: q,
    };
  }, [origin, target]);

  // A bead running down the beam at the beam's own frequency — the one place
  // the Hz control is legible in the 3D view rather than only on the trace.
  useRenderFrame((state) => {
    if (!pulseRef.current) return;
    const cycle = (state.clock.elapsedTime * Math.min(beam.hz, 12)) % 1;
    pulseRef.current.position.lerpVectors(origin, target, cycle);
    pulseRef.current.visible = beam.intensity > 0.02;
  });

  const radius = 0.012 + 0.05 * beam.intensity;

  return (
    <group>
      {/* Emitter. */}
      <mesh position={origin} quaternion={quaternion}>
        <cylinderGeometry args={[0.12, 0.06, 0.16, 20]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.1} />
      </mesh>

      {/* The beam itself. Transparent so it reads as light rather than a rod. */}
      <mesh position={midpoint} quaternion={quaternion}>
        <cylinderGeometry args={[radius, radius * 0.5, length, 16, 1, true]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.12 + 0.4 * beam.intensity}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      <mesh ref={pulseRef}>
        <sphereGeometry args={[0.05, 12, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} />
      </mesh>
    </group>
  );
}

function Scene({ mesh, beam }: { mesh: BrainMesh; beam: BeamState }) {
  const modulation = useMemo(() => new Float32Array(mesh.labels.length), [mesh]);

  const spec = REGIONS.find((r) => r.id === beam.region) ?? REGIONS[0];
  const geometry = useMemo(() => regionGeometry(mesh, spec), [mesh, spec]);

  // Repaint only when a control moves. Nothing here is time-varying, so
  // running this per frame would burn 20k vertices of work for no change.
  //
  // shadeModulated is shared with the landing dive's sandbox beat, so the
  // surface a reader sees on the front page and the one they land on here are
  // the same material rather than two encodings that happen to be near.
  useEffect(() => {
    beamModulation(mesh, geometry, beam, modulation);
    shadeModulated(mesh, modulation);
  }, [mesh, geometry, beam, modulation]);

  // No auto-rotation: the brain moves only when dragged (OrbitControls below).
  return (
    <group>
      <mesh geometry={mesh.geometry}>
        <meshStandardMaterial
          vertexColors
          roughness={0.72}
          metalness={0}
          side={THREE.DoubleSide}
        />
      </mesh>
      <Beam geometry={geometry} beam={beam} />
    </group>
  );
}

/**
 * Manual-mode viewport: the same cortical surface as the monitor, with a beam
 * aimed at a real anatomical target and the surface colored by simulated
 * effect. Everything shown here is a model — see lib/manual.ts.
 */
export function BeamStage({
  beam,
  className,
}: {
  beam: BeamState;
  className?: string;
}) {
  const { mesh, error } = useBrainMesh();

  return (
    <div className={`relative ${className ?? ""}`}>
      {mesh ? (
        <Canvas
          camera={{ position: [0.7, 0.6, 3.5], fov: 42 }}
          gl={{ alpha: true, antialias: true }}
          dpr={[1, 2]}
        >
          <CortexLights />
          <Scene mesh={mesh} beam={beam} />
          <OrbitControls
            enablePan={false}
            enableZoom
            minDistance={1.8}
            maxDistance={5.5}
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
