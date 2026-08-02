"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCanvas } from "@/hooks/useCanvas";
import { inkOn, topoCss } from "@/lib/color";
import { peakChannel, regionOf, topoAt } from "@/lib/signal";
import { FIELD_SIZE, SCALP_INSET, fieldGeometry, renderField } from "@/lib/topo";
import type { Condition, SubjectBundle } from "@/lib/types";
import { useFrame, useMonitor } from "@/state/monitor";

const CSS = {
  rule: "#2a3639",
  ruleFaint: "#1a2224",
  surface: "#0a0e0f",
  ink: "#e4ece9",
  ink2: "#8fa09b",
  ink3: "#56635f",
  signal: "#2ace8c",
};

const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/**
 * The main stage: a 2D scalp topomap of the alpha index, animated at the
 * transport rate. Hover (or tap) an electrode to pin it as the focus channel.
 */
export function Topomap({
  bundle,
  condition,
  interactive = true,
  showLabels = true,
}: {
  bundle: SubjectBundle;
  condition: Condition;
  interactive?: boolean;
  showLabels?: boolean;
}) {
  const { containerRef, canvasRef, size } = useCanvas<HTMLDivElement>();
  const { state, store } = useMonitor();
  const [hover, setHover] = useState<number | null>(null);

  const data = bundle.conditions[condition];
  const electrodes = bundle.electrodes;

  const geometry = useMemo(() => fieldGeometry(electrodes), [electrodes]);
  const values = useMemo(() => new Float32Array(electrodes.length), [electrodes.length]);

  // Offscreen field buffer — allocated once, rewritten in place each frame.
  const fieldRef = useRef<{ canvas: HTMLCanvasElement; image: ImageData } | null>(null);
  if (fieldRef.current === null && typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = FIELD_SIZE;
    canvas.height = FIELD_SIZE;
    const ctx = canvas.getContext("2d");
    if (ctx) fieldRef.current = { canvas, image: ctx.createImageData(FIELD_SIZE, FIELD_SIZE) };
  }

  // Screen positions of each electrode, recomputed only on resize.
  const layout = useMemo(() => {
    const { width, height } = size;
    const side = Math.min(width, height);
    // Inset leaves room for the nose above and the O1/O2 labels below, which
    // sit 9px under their dots and would otherwise clip at the canvas edge.
    const radius = side / 2 - 24;
    const cx = width / 2;
    const cy = height / 2;
    const points = electrodes.map((e) => ({
      x: cx + e.x * radius * SCALP_INSET,
      y: cy - e.y * radius * SCALP_INSET,
      label: e.label,
    }));
    return { cx, cy, radius, points };
  }, [size, electrodes]);

  useFrame((t) => {
    const canvas = canvasRef.current;
    const field = fieldRef.current;
    if (!canvas || !field || size.width === 0) return;
    const ctx = canvas.getContext("2d");
    const fieldCtx = field.canvas.getContext("2d");
    if (!ctx || !fieldCtx) return;

    topoAt(data, bundle.topoFs, t, values);
    renderField(field.image, geometry, values);
    fieldCtx.putImageData(field.image, 0, 0);

    const { cx, cy, radius, points } = layout;
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);

    // Field, upscaled — the browser's bilinear filter is the interpolator.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(field.canvas, cx - radius, cy - radius, radius * 2, radius * 2);

    // Head chrome: outline, nose at +y, ears. Hairlines only.
    ctx.lineWidth = 1;
    ctx.strokeStyle = CSS.rule;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - radius * 0.13, cy - radius * 0.99);
    ctx.lineTo(cx, cy - radius - 11);
    ctx.lineTo(cx + radius * 0.13, cy - radius * 0.99);
    ctx.stroke();

    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + side * radius, cy - radius * 0.05, 5, radius * 0.16, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    const focus = state.focusChannel ?? peakChannel(values);

    points.forEach((p, i) => {
      const isFocus = i === focus;
      const isHover = i === hover;
      // Dot and label are drawn on top of the field, so both take their ink
      // from the local field value rather than a fixed color.
      const over = inkOn(values[i]);

      ctx.beginPath();
      ctx.arc(p.x, p.y, isFocus || isHover ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = CSS.surface;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p.x, p.y, isFocus || isHover ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = isFocus ? CSS.signal : over;
      ctx.fill();

      if (showLabels) {
        ctx.font = `${isFocus ? "600 " : ""}9px ${MONO}`;
        ctx.fillStyle = isFocus ? CSS.signal : over;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(p.label, p.x, p.y + 9);
      }
    });
  });

  useEffect(() => {
    if (!interactive) return;
    const el = containerRef.current;
    if (!el) return;

    const nearest = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      let best = -1;
      let bestDist = 18;
      layout.points.forEach((p, i) => {
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      return best;
    };

    const onMove = (e: PointerEvent) => {
      const i = nearest(e.clientX, e.clientY);
      setHover(i >= 0 ? i : null);
    };
    const onLeave = () => setHover(null);
    const onDown = (e: PointerEvent) => {
      const i = nearest(e.clientX, e.clientY);
      store.set({ focusChannel: i >= 0 && i !== store.state.focusChannel ? i : null });
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("pointerdown", onDown);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("pointerdown", onDown);
    };
  }, [interactive, layout, containerRef, store]);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
      {hover !== null && hover >= 0 ? (
        <HoverTag electrode={electrodes[hover].label} point={layout.points[hover]} />
      ) : null}
    </div>
  );
}

function HoverTag({
  electrode,
  point,
}: {
  electrode: string;
  point: { x: number; y: number };
}) {
  return (
    <div
      className="pointer-events-none absolute z-10 whitespace-nowrap border border-rule-bright bg-void px-2 py-1 readout text-2xs text-ink"
      style={{ left: point.x + 10, top: point.y - 24 }}
    >
      {electrode} · {regionOf(electrode)}
    </div>
  );
}

/** Scale legend. A continuous ramp needs one; without it the colors are decoration. */
export function TopoLegend() {
  const steps = Array.from({ length: 28 }, (_, i) => i / 27);
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <span className="eyebrow shrink-0">alpha index</span>
      <div className="flex h-2 flex-1">
        {steps.map((s) => (
          <div key={s} className="flex-1" style={{ background: topoCss(s) }} />
        ))}
      </div>
      <span className="readout shrink-0 text-2xs text-ink-3">0 — 1 vs baseline</span>
    </div>
  );
}
