"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { Condition } from "@/lib/types";

export type View = "monitor" | "compare" | "manual";

export interface MonitorState {
  subjectId: string;
  condition: Condition;
  playing: boolean;
  speed: number;
  /** Electrode index the operator is inspecting, or null for auto (peak). */
  focusChannel: number | null;
  view: View;
  /** Two-patient view (PRD §8's closing move). */
  compareA: string;
  compareB: string;
}

/**
 * Playback clock and selection state.
 *
 * Split on purpose: structural state (which subject, which condition, playing
 * or not) goes through React and re-renders; the transport time `t` does not.
 * Canvases read `t` inside their own rAF callback and numeric readouts poll it
 * at a fixed low rate, so scrubbing a 300-second recording never re-renders the
 * tree at 60 Hz. That is what keeps the trace and the topomap smooth on the
 * phone a judge will open this on.
 */
class MonitorStore {
  state: MonitorState;
  /**
   * Starts one trace-window in, not at 0 — the scrolling trace has nothing to
   * draw for times before the recording starts, so t=0 shows an empty strip on
   * first paint and reads as a broken component.
   */
  t = 8;
  duration = 300;

  private listeners = new Set<() => void>();
  private frameListeners = new Set<(t: number) => void>();
  private raf: number | null = null;
  private last = 0;

  constructor(initial: MonitorState) {
    this.state = initial;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.state;

  private emit() {
    for (const l of this.listeners) l();
  }

  set(patch: Partial<MonitorState>) {
    const next = { ...this.state, ...patch };
    const changed = (Object.keys(patch) as Array<keyof MonitorState>).some(
      (k) => this.state[k] !== next[k],
    );
    if (!changed) return;
    this.state = next;
    this.emit();
  }

  seek(t: number) {
    this.t = Math.min(this.duration, Math.max(0, t));
    this.pump(this.t);
  }

  nudge(deltaSec: number) {
    this.seek(this.t + deltaSec);
  }

  togglePlay() {
    this.set({ playing: !this.state.playing });
  }

  subscribeFrame = (listener: (t: number) => void) => {
    this.frameListeners.add(listener);
    listener(this.t);
    this.ensureLoop();
    return () => {
      this.frameListeners.delete(listener);
    };
  };

  private pump(t: number) {
    for (const l of this.frameListeners) l(t);
  }

  private ensureLoop() {
    if (this.raf !== null) return;
    this.last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      if (this.state.playing) {
        this.t += dt * this.state.speed;
        if (this.t >= this.duration) this.t -= this.duration; // loop the recording
      }
      this.pump(this.t);
      this.raf = this.frameListeners.size > 0 ? requestAnimationFrame(step) : null;
    };
    this.raf = requestAnimationFrame(step);
  }
}

/**
 * The money plot: same drug concentration, ~0-point SDP gap, opposite
 * behavioral outcome. Chosen by scripts/find_money_plot.py and re-run whenever
 * the data changes — it has already moved once.
 *
 * Exported because the landing page tells the same story and must name the
 * same two patients. A second hardcoded copy silently goes stale the next time
 * the pair moves, which is exactly what happened.
 */
// Preset to the widest SDP separation available at moderate sedation, so the
// two readouts differ visibly on arrival. Note this is the pair where SDP
// happens to rank the patients CORRECTLY — the responder reads lighter — so
// the derived caption in CompareView tells the viewer as much and points them
// at a closer pair. The tightest pair (S03 vs S05, 0.2 points) is the one the
// monitor genuinely cannot call, and is one selection away.
export const MONEY_PAIR = { nonResponder: "S10", responder: "S08" } as const;

const INITIAL: MonitorState = {
  // S00 has all four conditions and is behaviorally responsive — the single
  // patient the slider demo walks through. See frontend/README.md.
  subjectId: "S00",
  condition: "moderate",
  playing: true,
  speed: 4,
  focusChannel: null,
  view: "monitor",
  compareA: MONEY_PAIR.nonResponder,
  compareB: MONEY_PAIR.responder,
};

const StoreContext = createContext<MonitorStore | null>(null);

export function MonitorProvider({ children }: { children: ReactNode }) {
  const store = useMemo(() => new MonitorStore(INITIAL), []);
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

function useStore(): MonitorStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useMonitor must be used inside <MonitorProvider>");
  return store;
}

export function useMonitor() {
  const store = useStore();
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { state, store };
}

/** Run `cb` with the transport time on every animation frame. */
export function useFrame(cb: (t: number) => void) {
  const store = useStore();
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => store.subscribeFrame((t) => ref.current(t)), [store]);
}

/** Transport time as React state, sampled at `hz` — for text readouts only. */
export function useTime(hz = 12): number {
  const store = useStore();
  const [t, setT] = useState(store.t);
  const last = useRef(0);
  useFrame(
    useCallback(
      (now: number) => {
        const stamp = performance.now();
        if (stamp - last.current < 1000 / hz) return;
        last.current = stamp;
        setT(now);
      },
      [hz],
    ),
  );
  useEffect(() => {
    setT(store.t);
  }, [store]);
  return t;
}
