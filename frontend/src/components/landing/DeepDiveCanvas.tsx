"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CortexLights } from "../CortexLights";
import { buildElectrodeWeights, useBrainMesh, type BrainMesh } from "@/hooks/useBrainMesh";
import { divergingRgb01 } from "@/lib/color";
import { CORTEX_BASE, SULC_DARKEN, shadeCortex } from "@/lib/cortexShading";
import { beamModulation, regionGeometry, REGIONS } from "@/lib/manual";
import { THEME } from "@/lib/theme";
import type { Electrode } from "@/lib/types";

/**
 * The scroll-driven cortex.
 *
 * Scroll position arrives as a ref, never as a prop. The page's scroll handler
 * writes a number; this component's render loop reads it. Passing it through
 * React would re-render the whole r3f scene graph on every scroll event, which
 * is the standard way scroll-linked 3D ends up janky.
 *
 * The camera follows a keyframe track rather than a per-phase switch, so the
 * motion between beats is continuous and there is one place to retime it.
 */

export interface DiveFrame {
  /** Representative per-electrode alpha index for the primary brain. */
  topo: number[] | null;
  electrodes: Electrode[] | null;
  /** Left/right brains for the comparison beat. */
  pair: { left: number[]; right: number[] } | null;
}

type Keyframe = { at: number; distance: number; yaw: number; pitch: number };

// distance is in brain radii; yaw/pitch in radians.
const TRACK: Keyframe[] = [
  { at: 0.0, distance: 5.5, yaw: 0.35, pitch: 0.3 },
  { at: 0.12, distance: 4.0, yaw: 0.2, pitch: 0.2 },
  // Card 1 — push in on the frontal pole.
  { at: 0.32, distance: 2.05, yaw: -0.55, pitch: 0.1 },
  // Card 2 — pull back far enough to hold two brains side by side.
  { at: 0.5, distance: 5.6, yaw: 0, pitch: 0.12 },
  { at: 0.56, distance: 5.6, yaw: 0, pitch: 0.12 },
  // Card 3 — descend toward the midline, where a thalamic target would sit.
  { at: 0.72, distance: 3.15, yaw: 0.5, pitch: 0.42 },
  // Launch — settle into a clean three-quarter view.
  { at: 0.88, distance: 3.5, yaw: 0.55, pitch: 0.2 },
  { at: 1.0, distance: 3.4, yaw: 0.75, pitch: 0.18 },
];

// Kept slightly wider than the cards that narrate them, so the geometry is
// already in place as a card fades up and still there as it fades out.
const PAIR_FROM = 0.36;
const PAIR_TO = 0.61;
const BEAM_FROM = 0.62;
const BEAM_TO = 0.87;

function sampleTrack(p: number): Keyframe {
  let a = TRACK[0];
  let b = TRACK[TRACK.length - 1];
  for (let i = 0; i < TRACK.length - 1; i++) {
    if (p >= TRACK[i].at && p <= TRACK[i + 1].at) {
      a = TRACK[i];
      b = TRACK[i + 1];
      break;
    }
  }
  const span = b.at - a.at || 1;
  const raw = Math.min(1, Math.max(0, (p - a.at) / span));
  // Smoothstep between keyframes so the camera eases rather than snapping
  // direction at every beat.
  const t = raw * raw * (3 - 2 * raw);
  return {
    at: p,
    distance: a.distance + (b.distance - a.distance) * t,
    yaw: a.yaw + (b.yaw - a.yaw) * t,
    pitch: a.pitch + (b.pitch - a.pitch) * t,
  };
}

/** A second geometry sharing the immutable buffers, with its own colors. */
function cloneForColors(mesh: BrainMesh): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", mesh.geometry.getAttribute("position"));
  g.setAttribute("normal", mesh.geometry.getAttribute("normal"));
  const idx = mesh.geometry.getIndex();
  if (idx) g.setIndex(idx);
  g.setAttribute(
    "color",
    new THREE.BufferAttribute(new Float32Array(mesh.sulc.length * 3), 3),
  );
  return g;
}

function shadeInto(
  geometry: THREE.BufferGeometry,
  mesh: BrainMesh,
  weights: Float32Array,
  topo: number[],
  nElec: number,
) {
  // shadeCortex writes into mesh.geometry's color attribute; for the pair we
  // need the same math against a different buffer, so swap, shade, swap back.
  const original = mesh.geometry.getAttribute("color");
  mesh.geometry.setAttribute("color", geometry.getAttribute("color"));
  shadeCortex(mesh, weights, topo, nElec);
  mesh.geometry.setAttribute("color", original);
}

