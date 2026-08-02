import { useCallback, useEffect, useRef, useState } from "react";

// Drives one shared "current frame" index from a rAF clock. Everything on the
// instrument reads the same index, so the readouts, brain, trace and timeline
// stay in lockstep. Speed is a demo convenience (recordings are ~300 s real).
export function usePlayback(frameCount: number, fs: number) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);

  const raf = useRef(0);
  const last = useRef(0);
  const acc = useRef(0); // fractional frame accumulator
  const idxRef = useRef(0);
  idxRef.current = index;

  useEffect(() => {
    if (!playing) return;
    last.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - last.current) / 1000;
      last.current = now;
      acc.current += dt * fs * speed;
      if (acc.current >= 1) {
        const step = Math.floor(acc.current);
        acc.current -= step;
        let next = idxRef.current + step;
        if (next >= frameCount - 1) {
          next = frameCount - 1;
          setIndex(next);
          setPlaying(false);
          return;
        }
        setIndex(next);
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, speed, fs, frameCount]);

  const toggle = useCallback(() => {
    setPlaying((p) => {
      if (!p && idxRef.current >= frameCount - 1) {
        setIndex(0);
        acc.current = 0;
      }
      return !p;
    });
  }, [frameCount]);

  const seek = useCallback((i: number) => {
    acc.current = 0;
    setIndex(Math.max(0, Math.min(frameCount - 1, i)));
  }, [frameCount]);

  const reset = useCallback(() => {
    setPlaying(false);
    acc.current = 0;
    setIndex(0);
  }, []);

  return { index, playing, speed, setSpeed, toggle, seek, reset };
}
