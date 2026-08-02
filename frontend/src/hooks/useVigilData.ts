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
};

export function useVigilData(fileName: string): UseVigilDataReturn {
  const [data, setData] = useState<VigilData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

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

  // Drive playback at the recording's native sample rate (default 10 Hz → 100 ms).
  useEffect(() => {
    if (!isPlaying || !data) return;

    const intervalMs = data.fs > 0 ? 1000 / data.fs : 100;

    intervalRef.current = setInterval(() => {
      setCurrentFrameIndex((prev) => {
        const next = prev + 1;
        if (next >= data.frames.length) {
          // Stop at the end instead of looping, so the scrubber stays usable.
          setIsPlaying(false);
          return prev;
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
  }, [isPlaying, data]);

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
  };
}
