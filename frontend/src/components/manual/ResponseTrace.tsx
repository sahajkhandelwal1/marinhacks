"use client";

import { useCanvas } from "@/hooks/useCanvas";
import { sdpAt, topoAt } from "@/lib/signal";
import { manualTraceSample, type BeamState } from "@/lib/manual";
import { THEME, uiFont } from "@/lib/theme";
import { traceSample } from "@/lib/trace";
import type { Condition, SubjectBundle } from "@/lib/types";
import { useFrame } from "@/state/monitor";
import { useMemo } from "react";

const WINDOW_SEC = 6;
const ROWS = ["Fp1", "Fz", "C4", "O1"];

/**
 * Live response trace for manual mode.
 *
 * Same construction as the monitor's trace — every column is a pure function
 * of transport time, so the waveform is identical whether you played to it or
 * dragged to it — with the beam's driven component layered on top. Moving a
 * slider changes the shape on the very next frame, which is the entire point
 * of this panel.
 *
 * Doubly reconstructed and labeled as such: the baseline is rebuilt from a
 * band ratio rather than being raw EEG, and the beam response is a model.
 */
export function ResponseTrace({
  bundle,
  condition,
  beam,
}: {
  bundle: SubjectBundle;
  condition: Condition;
  beam: BeamState;
}) {
  const { containerRef, canvasRef, size } = useCanvas<HTMLDivElement>();
  const data = bundle.conditions[condition];
  const values = useMemo(
    () => new Float32Array(bundle.electrodes.length),
    [bundle.electrodes.length],
  );

  const rows = useMemo(
    () => ROWS.map((label) => bundle.electrodes.findIndex((e) => e.label === label)).filter((i) => i >= 0),
    [bundle.electrodes],
  );

  useFrame((t) => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height, dpr } = size;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const rowHeight = height / rows.length;
    const gutter = 36;
    const plotWidth = width - gutter;
    const step = plotWidth > 720 ? 2 : 1;
    const stroke = beam.mode === "stimulate" && beam.intensity > 0 ? THEME.alert : THEME.accent;

    rows.forEach((channel, r) => {
      const midY = rowHeight * (r + 0.5);
      const amplitude = rowHeight * 0.36;

      if (r > 0) {
        ctx.strokeStyle = THEME.rule;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, Math.round(rowHeight * r) + 0.5);
        ctx.lineTo(width, Math.round(rowHeight * r) + 0.5);
        ctx.stroke();
      }

      ctx.fillStyle = THEME.ink3;
      ctx.font = `500 10px ${uiFont()}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(bundle.electrodes[channel].label, 8, midY);

      ctx.beginPath();
      ctx.lineWidth = 1.5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.strokeStyle = stroke;

      for (let x = 0; x <= plotWidth; x += step) {
        const tt = t - WINDOW_SEC + (x / plotWidth) * WINDOW_SEC;
        if (tt < 0) continue;
        const sdp = sdpAt(data, bundle.sdpFs, tt);
        topoAt(data, bundle.topoFs, tt, values);
        const base = traceSample(tt, {
          sdp,
          alphaIndex: values[channel],
          seed: channel + 1,
        });
        const y = midY - manualTraceSample(tt, base, beam, channel + 1) * amplitude * 0.24;
        if (x === 0) ctx.moveTo(gutter + x, y);
        else ctx.lineTo(gutter + x, y);
      }
      ctx.stroke();
    });

    ctx.strokeStyle = "rgba(148,163,184,0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(width - 0.5, 0);
    ctx.lineTo(width - 0.5, height);
    ctx.stroke();
  });

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
    </div>
  );
}
