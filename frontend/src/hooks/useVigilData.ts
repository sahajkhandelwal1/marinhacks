import { useCallback, useEffect, useRef, useState } from "react";

export type Electrode = {
  label: string;
  x: number;
  y: number;
};

export type Frame = {
  t: number;
  topo: number[];
  sdp: number;
  ci: number | null;
};

export type VigilData = {
  subject: string;
  condition: string;
  responsive: boolean;
  drug_concentration_ug_ml: number;
  fs: number;
  electrodes: Electrode[];
  frames: Frame[];
};

export type UseVigilDataReturn = {
  data: VigilData | null;
  isLoading: boolean;
  error: Error | null;
  currentFrame: Frame | null;
  currentFrameIndex: number;
  setFrameIndex: (index: number) => void;
  isPlaying: boolean;
  togglePlay: () => void;
  play: () => void;
  pause: () => void;
  speed: number;
  setSpeed: (multiplier: number) => void;
};

/** Playback multipliers. A 3000-frame recording at the native 10Hz takes a
 *  full 5 minutes, which is far too slow to demo, so the default is 10x. */
export const SPEED_OPTIONS = [1, 4, 10, 25];
const DEFAULT_SPEED = 10;
/** Ticks never exceed this; past it we advance several frames per tick
 *  instead. Kept deliberately low: each tick is a React state update that
 *  recolors ~20k cortex vertices and redraws two canvases, so the ceiling is
 *  React/paint throughput, not timer resolution. Ticking at 60 saturated the
 *  main thread badly enough to freeze the renderer, which made playback
 *  SLOWER than ticking at 12 with an 8x larger step. */
const MAX_TICK_FPS = 12;

export function useVigilData(fileName: string): UseVigilDataReturn {
  const [data, setData] = useState<VigilData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch telemetry JSON once the file name changes.
  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    setError(null);
    setCurrentFrameIndex(0);
    setIsPlaying(false);

    fetch(`/data/${fileName}.json`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to load /data/${fileName}.json (${res.status})`);
        }
        return res.json();
      })
      .then((payload: VigilData) => {
        if (!cancelled) {
          setData(payload);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fileName]);

  const clampedSetFrameIndex = useCallback(
    (index: number) => {
      if (!data) return;
      const last = Math.max(0, data.frames.length - 1);
      setCurrentFrameIndex(Math.min(Math.max(0, index), last));
    },
    [data]
  );

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const play = useCallback(() => {
    if (data && data.frames.length > 0) {
      setIsPlaying(true);
    }
  }, [data]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, pause, play]);

  // Playback at native rate x speed. Above MAX_TICK_FPS we keep the tick rate
  // fixed and step by more than one frame, so wall-clock speed keeps scaling
  // without scheduling timers the browser can't service.
  useEffect(() => {
    if (!isPlaying || !data) return;

    const nativeFps = data.fs > 0 ? data.fs : 10;
    const targetFps = nativeFps * speed;
    const tickFps = Math.min(targetFps, MAX_TICK_FPS);
    const intervalMs = 1000 / tickFps;
    const step = Math.max(1, Math.round(targetFps / tickFps));

    intervalRef.current = setInterval(() => {
      setCurrentFrameIndex((prev) => {
        const next = prev + step;
        if (next >= data.frames.length) {
          // Stop at the end instead of looping, so the scrubber stays usable.
          setIsPlaying(false);
          return data.frames.length - 1;
        }
        return next;
      });
    }, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPlaying, data, speed]);

  const currentFrame = data?.frames[currentFrameIndex] ?? null;

  return {
    data,
    isLoading,
    error,
    currentFrame,
    currentFrameIndex,
    setFrameIndex: clampedSetFrameIndex,
    isPlaying,
    togglePlay,
    play,
    pause,
    speed,
    setSpeed,
  };
}
