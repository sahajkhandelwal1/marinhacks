"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type SimulatedSpike = { t: number; neuron: number };

export type SimulatedNetworkCanvasProps = {
  spikes: SimulatedSpike[];
  populationRateHz: number[];
  nNeurons: number;
  durationS: number;
  depth: number; // 0 (desynchronized) - 1 (synchronized), drives color only
  className?: string;
};

const PAD_X = 8;
const PAD_TOP = 10;
const PAD_BOTTOM = 8;
const RASTER_FRACTION = 0.68;
const TRAIL_S = 1.2; // spikes fade out over this many seconds behind the playhead

/**
 * Small simulated LIF network (Brian2, precomputed offline -- see
 * scripts/simulate_network.py), rendered as a sweeping raster + population
 * rate trace. Illustrative supplementary panel: as depth rises, firing
 * shifts from independent/scattered to shared-slow-wave/synchronized --
 * the same desynchronization<->synchronization story SDP tells from real
 * scalp EEG, shown here one level down in simulated spikes. This is
 * synthetic and must stay visually and textually labeled as such.
 */
export function SimulatedNetworkCanvas({
  spikes,
  populationRateHz,
  nNeurons,
  durationS,
  depth,
  className,
}: SimulatedNetworkCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const [tick, setTick] = useState(0);

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

  // Continuous animation loop, decoupled from any parent re-render cadence.
  useEffect(() => {
    startRef.current = null;
    const loop = (now: number) => {
      if (startRef.current === null) startRef.current = now;
      setTick((v) => (v + 1) % 1_000_000);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [durationS]);

  const maxRate = useMemo(() => Math.max(1, ...populationRateHz), [populationRateHz]);

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

    const now = performance.now();
    const start = startRef.current ?? now;
    const elapsed = ((now - start) / 1000) % Math.max(durationS, 0.001);

    const rasterH = (h - PAD_TOP - PAD_BOTTOM) * RASTER_FRACTION;
    const rateH = (h - PAD_TOP - PAD_BOTTOM) * (1 - RASTER_FRACTION) - 6;
    const rasterTop = PAD_TOP;
    const rateTop = PAD_TOP + rasterH + 14;
    const drawW = w - PAD_X * 2;

    const xForT = (t: number) => PAD_X + (t / durationS) * drawW;
    const yForNeuron = (n: number) => rasterTop + (n / nNeurons) * rasterH;

    const accent = depth > 0.6 ? "#F59E0B" : "#06B6D4";
    const accentRgb = depth > 0.6 ? "245,158,11" : "6,182,212";

    // Faint full ghost trace so the overall sync/async shape reads even
    // outside the trailing window.
    ctx.fillStyle = "rgba(255,255,255,0.035)";
    for (const s of spikes) {
      ctx.fillRect(xForT(s.t), yForNeuron(s.neuron), 1.2, 1.6);
    }

    // Bright trailing spikes behind the sweeping playhead -- reads as live.
    for (const s of spikes) {
      let dt = elapsed - s.t;
      if (dt < 0) dt += durationS;
      if (dt > TRAIL_S) continue;
      const alpha = 1 - dt / TRAIL_S;
      ctx.fillStyle = `rgba(${accentRgb}, ${(0.15 + 0.65 * alpha).toFixed(3)})`;
      ctx.fillRect(xForT(s.t), yForNeuron(s.neuron), 1.6, 2.2);
    }

    // Population rate area chart.
    if (populationRateHz.length > 1) {
      const n = populationRateHz.length;
      const pts = populationRateHz.map((r, i) => {
        const t = (i / n) * durationS;
        const v = Math.min(1, r / maxRate);
        return { x: xForT(t), y: rateTop + (1 - v) * rateH };
      });
      const grad = ctx.createLinearGradient(0, rateTop, 0, rateTop + rateH);
      grad.addColorStop(0, `rgba(${accentRgb}, 0.25)`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.beginPath();
      ctx.moveTo(pts[0].x, rateTop + rateH);
      pts.forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.lineTo(pts[pts.length - 1].x, rateTop + rateH);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.25;
      ctx.stroke();
    }

    // Sweeping playhead.
    const playX = xForT(elapsed);
    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(playX, rasterTop);
    ctx.lineTo(playX, rateTop + rateH);
    ctx.stroke();
    ctx.restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, spikes, populationRateHz, nNeurons, durationS, depth, maxRate, tick]);

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="pointer-events-none absolute right-2 top-1 flex flex-col items-end gap-0.5">
        <span className="font-mono text-[9px] tracking-[0.14em] text-[var(--accent-amber)]">
          SIMULATED — NOT PATIENT DATA
        </span>
        <span className="font-mono text-[8px] tracking-[0.1em] text-[var(--text-muted)]">
          N={nNeurons} LIF neurons · Brian2, precomputed
        </span>
      </div>
      <div className="pointer-events-none absolute left-2 top-1 font-mono text-[9px] tracking-[0.14em] text-[var(--text-muted)]">
        SIMULATED CORTICAL POPULATION
      </div>
    </div>
  );
}
