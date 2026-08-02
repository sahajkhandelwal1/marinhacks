"use client";

import { useMemo } from "react";
import { useCanvas } from "@/hooks/useCanvas";
import { THEME, uiFont } from "@/lib/theme";
import { useFrame } from "@/state/monitor";

export type SimulatedSpike = { t: number; neuron: number };

export type SimulatedNetworkCanvasProps = {
  spikes: SimulatedSpike[];
  populationRateHz: number[];
  nNeurons: number;
  durationS: number;
  className?: string;
};

const PAD_X = 10;
const PAD_TOP = 10;
const PAD_BOTTOM = 8;
const RASTER_FRACTION = 0.66;
const TRAIL_S = 1.2; // spikes fade out over this many seconds behind the playhead

/**
 * Small simulated LIF network (Brian2, precomputed offline — see
 * scripts/simulate_network.py), rendered as a sweeping raster plus population
 * rate. As depth rises, firing shifts from independent and scattered to
 * shared-slow-wave and synchronized: the same desynchronization-to-
 * synchronization story SDP tells from real scalp EEG, shown one level down in
 * simulated spikes.
 *
 * Synthetic, and labeled as such on screen. It is not derived from patient
 * data, real or otherwise.
 *
 * Runs on the app transport rather than its own wall clock, so scrubbing the
 * timeline moves this panel too — previously it swept independently, which
 * made it read as a decorative animation instead of a linked view.
 */
export function SimulatedNetworkCanvas({
  spikes,
  populationRateHz,
  nNeurons,
  durationS,
  className,
}: SimulatedNetworkCanvasProps) {
  const { containerRef, canvasRef, size } = useCanvas<HTMLDivElement>();
  const maxRate = useMemo(() => Math.max(1, ...populationRateHz), [populationRateHz]);

  useFrame((clock) => {
    const canvas = canvasRef.current;
    const { width: w, height: h, dpr } = size;
    if (!canvas || w <= 0 || h <= 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const elapsed = clock % Math.max(durationS, 0.001);

    const rasterH = (h - PAD_TOP - PAD_BOTTOM) * RASTER_FRACTION;
    const rateH = (h - PAD_TOP - PAD_BOTTOM) * (1 - RASTER_FRACTION) - 6;
    const rasterTop = PAD_TOP;
    const rateTop = PAD_TOP + rasterH + 14;
    const drawW = w - PAD_X * 2;

    const xForT = (t: number) => PAD_X + (t / durationS) * drawW;
    const yForNeuron = (n: number) => rasterTop + (n / nNeurons) * rasterH;

    // Ghost of the whole recording, so the overall sync/async texture reads
    // even outside the trailing window. Ink at low alpha — on a light ground
    // the faint layer has to be darker than the surface, not lighter.
    ctx.fillStyle = "rgba(15,23,42,0.10)";
    for (const s of spikes) {
      ctx.fillRect(xForT(s.t), yForNeuron(s.neuron), 1.2, 1.6);
    }

    // Bright trailing spikes behind the sweeping playhead.
    for (const s of spikes) {
      let dt = elapsed - s.t;
      if (dt < 0) dt += durationS;
      if (dt > TRAIL_S) continue;
      const alpha = 1 - dt / TRAIL_S;
      ctx.fillStyle = `rgba(42,120,214,${(0.2 + 0.75 * alpha).toFixed(3)})`;
      ctx.fillRect(xForT(s.t), yForNeuron(s.neuron), 1.6, 2.2);
    }

    // Population rate, as a line over a wash of its own hue.
    if (populationRateHz.length > 1) {
      const n = populationRateHz.length;
      const pts = populationRateHz.map((r, i) => {
        const t = (i / n) * durationS;
        const v = Math.min(1, r / maxRate);
        return { x: xForT(t), y: rateTop + (1 - v) * rateH };
      });

      ctx.beginPath();
      ctx.moveTo(pts[0].x, rateTop + rateH);
      pts.forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.lineTo(pts[pts.length - 1].x, rateTop + rateH);
      ctx.closePath();
      ctx.fillStyle = "rgba(42,120,214,0.10)";
      ctx.fill();

      ctx.beginPath();
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.strokeStyle = THEME.accent;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.stroke();
    }

    // Playhead.
    const playX = xForT(elapsed);
    ctx.strokeStyle = THEME.ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(playX, rasterTop);
    ctx.lineTo(playX, rateTop + rateH);
    ctx.stroke();

    ctx.font = `500 10px ${uiFont()}`;
    ctx.fillStyle = THEME.ink3;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(`${nNeurons} LIF neurons · population rate`, PAD_X, rateTop - 12);
  });

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
    </div>
  );
}
