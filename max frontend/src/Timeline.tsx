import { useCallback, useEffect, useMemo, useRef } from "react";
import { isDisagreement, type Frame } from "./data";

interface Props {
  frames: Frame[];
  index: number;
  onSeek: (i: number) => void;
}

// The master control — one slider that drives everything — with the
// disagreement band burned into the track: wherever SDP reads unconscious while
// CI still shows the brain tracking the room, the timeline lights in alarm red.
export function Timeline({ frames, index, onSeek }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);

  const disagree = useMemo(() => frames.map(isDisagreement), [frames]);
  const hasCI = useMemo(() => frames.some((f) => f.ci != null), [frames]);

  useEffect(() => {
    const cv = canvas.current!;
    const ctx = cv.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio, 2);

    function draw() {
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      cv.width = w * dpr;
      cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const n = frames.length;
      const x = (i: number) => (i / (n - 1)) * w;

      // track base
      ctx.fillStyle = "#0e131c";
      ctx.fillRect(0, h * 0.5 - 3, w, 6);

      // disagreement bands
      ctx.fillStyle = "rgba(255,69,58,0.85)";
      let start = -1;
      for (let i = 0; i < n; i++) {
        if (disagree[i] && start < 0) start = i;
        if ((!disagree[i] || i === n - 1) && start >= 0) {
          const x0 = x(start);
          const x1 = x(disagree[i] ? i : i - 1);
          ctx.shadowBlur = 12;
          ctx.shadowColor = "rgba(255,69,58,0.7)";
          ctx.fillRect(x0, h * 0.5 - 8, Math.max(2, x1 - x0), 16);
          ctx.shadowBlur = 0;
          start = -1;
        }
      }

      // faint SDP + CI curves across the whole recording
      const drawCurve = (
        pick: (f: Frame) => number | null,
        min: number,
        max: number,
        color: string
      ) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < n; i += 2) {
          const v = pick(frames[i]);
          if (v == null) {
            started = false;
            continue;
          }
          const py = h - 6 - ((v - min) / (max - min)) * (h - 12);
          if (!started) {
            ctx.moveTo(x(i), py);
            started = true;
          } else ctx.lineTo(x(i), py);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      };
      drawCurve((f) => f.sdp, 0, 100, "#8fa8be");
      if (hasCI) drawCurve((f) => (f.ci == null ? null : f.ci * 100), 0, 100, "#ffb020");

      // playhead
      const px = x(index);
      ctx.strokeStyle = "#e8eef5";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, 4);
      ctx.lineTo(px, h - 4);
      ctx.stroke();
      ctx.fillStyle = "#e8eef5";
      ctx.beginPath();
      ctx.arc(px, h * 0.5, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(cv);
    return () => ro.disconnect();
  }, [frames, index, disagree, hasCI]);

  const seekFromEvent = useCallback(
    (clientX: number) => {
      const cv = canvas.current!;
      const rect = cv.getBoundingClientRect();
      const frac = (clientX - rect.left) / rect.width;
      onSeek(Math.round(frac * (frames.length - 1)));
    },
    [frames.length, onSeek]
  );

  useEffect(() => {
    const move = (e: MouseEvent) => dragging.current && seekFromEvent(e.clientX);
    const up = () => (dragging.current = false);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [seekFromEvent]);

  return (
    <div className="timeline-wrap">
      <canvas
        ref={canvas}
        className="timeline-canvas"
        role="slider"
        tabIndex={0}
        aria-label="Recording timeline"
        aria-valuemin={0}
        aria-valuemax={frames.length - 1}
        aria-valuenow={index}
        onMouseDown={(e) => {
          dragging.current = true;
          seekFromEvent(e.clientX);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") onSeek(Math.max(0, index - 10));
          if (e.key === "ArrowRight") onSeek(Math.min(frames.length - 1, index + 10));
        }}
      />
    </div>
  );
}