function Scene({
  mesh,
  frame,
  progressRef,
  reducedMotion,
}: {
  mesh: BrainMesh;
  frame: DiveFrame;
  progressRef: RefObject<number>;
  reducedMotion: boolean;
}) {
  const rig = useRef<THREE.Group>(null);
  const primary = useRef<THREE.Group>(null);
  const pairGroup = useRef<THREE.Group>(null);
  const beamGroup = useRef<THREE.Group>(null);
  const spin = useRef(0);
  const lastPhase = useRef<string>("");

  const nElec = frame.electrodes?.length ?? 0;
  const weights = useMemo(
    () => (frame.electrodes ? buildElectrodeWeights(mesh.dirs, frame.electrodes) : null),
    [mesh, frame.electrodes],
  );

  const leftGeo = useMemo(() => cloneForColors(mesh), [mesh]);
  const rightGeo = useMemo(() => cloneForColors(mesh), [mesh]);
  const modulation = useMemo(() => new Float32Array(mesh.labels.length), [mesh]);

  const thalamus = useMemo(
    () => regionGeometry(mesh, REGIONS.find((r) => r.id === "thalamus")!),
    [mesh],
  );

  // Plain tissue the moment the mesh lands. The subject bundles arrive later,
  // and without this the hero renders as a black silhouette until they do —
  // the color attribute starts life as zeros.
  useEffect(() => {
    const attr = mesh.geometry.getAttribute("color") as THREE.BufferAttribute;
    const colors = attr.array as Float32Array;
    for (let v = 0; v < mesh.sulc.length; v++) {
      const shade = 1 - SULC_DARKEN * mesh.sulc[v];
      colors[v * 3] = CORTEX_BASE[0] * shade;
      colors[v * 3 + 1] = CORTEX_BASE[1] * shade;
      colors[v * 3 + 2] = CORTEX_BASE[2] * shade;
    }
    attr.needsUpdate = true;
  }, [mesh]);

  // Repaint when the real values arrive.
  useEffect(() => {
    if (weights && frame.topo) shadeCortex(mesh, weights, frame.topo, nElec);
  }, [mesh, weights, frame.topo, nElec]);

  // Paint the two comparison brains once — they are static portraits.
  useEffect(() => {
    if (!weights || !frame.pair) return;
    shadeInto(leftGeo, mesh, weights, frame.pair.left, nElec);
    shadeInto(rightGeo, mesh, weights, frame.pair.right, nElec);
  }, [weights, frame.pair, leftGeo, rightGeo, mesh, nElec]);

  useFrame((state, delta) => {
    const p = Math.min(1, Math.max(0, progressRef.current ?? 0));
    const key = sampleTrack(p);

    // Camera on a spherical rig around the origin.
    const cam = state.camera;
    const cy = Math.sin(key.pitch) * key.distance;
    const horizontal = Math.cos(key.pitch) * key.distance;
    cam.position.set(
      Math.sin(key.yaw) * horizontal,
      cy,
      Math.cos(key.yaw) * horizontal,
    );
    cam.lookAt(0, 0, 0);

    if (!reducedMotion) spin.current += delta * 0.06;
    if (primary.current) primary.current.rotation.y = spin.current;

    const showPair = p > PAIR_FROM && p < PAIR_TO;
    if (primary.current) primary.current.visible = !showPair;
    if (pairGroup.current) pairGroup.current.visible = showPair;

    const showBeam = p > BEAM_FROM && p < BEAM_TO;
    if (beamGroup.current) beamGroup.current.visible = showBeam;

    // Recolor the primary brain only when the beat changes, not per frame.
    const phase = showPair ? "pair" : showBeam ? "beam" : "metrics";
    if (phase !== lastPhase.current && weights && frame.topo) {
      lastPhase.current = phase;
      if (phase === "beam") {
        beamModulation(
          mesh,
          thalamus,
          { region: "thalamus", mode: "suppress", intensity: 0.72, hz: 1.5 },
          modulation,
        );
        const attr = mesh.geometry.getAttribute("color") as THREE.BufferAttribute;
        const colors = attr.array as Float32Array;
        for (let v = 0; v < mesh.sulc.length; v++) {
          const shade = 1 - SULC_DARKEN * mesh.sulc[v];
          const [r, g, b] = divergingRgb01(modulation[v]);
          colors[v * 3] = r * shade;
          colors[v * 3 + 1] = g * shade;
          colors[v * 3 + 2] = b * shade;
        }
        attr.needsUpdate = true;
      } else {
        shadeCortex(mesh, weights, frame.topo, nElec);
      }
    }
  });

  const material = (
    <meshStandardMaterial vertexColors roughness={0.72} metalness={0} side={THREE.DoubleSide} />
  );

  return (
    <group ref={rig}>
      <group ref={primary}>
        <mesh geometry={mesh.geometry}>{material}</mesh>
      </group>

      {/* The comparison beat: two fixed lateral yaws, never rotating, so the
          two are actually comparable at any given moment. */}
      <group ref={pairGroup} visible={false}>
        <group position={[-1.35, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <mesh geometry={leftGeo}>{material}</mesh>
        </group>
        <group position={[1.35, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <mesh geometry={rightGeo}>{material}</mesh>
        </group>
      </group>

      {/* Sandbox beat: a simulated beam to the midline. */}
      <group ref={beamGroup} visible={false}>
        <mesh position={[0, 1.05, 0]}>
          <cylinderGeometry args={[0.11, 0.055, 0.15, 20]} />
          <meshStandardMaterial color={THEME.accent} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.5, 0]}>
          <cylinderGeometry args={[0.05, 0.02, 1.0, 16, 1, true]} />
          <meshBasicMaterial
            color={THEME.accent}
            transparent
            opacity={0.45}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    </group>
  );
}

export function DeepDiveCanvas({
  frame,
  progressRef,
  reducedMotion,
}: {
  frame: DiveFrame;
  progressRef: RefObject<number>;
  reducedMotion: boolean;
}) {
  const { mesh } = useBrainMesh();

  return (
    <Canvas
      camera={{ position: [1.4, 1.0, 4.0], fov: 42 }}
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 2]}
    >
      <CortexLights />
      {mesh ? (
        <Scene
          mesh={mesh}
          frame={frame}
          progressRef={progressRef}
          reducedMotion={reducedMotion}
        />
      ) : null}
    </Canvas>
  );
}
