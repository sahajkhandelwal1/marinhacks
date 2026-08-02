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
import { DEFAULT_DATA_SOURCE } from "@/lib/dataset";
import type { Condition, DataSource } from "@/lib/types";

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
  /** Synthetic (default) or real EEG bundle — see frontend/src/lib/dataset.ts. */
  dataSource: DataSource;
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
 * The synthetic-dataset comparison pair.
 *
 * Currently preset to the WIDEST SDP separation at moderate sedation, so the
 * two readouts differ visibly on arrival. Note this is a pair where SDP ranks
 * the patients correctly — the responder reads lighter — so CompareView's
 * derived caption says as much and points at a closer pair. The tightest pair
 * (the one the monitor genuinely cannot call) is one selection away in the UI;
 * scripts/find_money_plot.py reports it.
 *
 * Exported because the landing page tells the same story and must name the
 * same two patients. A second hardcoded copy silently goes stale the next time
 * the pair moves, which is exactly what happened once already.
 */
export const MONEY_PAIR = { nonResponder: "S10", responder: "S08" } as const;

/**
 * Per-source defaults for subjectId/compareA/compareB — the two datasets
 * don't share subject IDs ("S00".."S19" vs the real dataset's native "02",
 * "03", ...), so switching dataSource resets these to something valid
 * rather than pointing at a subject that 404s. See DATA_SOURCE_DEFAULTS's
 * use in the toggle handler below.
 */
export const DATA_SOURCE_DEFAULTS: Record<DataSource, Pick<MonitorState, "subjectId" | "compareA" | "compareB">> = {
  synthetic: {
    // S00 has all four conditions and is behaviorally responsive — the
    // single patient the slider demo walks through. See frontend/README.md.
    subjectId: "S00",
    compareA: MONEY_PAIR.nonResponder,
    compareB: MONEY_PAIR.responder,
  },
  real: {
    // Subject 03: responsive at baseline/mild, drops to 3/40 correct at
    // moderate — a clean, clearly non-responsive case. See
    // pipeline/load_local_eeglab.py / scripts/emit_real_json.py.
    subjectId: "03",
    // The inversion, and the strongest thing in the real dataset: 07 did NOT
    // respond and reads near the top of the scale, while 18 DID respond to
    // command and reads near the bottom. SDP does not merely fail to separate
    // them, it ranks them backwards. The ordering is the finding; the exact
    // point gap depends on where emit_real_json.py's calibration puts the
    // endpoints.
    compareA: "07",
    compareB: "18",
  },
};

const INITIAL: MonitorState = {
  // Real recordings are the default now that they exist. The synthetic set
  // stays one toggle away as an A/B reference.
  ...DATA_SOURCE_DEFAULTS[DEFAULT_DATA_SOURCE],
  condition: "moderate",
  playing: true,
  speed: 4,
  focusChannel: null,
  view: "monitor",
  dataSource: DEFAULT_DATA_SOURCE,
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
