import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Electrode, Frame } from "./data";

// A 3D cortical-activity field in the idiom of computational-neuroscience
// output (NEURON / Brian2 voltage maps): per-electrode band power interpolated
// across an ellipsoidal cortex and coloured through the plasma colormap, with
// an ambient particle field that brightens where the cortex is hot. The look is
// shader-driven — nothing is actually simulated; it renders the same per-frame
// values a flat topomap would have used.

// Scalp (x,y) disc -> point on the upper hemisphere of a unit sphere.
function scalpTo3D(x: number, y: number): THREE.Vector3 {
  const r = Math.min(1, Math.hypot(x, y));
  const phi = r * (Math.PI / 2); // 0 at vertex (Cz), PI/2 at the rim
  const yUp = Math.cos(phi);
  const hor = Math.sin(phi);
  const nx = r < 1e-4 ? 0 : x / r;
  const ny = r < 1e-4 ? 0 : y / r;
  return new THREE.Vector3(hor * nx, yUp, hor * ny).normalize();
}

const vert = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNormal;
  void main() {
    vPos = position;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const frag = /* glsl */ `
  precision highp float;
  #define N 12
  uniform vec3 uElec[N];
  uniform float uVal[N];
  uniform float uGlobal;   // 0..1 overall drive (from SDP)
  uniform float uTime;
  varying vec3 vPos;
  varying vec3 vNormal;

  // plasma colormap, 5 stops
  vec3 plasma(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 c0 = vec3(0.050, 0.030, 0.530);
    vec3 c1 = vec3(0.416, 0.000, 0.659);
    vec3 c2 = vec3(0.796, 0.278, 0.470);
    vec3 c3 = vec3(0.973, 0.585, 0.251);
    vec3 c4 = vec3(0.940, 0.975, 0.131);
    if (t < 0.25) return mix(c0, c1, t / 0.25);
    if (t < 0.50) return mix(c1, c2, (t - 0.25) / 0.25);
    if (t < 0.75) return mix(c2, c3, (t - 0.50) / 0.25);
    return mix(c3, c4, (t - 0.75) / 0.25);
  }

  void main() {
    vec3 dir = normalize(vPos);
    float num = 0.0;
    float den = 0.0;
    for (int i = 0; i < N; i++) {
      float d = distance(dir, uElec[i]);
      float w = 1.0 / (d * d + 0.02);
      num += uVal[i] * w;
      den += w;
    }
    float act = den > 0.0 ? num / den : 0.0;

    // gentle travelling ripples so the field reads as living tissue
    float ripple = 0.04 * sin(vPos.y * 9.0 - uTime * 1.3)
                 + 0.03 * sin(vPos.x * 7.0 + uTime * 0.9);
    float v = clamp(act * (0.55 + 0.7 * uGlobal) + ripple, 0.0, 1.0);

    vec3 col = plasma(v);

    // underside falls to deep indigo; fresnel rim glow on the silhouette
    float top = smoothstep(-0.8, 0.6, dir.y);
    col *= mix(0.28, 1.0, top);
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    float fres = pow(1.0 - max(dot(normalize(vNormal), viewDir), 0.0), 2.4);
    col += plasma(min(1.0, v + 0.2)) * fres * 0.6;

    gl_FragColor = vec4(col, 1.0);
  }
`;

interface Props {
  electrodes: Electrode[];
  frameRef: React.MutableRefObject<Frame | null>;
  alarmRef: React.MutableRefObject<boolean>;
}

export function BrainCanvas({ electrodes, frameRef, alarmRef }: Props) {
  const mount = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mount.current!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0.15, 3.35);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);

    const elecPos = electrodes.map((e) => scalpTo3D(e.x, e.y));
    const uniforms = {
      uElec: { value: elecPos },
      uVal: { value: electrodes.map(() => 0.4) },
      uGlobal: { value: 0.5 },
      uTime: { value: 0 },
    };

    // Cortex: ellipsoid (front-back long, vertically compressed) — brain-ish.
    const geo = new THREE.IcosahedronGeometry(1, 5);
    geo.scale(0.9, 0.82, 1.06);
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: vert,
      fragmentShader: frag,
    });
    const brain = new THREE.Mesh(geo, mat);
    const group = new THREE.Group();
    group.add(brain);
    group.rotation.x = -0.15;
    scene.add(group);

    // Ambient particle shell just above the cortex.
    const P = 900;
    const pgeo = new THREE.BufferGeometry();
    const ppos = new Float32Array(P * 3);
    const pdir: THREE.Vector3[] = [];
    for (let i = 0; i < P; i++) {
      const v = new THREE.Vector3()
        .randomDirection()
        .multiplyScalar(1.0);
      v.y = v.y * 0.82;
      v.x *= 0.9;
      v.z *= 1.06;
      pdir.push(v.clone());
      const s = 1.05 + Math.random() * 0.18;
      ppos[i * 3] = v.x * s;
      ppos[i * 3 + 1] = v.y * s;
      ppos[i * 3 + 2] = v.z * s;
    }
    pgeo.setAttribute("position", new THREE.BufferAttribute(ppos, 3));
    const pmat = new THREE.PointsMaterial({
      color: 0xffce7a,
      size: 0.018,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const points = new THREE.Points(pgeo, pmat);
    group.add(points);

    // Electrode contact markers.
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xdce8f2 });
    elecPos.forEach((p) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.018, 8, 8),
        markerMat
      );
      m.position.copy(p).multiplyScalar(1.03);
      group.add(m);
    });

    function resize() {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let raf = 0;
    const clock = new THREE.Clock();
    let smoothGlobal = 0.5;

    function loop() {
      const t = clock.getElapsedTime();
      const frame = frameRef.current;
      if (frame) {
        const max = Math.max(...frame.topo, 0.001);
        for (let i = 0; i < uniforms.uVal.value.length; i++) {
          const target = (frame.topo[i] ?? 0) / max;
          uniforms.uVal.value[i] += (target - uniforms.uVal.value[i]) * 0.25;
        }
        // Lower SDP (deeper) -> hotter intrinsic drive, matching the topomap.
        const g = 1 - Math.min(1, Math.max(0, frame.sdp / 100));
        smoothGlobal += (g - smoothGlobal) * 0.08;
        uniforms.uGlobal.value = smoothGlobal;
      }
      uniforms.uTime.value = reduce ? 0 : t;

      if (!reduce) {
        group.rotation.y = 0.35 + Math.sin(t * 0.12) * 0.5;
        points.rotation.y = t * 0.04;
      }

      const alarm = alarmRef.current;
      pmat.color.set(alarm ? 0xff6b62 : 0xffce7a);
      pmat.opacity = alarm ? 0.7 : 0.5;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    }
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      geo.dispose();
      mat.dispose();
      pgeo.dispose();
      pmat.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      el.removeChild(renderer.domElement);
    };
  }, [electrodes, frameRef, alarmRef]);

  return <div ref={mount} style={{ width: "100%", height: "100%" }} />;
}
