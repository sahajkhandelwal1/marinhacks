"use client";

import { useEffect, useRef, useState } from "react";

export interface CanvasSize {
  width: number;
  height: number;
  dpr: number;
}

/**
 * Keeps a canvas' backing store matched to its CSS box and the device pixel
 * ratio, and reports the CSS-pixel size so draw code can work in CSS units.
 * Every canvas in the app is laid out by CSS, never by fixed width/height
 * attributes — the dashboard has to survive a phone (PRD §8: judges will open
 * the QR on their phones).
 */
export function useCanvas<T extends HTMLElement>() {
  const containerRef = useRef<T | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0, dpr: 1 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const apply = () => {
      const rect = el.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));

      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      setSize((prev) =>
        prev.width === width && prev.height === height && prev.dpr === dpr
          ? prev
          : { width, height, dpr },
      );
    };

    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { containerRef, canvasRef, size };
}
