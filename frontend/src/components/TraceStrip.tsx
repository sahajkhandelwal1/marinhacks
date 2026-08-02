"use client";

import { useMemo } from "react";
import { useCanvas } from "@/hooks/useCanvas";
import { sdpAt, topoAt } from "@/lib/signal";
import { traceSample } from "@/lib/trace";
import type { Condition, SubjectBundle } from "@/lib/types";
import { useFrame, useMonitor } from "@/state/monitor";

const WINDOW_SEC = 8;
const BASE_ROWS = ["Fp1", "Fz", "C4", "O1"];

const CSS = {
  signal: "#2ace8c",
  ink3: "#56635f",
  rule: "#1a2224",
};

const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/**
 * Scrolling multi-channel trace. Every column is evaluated directly from the
 * transport time, so the waveform under the playhead is identical whether you
 * played to it or dragged to it.
 *
 * Reconstructed, not raw — see lib/trace.ts. The panel says so on screen.
 */
export function TraceStrip({
  bundle,
  condition,
}: {
  bundle: SubjectBundle;
  condition: Condition;
}) {
  const { containerRef, canvasRef, size } = useCanvas<HTMLDivElement>();
  const { state } = useMonitor();
  const data = bundle.conditions[condition];

  const values = useMemo(() => new Float32Array(bundle.electrodes.length), [bundle.electrodes.length]);

  // Four rows: the fixed set, with the focus channel swapped in if the
  // operator picked something outside it.
  const rows = useMemo(() => {
    const indexOf = (label: string) => bundle.electrodes.findIndex((e) => e.label === label);
    const picked = BASE_ROWS.map(indexOf).filter((i) => i >= 0);
    const focus = state.focusChannel;
    if (focus !== null && !picked.includes(focus)) picked[picked.length - 1] = focus;
    return picked;
  }, [bundle.electrodes, state.focusChannel]);

  useFrame((t) => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height, dpr } = size;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const rowHeight = height / rows.length;
    const gutter = 34;
    const plotWidth = width - gutter;
    const step = plotWidth > 720 ? 2 : 1; // sample every other column on wide displays

    rows.forEach((channel, r) => {
      const midY = rowHeight * (r + 0.5);
      const amplitude = rowHeight * 0.36;

      if (r > 0) {
        ctx.strokeStyle = CSS.rule;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, Math.round(rowHeight * r) + 0.5);
        ctx.lineTo(width, Math.round(rowHeight * r) + 0.5);
        ctx.stroke();
      }

      ctx.fillStyle = CSS.ink3;
      ctx.font = `9px ${MONO}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(bundle.electrodes[channel].label, 6, midY);

      ctx.beginPath();
      ctx.lineWidth = 1.5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.strokeStyle = CSS.signal;

      for (let x = 0; x <= plotWidth; x += step) {
        const tt = t - WINDOW_SEC + (x / plotWidth) * WINDOW_SEC;
        if (tt < 0) continue;
        const sdp = sdpAt(data, bundle.sdpFs, tt);
        topoAt(data, bundle.topoFs, tt, values);
        const y = midY - traceSample(tt, {
          sdp,
          alphaIndex: values[channel],
          seed: channel + 1,
        }) * amplitude * 0.28;
        if (x === 0) ctx.moveTo(gutter + x, y);
        else ctx.lineTo(gutter + x, y);
      }
      ctx.stroke();
    });

    // Leading edge — where "now" is.
    ctx.strokeStyle = "rgba(42,206,140,0.35)";
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

export const TRACE_WINDOW_SEC = WINDOW_SEC;
