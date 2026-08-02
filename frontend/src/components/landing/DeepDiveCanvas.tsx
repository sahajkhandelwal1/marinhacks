"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CortexLights } from "../CortexLights";
import { buildElectrodeWeights, useBrainMesh, type BrainMesh } from "@/hooks/useBrainMesh";
import { CORTEX_BASE, SULC_DARKEN, shadeCortex, shadeModulated } from "@/lib/cortexShading";
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
 * Beat changes are morphs, not cuts. The comparison pair slides apart out of
 * the centered brain and converges back into it, crossfading opacity as it
 * moves; the beam builds opacity and scale instead of popping in. Every value
 * is a smoothstep of the same scroll progress, so scrubbing backwards replays
 * the whole thing in reverse.
 *
 * The camera follows a keyframe track rather than a per-phase switch, so the
 * motion between beats is continuous and there is one place to retime it.
 * `launchRef` is the page's exit signal: once set, the loop eases an extra
 * push toward the mesh while the page's iris closes.
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
// already in place as a card fades up and still there as it fades out. These
// are the centers of the morph windows; the actual transitions ease across
// the smoothstep ranges in useFrame.
const PAIR_FROM = 0.36;
const PAIR_TO = 0.61;
const BEAM_FROM = 0.62;
const BEAM_TO = 0.87;

// How far the launch push-in closes on the mesh, as a fraction of the
// track's camera distance.
const LAUNCH_PUSH = 0.7;

/**
 * How strong the sandbox tint is allowed to get on the front page.
 *
 * The thalamus is a diffuse target — beamModulation fills every vertex with
 * the same value — so at full strength the surface is one flat color. In the
 * manual console that is correct and the reader is holding the control that
 * causes it; on a page that scrolls past in two seconds it just looks like the
 * mesh changed material. Capped here, the measured shading stays visible
 * underneath and the beat reads as tissue being pushed rather than repainted.
 */
const BEAM_TINT_MAX = 0.55;

/**
 * Repaint quantum for the sandbox tint. Re-shading is a full pass over ~20k
 * vertices, so it cannot run every frame; stepping it means the dissolve is
 * roughly a dozen repaints across the beat instead of one hard cut, which is
 * enough to read as continuous and costs about as much as the old two cuts.
 */
const BEAM_TINT_STEP = 1 / 12;

/** Vertical FOV of the dive camera, in degrees. */
export const DIVE_FOV = 42;

/**
 * Where the page wants the cortex to sit, for the final beat.
 *
 * This is a ref payload rather than props for the usual reason — it changes
 * every scroll frame — but it is expressed in *screen* terms because that is
 * what the page actually knows: it has measured a slot in the DOM. Converting
 * to world units needs the live camera, so it happens here, in the loop.
 *
 * It deliberately does not carry a scale factor. An earlier version did the
 * shrink with a CSS transform on the canvas wrapper, which cannot work: r3f
 * sizes its drawing buffer from the container's bounding rect, and a scaled
 * ancestor makes that rect report the scaled size. The renderer duly shrank to
 * 206x150 and drew a small cortex into the corner of a 1200x875 element. The
 * shrink has to be in the scene.
 */
