"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Electrode, Frame } from "@/hooks/useVigilData";
import { cn } from "@/lib/utils";

export type EEGTraceCanvasProps = {
  frames: Frame[];
  electrodes: Electrode[];
  upToIndex: number;
  sdp: number | null;
  alert?: boolean;
  className?: string;
};

const HISTORY = 150; // ~15s of history at 10Hz
const PAD_X = 8;
const PAD_Y = 12;
const LANE_GAP = 14;
const TAU = Math.PI * 2;

const CYAN = { stroke: "#06B6D4", fill: "rgba(6,182,212,0.18)" };
const AMBER = { stroke: "#F59E0B", fill: "rgba(245,158,11,0.18)" };

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function pickChannel(electrodes: Electrode[], labels: string[], fallback: number) {
  for (const label of labels) {
    const idx = electrodes.findIndex((e) => e.label === label);
    if (idx >= 0) return { idx, label };
  }
  const idx = Math.min(fallback, Math.max(0, electrodes.length - 1));
  return { idx, label: electrodes[idx]?.label ?? `CH${fallback}` };
}

/**
 * Stylized oscilloscope trace derived from real per-frame telemetry.
 * No raw EEG exists in the data contract: the base shape is the frame's real
 * topo value for the electrode; a small deterministic harmonic detail signal
 * (fixed frequencies, phase seeded by t, amplitude scaled by 1 - sdp/100)
 * keeps the trace visually alive without inventing data.
 */
export function EEGTraceCanvas({
  frames,
  electrodes,
  upToIndex,
  sdp,
  alert = false,
  className,
}: EEGTraceCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

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

  // Representative channels: front / central / posterior.
  const channels = useMemo(
    () => [
      pickChannel(electrodes, ["Fz", "Fp1"], 0),
      pickChannel(electrodes, ["Cz", "C3"], 5),
      pickChannel(electrodes, ["Pz", "Oz", "O1"], 10),
    ],
    [electrodes]
  );

  const laneMetrics = useMemo(() => {
    const laneH = Math.max(0, (size.h - PAD_Y * 2 - LANE_GAP * 2) / 3);
    return {
      laneH,
      tops: [0, 1, 2].map((c) => PAD_Y + c * (laneH + LANE_GAP)),
    };
  }, [size]);

  useEffect(() => {
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

    const last = Math.min(upToIndex, frames.length - 1);
    if (last < 0) return;
    const count = Math.min(last + 1, HISTORY);
    const start = last - count + 1;
    const samples = frames.slice(start, last + 1);
    if (samples.length === 0) return;

    // Harmonic detail amplitude: a visible floor amplitude always applies (a
    // flat line reads as broken, not calm), plus deeper anesthesia (low sdp)
    // adds a larger, slower wobble on top per the (1 - sdp/100) depth factor.
    const depth = sdp === null ? 0.5 : clamp01(1 - sdp / 100);
    const amp = 0.13 + 0.15 * depth;

    const drawW = w - PAD_X * 2;
    const { laneH, tops } = laneMetrics;
    const palette = alert ? AMBER : CYAN;

    channels.forEach((ch, c) => {
      const laneTop = tops[c];
      const laneBottom = laneTop + laneH;

      // Base signal = real topo history + deterministic harmonic detail. With
      // fewer than 2 samples (e.g. the very first frame of playback) there is
      // no line to draw yet -- stretch the single known value across the full
      // lane width as a flat trace instead of rendering nothing.
      const pts =
        samples.length > 1
          ? samples.map((f, i) => {
              const base = f.topo[ch.idx] ?? 0.5;
              const detail =
                (amp *
                  (Math.sin(TAU * (2.2 + c * 0.9) * f.t + c * 2.1) +
                    0.6 * Math.sin(TAU * (5.1 + c * 1.3) * f.t + 1.7 + c * 1.3) +
                    0.35 * Math.sin(TAU * (8.3 + c * 0.7) * f.t + 4.2))) /
                1.95;
              const v = Math.min(0.98, Math.max(0.02, base + detail));
              const x = PAD_X + (i / (samples.length - 1)) * drawW;
              return { x, y: laneTop + (1 - v) * laneH };
            })
          : (() => {
              const v = Math.min(0.98, Math.max(0.02, samples[0].topo[ch.idx] ?? 0.5));
              const y = laneTop + (1 - v) * laneH;
              return [
                { x: PAD_X, y },
                { x: PAD_X + drawW, y },
              ];
            })();

      // Faint lane baseline.
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, laneBottom);
      ctx.lineTo(w, laneBottom);
      ctx.stroke();

      // Smoothed trace path (quadratic through midpoints).
      const tracePath = () => {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length - 1; i++) {
          const xc = (pts[i].x + pts[i + 1].x) / 2;
          const yc = (pts[i].y + pts[i + 1].y) / 2;
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
        }
        const lastPt = pts[pts.length - 1];
        ctx.lineTo(lastPt.x, lastPt.y);
      };

      // Soft gradient area fill from the line down to the lane baseline.
      const fillGrad = ctx.createLinearGradient(0, laneTop, 0, laneBottom);
      fillGrad.addColorStop(0, palette.fill);
      fillGrad.addColorStop(1, "rgba(0,0,0,0)");
      tracePath();
      ctx.lineTo(pts[pts.length - 1].x, laneBottom);
      ctx.lineTo(pts[0].x, laneBottom);
      ctx.closePath();
      ctx.fillStyle = fillGrad;
      ctx.fill();

      // The trace line itself, with a soft glow matching the topomap's
      // electrode glow language for visual consistency.
      tracePath();
      ctx.save();
      ctx.shadowColor = palette.stroke;
      ctx.shadowBlur = 6;
      ctx.strokeStyle = palette.stroke;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.restore();
    });
  }, [frames, electrodes, upToIndex, sdp, alert, size, channels, laneMetrics]);

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {/* Lane labels as HTML overlays so the text stays crisp */}
      {channels.map((ch, c) => (
        <span
          key={`${ch.label}-${c}`}
          className="pointer-events-none absolute left-2 font-mono text-[9px] text-[var(--text-muted)]"
          style={{ top: laneMetrics.tops[c] + 2 }}
        >
          {ch.label}
        </span>
      ))}
    </div>
  );
}
