"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCanvas } from "@/hooks/useCanvas";
import { sdpAt } from "@/lib/signal";
import type { Condition, SubjectBundle } from "@/lib/types";
import { useFrame, useMonitor } from "@/state/monitor";

import { THEME, uiFont } from "@/lib/theme";

const PAD = { top: 10, right: 42, bottom: 18, left: 0 };

/**
 * SDP over the full condition, with the playhead. Doubles as the time
 * scrubber: drag anywhere on it to seek.
 *
 * One series, so no legend — the panel label names it. The 60 and 85 rules are
 * the reading thresholds the number is judged against, drawn as recessive
 * hairlines rather than a gridline every 10. 100 is drawn too, at the very
 * top of the plot, so the scale visibly tops out instead of implying the
 * data was clipped short of it.
 */
export function SdpTimeline({
  bundle,
  condition,
  compare,
}: {
  bundle: SubjectBundle;
  condition: Condition;
  /** Optional second subject drawn behind, for the two-patient view. */
  compare?: SubjectBundle | null;
}) {
  const { containerRef, canvasRef, size } = useCanvas<HTMLDivElement>();
  const { store } = useMonitor();
  const [hoverT, setHoverT] = useState<number | null>(null);
  const dragging = useRef(false);

  // This condition's own length. See the playhead comment below.
  const durationSec = bundle.conditions[condition].durationSec;
  const series = bundle.conditions[condition].sdp;
  const compareSeries = compare?.conditions[condition].sdp ?? null;

  /**
   * Per-pixel min/max envelope. 3000 points into ~900 px means every column
   * covers several samples; plotting one of them drops the peaks and makes a
   * noisy signal look calm. The envelope keeps the real excursion visible.
   */
  const envelope = useMemo(() => {
    const width = Math.max(1, Math.round(size.width - PAD.right));
    const build = (values: number[]) => {
      const min = new Float32Array(width);
      const max = new Float32Array(width);
      for (let x = 0; x < width; x++) {
        const from = Math.floor((x / width) * values.length);
        const to = Math.max(from + 1, Math.floor(((x + 1) / width) * values.length));
        let lo = Infinity;
        let hi = -Infinity;
        for (let i = from; i < to && i < values.length; i++) {
          if (values[i] < lo) lo = values[i];
          if (values[i] > hi) hi = values[i];
        }
        min[x] = lo;
        max[x] = hi;
      }
      return { min, max, width };
    };
    return {
      primary: build(series),
      secondary: compareSeries ? build(compareSeries) : null,
    };
  }, [series, compareSeries, size.width]);

  useFrame((t) => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height, dpr } = size;
    const plotW = width - PAD.right;
    const plotH = height - PAD.top - PAD.bottom;
    const yOf = (v: number) => PAD.top + plotH * (1 - v / 100);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Reference rules.
    ctx.font = `9px ${uiFont()}`;
    ctx.textBaseline = "middle";
    for (const level of [100, 85, 60, 40]) {
      const y = Math.round(yOf(level)) + 0.5;
      ctx.strokeStyle = THEME.rule;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(plotW, y);
      ctx.stroke();
      ctx.fillStyle = THEME.ink3;
      ctx.textAlign = "left";
      ctx.fillText(String(level), plotW + 6, y);
    }

    const drawEnvelope = (
      env: { min: Float32Array; max: Float32Array; width: number },
      stroke: string,
      lineWidth: number,
    ) => {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      // Round caps: a column where min≈max (a locally flat run of samples,
      // common on the real dataset's smoother stretches) is a near-zero-length
      // segment. Butt caps render those as nothing, which reads as a dashed,
      // barely-visible line. Round caps draw a lineWidth-diameter dot instead,
      // so every column stays visible and the trace reads as continuous.
      ctx.lineCap = "round";
      ctx.beginPath();
      for (let x = 0; x < env.width; x++) {
        ctx.moveTo(x + 0.5, yOf(env.min[x]));
        ctx.lineTo(x + 0.5, yOf(env.max[x]));
      }
      ctx.stroke();
      ctx.lineCap = "butt";
    };

    // Two patients: the second series goes underneath at 3px and the first
    // over it at 1px, so where they agree the amber reads as a halo around the
    // blue instead of being hidden by it. They agree almost everywhere — which
    // is the finding, and it has to be visible rather than implied.
    if (envelope.secondary) drawEnvelope(envelope.secondary, THEME.alert, 3);
    drawEnvelope(envelope.primary, THEME.accent, envelope.secondary ? 1 : 1.5);

    // Playhead.
    // The active condition's own length, not the bundle's. Conditions differ
    // in duration on real recordings, and using the bundle value drew the
    // playhead at a position that did not correspond to the plotted trace on
    // every condition except the one the bundle value came from.
    const x = Math.round((t / durationSec) * plotW) + 0.5;
    ctx.strokeStyle = THEME.accent;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height - PAD.bottom);
    ctx.stroke();

    // No dot on the playhead. It was drawn at yOf(sdpAt(t)) — the instantaneous
    // value — while the series itself is rendered as a min/max envelope per
    // pixel column, so the dot sat off the visible line. In the two-patient
    // view a single dot could only ever track one of the two series anyway.
    // The vertical playhead already carries the time position.

    // Time axis: a mark a minute.
    ctx.fillStyle = THEME.ink3;
    ctx.textAlign = "center";
    for (let sec = 0; sec <= durationSec; sec += 60) {
      const tx = (sec / durationSec) * plotW;
      ctx.fillText(`${sec / 60}m`, Math.min(plotW - 8, Math.max(8, tx)), height - PAD.bottom / 2);
    }
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const seekFrom = (clientX: number) => {
      const rect = el.getBoundingClientRect();
      const ratio = (clientX - rect.left) / Math.max(1, rect.width - PAD.right);
      store.seek(Math.min(1, Math.max(0, ratio)) * durationSec);
    };

    const onDown = (e: PointerEvent) => {
      dragging.current = true;
      el.setPointerCapture(e.pointerId);
      seekFrom(e.clientX);
    };
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / Math.max(1, rect.width - PAD.right);
      setHoverT(Math.min(1, Math.max(0, ratio)) * durationSec);
      if (dragging.current) seekFrom(e.clientX);
    };
    const onUp = (e: PointerEvent) => {
      dragging.current = false;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };

    const onLeave = () => setHoverT(null);

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [containerRef, store, durationSec]);

  return (
    <div ref={containerRef} className="relative h-full w-full touch-none">
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
      {hoverT !== null ? (
        <div
          className="pointer-events-none absolute top-1 border border-rule-strong bg-canvas px-1.5 py-0.5 metric text-2xs text-ink-2"
          style={{
            left: Math.min(
              size.width - 96,
              (hoverT / durationSec) * (size.width - PAD.right) + 6,
            ),
          }}
        >
          {formatClock(hoverT)} · {sdpAt(bundle.conditions[condition], bundle.sdpFs, hoverT).toFixed(0)}
        </div>
      ) : null}
    </div>
  );
}

export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