export interface DockState {
  /** 0 = free-flying dive, 1 = fully seated in the slot. */
  t: number;
  /** Slot center relative to stage center, in CSS px. */
  offX: number;
  offY: number;
  /** Desired on-screen diameter of the cortex once seated, in CSS px. */
  targetPx: number;
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

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
  launchRef,
  reducedMotion,
  dockRef,
}: {
  mesh: BrainMesh;
  frame: DiveFrame;
  progressRef: RefObject<number>;
  launchRef?: RefObject<number>;
  reducedMotion: boolean;
  dockRef?: RefObject<DockState>;
}) {
  const primary = useRef<THREE.Group>(null);
  const pairGroup = useRef<THREE.Group>(null);
  const leftHolder = useRef<THREE.Group>(null);
  const rightHolder = useRef<THREE.Group>(null);
  const beamGroup = useRef<THREE.Group>(null);
  const dockGroup = useRef<THREE.Group>(null);
  const spin = useRef(0);
  const launchEase = useRef(0);

  // Scratch vectors for the dock basis. Allocated once — this runs per frame.
  const camRight = useMemo(() => new THREE.Vector3(), []);
  const camUp = useMemo(() => new THREE.Vector3(), []);

  /** Radius of the mesh's bounding sphere, which is what sets its silhouette
   *  at an arbitrary yaw — it rotates, so its height is not the extent. */
  const meshRadius = useMemo(() => {
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    return mesh.geometry.boundingSphere?.radius ?? 1;
  }, [mesh]);
  // Last tint level actually painted, quantized. -1 means "nothing painted
  // yet", which is distinct from 0 ("painted as unmodulated").
  const paintedTint = useRef(-1);

  const nElec = frame.electrodes?.length ?? 0;
  const weights = useMemo(
    () => (frame.electrodes ? buildElectrodeWeights(mesh.dirs, frame.electrodes) : null),
    [mesh, frame.electrodes],
  );

  const leftGeo = useMemo(() => cloneForColors(mesh), [mesh]);
  const rightGeo = useMemo(() => cloneForColors(mesh), [mesh]);

  // The sandbox beat runs one fixed beam, so its per-vertex effect is constant
  // for the life of the mesh. Computing it once here rather than inside the
  // repaint means the repaint is only the color pass.
  const modulation = useMemo(() => {
    const thalamus = regionGeometry(mesh, REGIONS.find((r) => r.id === "thalamus")!);
    return beamModulation(
      mesh,
      thalamus,
      { region: "thalamus", mode: "suppress", intensity: 0.72, hz: 1.5 },
      new Float32Array(mesh.labels.length),
    );
  }, [mesh]);

  // Passed to shadeModulated so the sandbox tint dissolves out of the measured
  // shading instead of replacing it.
  const activation = useMemo(
    () =>
      weights && frame.topo ? { weights, topo: frame.topo, nElec } : null,
    [weights, frame.topo, nElec],
  );

  // Materials are imperative objects because their opacities are driven per
  // frame by the morph logic — declarative JSX materials would mean a React
  // re-render per frame, which is exactly what the ref architecture exists to
  // avoid.
  const primaryMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.72,
        metalness: 0,
        side: THREE.DoubleSide,
        transparent: true,
      }),
    [],
  );
  const leftMat = useMemo(() => primaryMat.clone(), [primaryMat]);
  const rightMat = useMemo(() => primaryMat.clone(), [primaryMat]);
  const emitterMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: THEME.accent,
        roughness: 0.4,
        transparent: true,
        opacity: 0,
      }),
    [],
  );
  const beamMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: THEME.accent,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  );

  useEffect(
    () => () => {
      for (const m of [primaryMat, leftMat, rightMat, emitterMat, beamMat]) m.dispose();
    },
    [primaryMat, leftMat, rightMat, emitterMat, beamMat],
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

  // Repaint when the real values arrive. Invalidating paintedTint matters as
  // well as painting: the subject bundles can land mid-beat, and without this
  // the frame loop would see an unchanged tint level and never repaint with
  // the data.
  useEffect(() => {
    if (!activation) return;
    shadeCortex(mesh, activation.weights, activation.topo, activation.nElec);
    paintedTint.current = 0;
  }, [mesh, activation]);

  // Paint the two comparison brains once — they are static portraits.
  useEffect(() => {
    if (!weights || !frame.pair) return;
    shadeInto(leftGeo, mesh, weights, frame.pair.left, nElec);
    shadeInto(rightGeo, mesh, weights, frame.pair.right, nElec);
  }, [weights, frame.pair, leftGeo, rightGeo, mesh, nElec]);

  useFrame((state, delta) => {
    const p = Math.min(1, Math.max(0, progressRef.current ?? 0));
    const key = sampleTrack(p);

    // Launch push-in: once the page signals, ease an extra dive toward the
    // mesh. Time-based rather than scroll-based, so it runs identically no
    // matter where in the track the CTA was clicked.
    if ((launchRef?.current ?? 0) > 0) {
      launchEase.current = Math.min(1, launchEase.current + delta * 1.35);
    }
    const push = smoothstep(0, 1, launchEase.current);
    const distance = key.distance * (1 - LAUNCH_PUSH * push);

    // Camera on a spherical rig around the origin.
    const cam = state.camera as THREE.PerspectiveCamera;
    const cy = Math.sin(key.pitch) * distance;
    const horizontal = Math.cos(key.pitch) * distance;
    cam.position.set(
      Math.sin(key.yaw) * horizontal,
      cy,
      Math.cos(key.yaw) * horizontal,
    );
    cam.lookAt(0, 0, 0);
    // lookAt only writes the quaternion; the dock needs the camera's basis
    // vectors this frame, so the world matrix has to be current now rather
    // than at render time.
    cam.updateMatrixWorld();

    // Seat the cortex in the launch card's slot.
    //
    // Everything is derived from the live camera, so this stays correct while
    // the track is still moving and after a resize, with no constant to keep
    // in sync. At the focal plane (the origin, which is what the camera looks
    // at) one screen pixel is `perPx` world units, so a screen-space offset
    // becomes a world offset along the camera's own right and up vectors.
    const seat = dockGroup.current;
    if (seat) {
      const d = dockRef?.current;
      const t = d ? Math.min(1, Math.max(0, d.t)) : 0;
      if (t <= 0) {
        seat.position.set(0, 0, 0);
        seat.scale.setScalar(1);
      } else {
        const visibleH = 2 * distance * Math.tan((cam.fov * Math.PI) / 360);
        const perPx = visibleH / state.size.height;
        // The cortex's current on-screen diameter, and the factor that takes
        // it to the diameter the slot wants.
        const cortexPx = (2 * meshRadius) / perPx;
        const target = cortexPx > 0 ? d!.targetPx / cortexPx : 1;
        seat.scale.setScalar(1 + (target - 1) * t);

        camRight.setFromMatrixColumn(cam.matrixWorld, 0);
        camUp.setFromMatrixColumn(cam.matrixWorld, 1);
        seat.position
          .set(0, 0, 0)
          .addScaledVector(camRight, d!.offX * perPx * t)
          // Screen y runs down, world y runs up.
          .addScaledVector(camUp, -d!.offY * perPx * t);
      }
    }

    if (!reducedMotion) spin.current += delta * 0.06;
    if (primary.current) primary.current.rotation.y = spin.current;

    // Dual ↔ single morph. spread 0→1 slides the pair apart out of the
    // centered brain; 1→0 converges them back into it. Opacity rides the
    // same value, so the merge reads as one brain becoming two (and back)
    // rather than a swap between two scene graphs.
    const spread =
      smoothstep(PAIR_FROM, 0.46, p) * (1 - smoothstep(0.58, PAIR_TO + 0.07, p));
    const pairOpacity = smoothstep(0, 0.55, spread);

    if (leftHolder.current) leftHolder.current.position.x = -1.35 * spread;
    if (rightHolder.current) rightHolder.current.position.x = 1.35 * spread;
    leftMat.opacity = pairOpacity;
    rightMat.opacity = pairOpacity;
    primaryMat.opacity = 1 - pairOpacity;
    if (pairGroup.current) pairGroup.current.visible = spread > 0.002;
    if (primary.current) primary.current.visible = primaryMat.opacity > 0.002;

    // Beam: a soft opacity/scale build and dissolve, not a pop.
    const beamFade =
      smoothstep(BEAM_FROM, 0.7, p) * (1 - smoothstep(0.82, BEAM_TO, p));
    beamMat.opacity = 0.45 * beamFade;
    emitterMat.opacity = beamFade;
    if (beamGroup.current) {
      beamGroup.current.visible = beamFade > 0.002;
      beamGroup.current.scale.setScalar(0.72 + 0.28 * beamFade);
    }

    // Sandbox tint. Previously this switched on a phase string — the surface
    // was either fully repainted on the diverging scale or fully repainted on
    // the measured one, and crossing the boundary was a single-frame swap
    // between two different-looking materials. Worse, the pair beat ends
    // before the beam beat begins, so the phase fell back through "metrics"
    // in between and the mesh was repainted twice in quick succession.
    //
    // Now there is one continuous quantity. It rises with the beam, the
    // repaint is stepped rather than gated, and at zero it resolves to exactly
    // the same call the metrics beat makes — so there is no boundary left to
    // glitch across.
    const tint = Math.round((BEAM_TINT_MAX * beamFade) / BEAM_TINT_STEP) * BEAM_TINT_STEP;
    if (tint !== paintedTint.current && activation) {
      paintedTint.current = tint;
      if (tint <= 0) {
        shadeCortex(mesh, activation.weights, activation.topo, activation.nElec);
      } else {
        shadeModulated(mesh, modulation, tint, activation);
      }
    }
  });

  return (
    /* Everything the dive draws hangs off the dock group, so seating it in the
       card is one transform on one node rather than a per-object offset. */
    <group ref={dockGroup}>
      <group ref={primary}>
        {/* DoubleSide is required: the two hemispheres are separate open
            surfaces, so with backface culling you look straight through the
            far hemisphere into the background from many angles. */}
        <mesh geometry={mesh.geometry} material={primaryMat} />
      </group>

      {/* The comparison beat: two fixed lateral yaws, never rotating, so the
          two are actually comparable at any given moment. */}
      <group ref={pairGroup} visible={false}>
        <group ref={leftHolder} position={[-1.35, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <mesh geometry={leftGeo} material={leftMat} />
        </group>
        <group ref={rightHolder} position={[1.35, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <mesh geometry={rightGeo} material={rightMat} />
        </group>
      </group>

      {/* Sandbox beat: a simulated beam to the midline. */}
      <group ref={beamGroup} visible={false}>
        <mesh position={[0, 1.05, 0]} material={emitterMat}>
          <cylinderGeometry args={[0.11, 0.055, 0.15, 20]} />
        </mesh>
        <mesh position={[0, 0.5, 0]} material={beamMat}>
          <cylinderGeometry args={[0.05, 0.02, 1.0, 16, 1, true]} />
        </mesh>
      </group>
    </group>
  );
}

export function DeepDiveCanvas({
  frame,
  progressRef,
  launchRef,
  reducedMotion,
  dockRef,
}: {
  frame: DiveFrame;
  progressRef: RefObject<number>;
  launchRef?: RefObject<number>;
  reducedMotion: boolean;
  /** Where to seat the cortex for the final beat. See DockState. */
  dockRef?: RefObject<DockState>;
}) {
  const { mesh } = useBrainMesh();

  return (
    <Canvas
      camera={{ position: [1.4, 1.0, 4.0], fov: DIVE_FOV }}
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 2]}
      /* r3f's container sets `pointer-events: auto` inline, which re-enables
         hit-testing inside a `pointer-events-none` ancestor — CSS lets a child
         opt back in. This is purely a backdrop, and for the final beat it sits
         above the launch card, so it has to stay out of the way of the CTA. */
      style={{ pointerEvents: "none" }}
    >
      <CortexLights />
      {mesh ? (
        <Scene
          mesh={mesh}
          frame={frame}
          progressRef={progressRef}
          launchRef={launchRef}
          reducedMotion={reducedMotion}
          dockRef={dockRef}
        />
      ) : null}
    </Canvas>
  );
}
