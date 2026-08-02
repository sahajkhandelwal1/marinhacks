"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Electrode } from "@/hooks/useVigilData";
import { cn } from "@/lib/utils";

export type TopomapCanvasProps = {
  electrodes: Electrode[];
  topo: number[];
  alert?: boolean;
  className?: string;
};

const GRID = 176; // IDW interpolation grid (GRID x GRID cells) -- high enough to avoid a blocky/staircase circle edge
const EDGE_FEATHER = 6; // css px, softens the heatmap/circle boundary instead of a hard cutoff
const SWEEP_PERIOD_MS = 6000; // one full sweep-ring rotation
const SWEEP_ARC_TURNS = 40 / 360; // sweep arc width (~40 degrees)
const IDW_EPSILON = 4; // css px^2, keeps electrode centers finite

// --- Brand 3-stop colormap (cyan -> emerald -> amber), interpolated in HSL ---

type Hsl = [number, number, number]; // h: 0-360, s: 0-1, l: 0-1

function hexToHsl(hex: string): Hsl {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return [h, s, l];
}

function hslToRgb([h, s, l]: Hsl): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rgb: [number, number, number];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = l - c / 2;
  return [
    Math.round((rgb[0] + m) * 255),
    Math.round((rgb[1] + m) * 255),
    Math.round((rgb[2] + m) * 255),
  ];
}

