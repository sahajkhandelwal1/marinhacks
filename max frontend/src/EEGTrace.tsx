import { useEffect, useRef } from "react";
import type { Electrode, Frame } from "./data";

// Scrolling frontal-montage trace. Oscillatory samples are reconstructed from
// each frame's per-electrode band power and SDP — this is a band-power envelope
// rendered as a waveform, not raw microvolts (labelled as such in the header).
// It exists to give the instrument the moving texture a clinician reads at a
// glance; the numbers remain the interface.

const CHANNELS = ["Fp1", "Fp2", "F3", "F4"];

interface Props {
  electrodes: Electrode[];
  frameRef: React.MutableRefObject<Frame | null>;
  alarmRef: React.MutableRefObject<boolean>;
}

export function EEGTrace({ electrodes, frameRef, alarmRef }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvas.current!;
    const ctx = cv.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const idx = CHANNELS.map((c) => electrodes.findIndex((e) => e.label === c));

    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    let dpr = Math.min(window.devicePixelRatio, 2);

    // rolling buffers, one per channel
    const cols = 900;
    const buf = idx.map(() => new Float32Array(cols).fill(0));
    let head = 0;
    const phase = idx.map(() => Math.random() * 6.28);

    function resize() {
      dpr = Math.min(window.devicePixelRatio, 2);
      cv.width = W() * dpr;
      cv.height = H() * dpr;
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cv);

    let raf = 0;
    let last = performance.now();

    function draw(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const frame = frameRef.current;

      // advance the synthetic signal
      const stepCount = reduce ? 1 : Math.max(1, Math.round(dt * 260));
      for (let s = 0; s < stepCount; s++) {
        head = (head + 1) % cols;
        for (let c = 0; c < idx.length; c++) {
          const power = frame && idx[c] >= 0 ? frame.topo[idx[c]] ?? 0.3 : 0.3;
          const sdp = frame ? frame.sdp : 60;
          // deeper (low SDP) -> slower, larger slow waves; awake -> faster low-amp
          const slow = 0.5 + (100 - sdp) / 90;
          phase[c] += 0.09 * slow;
          const amp = 0.3 + power * 0.9;
          const val =
            Math.sin(phase[c]) * amp +
            Math.sin(phase[c] * 2.3 + c) * amp * 0.35 +
            (Math.random() - 0.5) * 0.12;
          buf[c][head] = val;
        }
      }

      // render
      const w = cv.width;
      const h = cv.height;
      ctx.clearRect(0, 0, w, h);
      const alarm = alarmRef.current;
      const rows = idx.length;
      const top = 22 * dpr; // clearance for the pane tag
      const rowH = (h - top) / rows;

      for (let c = 0; c < rows; c++) {
        const midY = top + rowH * (c + 0.5);
        // baseline
        ctx.strokeStyle = "rgba(35,48,63,0.6)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, midY);
        ctx.lineTo(w, midY);
        ctx.stroke();

        ctx.strokeStyle = alarm ? "#ff6b62" : "#8fa8be";
        ctx.lineWidth = 1.4 * dpr;
        ctx.shadowBlur = 8 * dpr;
        ctx.shadowColor = alarm ? "rgba(255,69,58,0.6)" : "rgba(143,168,190,0.35)";
        ctx.beginPath();
        for (let x = 0; x < cols; x++) {
          const bi = (head + 1 + x) % cols;
          const px = (x / (cols - 1)) * w;
          const py = midY - buf[c][bi] * rowH * 0.34;
          if (x === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        // channel label
        ctx.fillStyle = "#5d6d7e";
        ctx.font = `${11 * dpr}px "IBM Plex Mono", monospace`;
        ctx.fillText(CHANNELS[c], 8 * dpr, midY - rowH * 0.3);
      }

      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [electrodes, frameRef, alarmRef]);

  return (
    <canvas ref={canvas} style={{ width: "100%", height: "100%", display: "block" }} />
  );
}