function lerpHsl(a: Hsl, b: Hsl, u: number): Hsl {
  let dh = b[0] - a[0];
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  return [a[0] + dh * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

const STOP_CYAN = hexToHsl("#06B6D4");
const STOP_EMERALD = hexToHsl("#10B981");
const STOP_AMBER = hexToHsl("#F59E0B");

/**
 * Map a normalized topo value [0,1] to rgba. Alpha stays high and narrow-range
 * on purpose -- letting it dip low punches dark "holes" through to the void
 * background instead of reading as a continuous scalp heatmap. Hue/lightness
 * alone carry the value.
 */
function colormap(t: number): { r: number; g: number; b: number; a: number } {
  const v = Math.min(1, Math.max(0, t));
  const hsl =
    v < 0.5
      ? lerpHsl(STOP_CYAN, STOP_EMERALD, v * 2)
      : lerpHsl(STOP_EMERALD, STOP_AMBER, (v - 0.5) * 2);
  const [r, g, b] = hslToRgb(hsl);
  return { r, g, b, a: 0.8 + 0.15 * v };
}

function colormapCss(t: number, alpha = 1): string {
  const { r, g, b } = colormap(t);
  return `rgba(${r},${g},${b},${alpha})`;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

// --- Heatmap grid (recomputed only when topo/electrodes/size change) ---

function buildHeatmap(
  electrodes: Electrode[],
  topo: number[],
  width: number,
  height: number
): HTMLCanvasElement | null {
  if (width <= 0 || height <= 0 || electrodes.length === 0) return null;

  const cx = width / 2;
  const cy = height / 2;
  const radius = 0.42 * Math.min(width, height);
  const pts = electrodes.map((e, i) => ({
    x: cx + e.x * radius * 0.92,
    y: cy - e.y * radius * 0.92, // +y is anterior = toward top of canvas
    v: clamp01(topo[i] ?? 0),
  }));

  const off = document.createElement("canvas");
  off.width = GRID;
  off.height = GRID;
  const octx = off.getContext("2d");
  if (!octx) return null;

  const img = octx.createImageData(GRID, GRID);
  const d = img.data;
  const left = cx - radius;
  const top = cy - radius;
  const cell = (2 * radius) / GRID;

  for (let j = 0; j < GRID; j++) {
    const py = top + (j + 0.5) * cell;
    for (let i = 0; i < GRID; i++) {
      const px = left + (i + 0.5) * cell;
      const idx = (j * GRID + i) * 4;
      const dx = px - cx;
      const dy = py - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius) {
        d[idx + 3] = 0; // outside head circle: fully transparent
        continue;
      }
      // Soft edge: fade alpha over the last EDGE_FEATHER px instead of a hard
      // cutoff, so the boundary reads as a smooth disc, not a pixel staircase.
      const edgeAlpha = dist > radius - EDGE_FEATHER ? (radius - dist) / EDGE_FEATHER : 1;
      let num = 0;
      let den = 0;
      for (const p of pts) {
        const ddx = px - p.x;
        const ddy = py - p.y;
        const w = 1 / (ddx * ddx + ddy * ddy + IDW_EPSILON);
        num += w * p.v;
        den += w;
      }
      const { r, g, b, a } = colormap(num / den);
      d[idx] = r;
      d[idx + 1] = g;
      d[idx + 2] = b;
      d[idx + 3] = Math.round(a * edgeAlpha * 255);
    }
  }

  octx.putImageData(img, 0, 0);
  return off;
}

// --- Component ---

export function TopomapCanvas({
  electrodes,
  topo,
  alert = false,
  className,
}: TopomapCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [reducedMotion, setReducedMotion] = useState(false);

  // Track container size at css-pixel resolution.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setSize({ w: Math.round(rect.width), h: Math.round(rect.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Honor prefers-reduced-motion (static glow, paused sweep).
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // IDW heatmap is memoized on the topo prop reference, so the RAF loop
  // only touches glow phase + sweep rotation per tick.
  const heatmap = useMemo(
    () => buildHeatmap(electrodes, topo, size.w, size.h),
    [electrodes, topo, size]
  );

  // Keep the latest frame renderer in a ref so the RAF loop never goes stale.
  const renderRef = useRef<(now: number) => void>(() => {});
  renderRef.current = (now: number) => {
    const canvas = canvasRef.current;
    const { w, h } = size;
    if (!canvas || w <= 0 || h <= 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    // Leave headroom outside the head circle for the sweep ring so it never
    // clips against the card edge.
    const radius = 0.38 * Math.min(w, h);

    // Heatmap clipped to the head circle, scaled up softly.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = alert ? 0.9 : 1;
    if (heatmap) {
      ctx.drawImage(heatmap, cx - radius, cy - radius, radius * 2, radius * 2);
    }
    ctx.restore();

    // Head outline above the heatmap: a single continuous silhouette (circle
    // + a slim nose tick marking anterior) so it reads as one shape instead
    // of disjoint parts. In alert state, blend toward amber.
    ctx.strokeStyle = alert ? "rgba(253,230,196,0.32)" : "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const noseHalf = 0.1; // radians around top -- slim, schematic tick, not a spike
    const a1 = -Math.PI / 2 - noseHalf;
    const a2 = -Math.PI / 2 + noseHalf;
    // One continuous path (nose tick + the rest of the circle) so the two
    // don't show a seam where separate stroked subpaths would meet.
    ctx.beginPath();
    ctx.moveTo(cx + radius * Math.cos(a1), cy + radius * Math.sin(a1));
    ctx.lineTo(cx, cy - radius * 1.055);
    ctx.lineTo(cx + radius * Math.cos(a2), cy + radius * Math.sin(a2));
    ctx.arc(cx, cy, radius, a2, a1 + Math.PI * 2, false);
    ctx.stroke();

    // Sweep ring: a faint always-on guide ring plus a brighter rotating arc,
    // so it reads clearly as a ring even in a single still frame.
    const sweepR = radius + Math.max(10, radius * 0.14);
    ctx.beginPath();
    ctx.arc(cx, cy, sweepR, 0, Math.PI * 2);
    ctx.strokeStyle = alert ? "rgba(245,158,11,0.22)" : "rgba(6,182,212,0.22)";
    ctx.lineWidth = 1;
    ctx.stroke();

    const sweepAngle = reducedMotion
      ? -Math.PI / 2
      : ((now % SWEEP_PERIOD_MS) / SWEEP_PERIOD_MS) * Math.PI * 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(sweepAngle);
    const sweepColor = alert ? "245,158,11" : "6,182,212";
    const sweepGrad = ctx.createConicGradient(0, 0, 0);
    sweepGrad.addColorStop(0, `rgba(${sweepColor},0.95)`);
    sweepGrad.addColorStop(SWEEP_ARC_TURNS, `rgba(${sweepColor},0)`);
    sweepGrad.addColorStop(1, `rgba(${sweepColor},0)`);
    ctx.strokeStyle = sweepGrad;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(0, 0, sweepR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Electrode dots: bright rim + a breathing colored glow driven by
    // wall-clock time, sized to stand out clearly against the heatmap.
    const dotR = Math.max(2.5, Math.min(w, h) * 0.011);
    electrodes.forEach((e, i) => {
      const px = cx + e.x * radius * 0.92;
      const py = cy - e.y * radius * 0.92;
      const v = clamp01(topo[i] ?? 0);
      const breathe = reducedMotion ? 0 : Math.sin(now * 0.0022 + i * 1.3) * 4;
      ctx.save();
      ctx.shadowColor = colormapCss(v, 1);
      ctx.shadowBlur = 16 + breathe;
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.beginPath();
      ctx.arc(px, py, dotR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // 1px rim in the page background color so dots read as pinned markers.
      ctx.strokeStyle = "rgb(3,7,18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(px, py, dotR, 0, Math.PI * 2);
      ctx.stroke();
    });
  };

  // Continuous loop for glow-breathe + sweep; a single static draw per data
  // change when reduced motion is requested.
  useEffect(() => {
    if (reducedMotion) {
      renderRef.current(0);
      return;
    }
    let raf = 0;
    const loop = (now: number) => {
      renderRef.current(now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion, heatmap, size, alert, topo, electrodes]);

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
