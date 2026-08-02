"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { DeepDiveCanvas, type DiveFrame } from "./DeepDiveCanvas";
import { BrainThumb } from "../BrainThumb";
import { loadManifest, loadSubject } from "@/lib/dataset";
import type { Manifest, SubjectBundle } from "@/lib/types";
import { MONEY_PAIR } from "@/state/monitor";

/**
 * The front page: one scroll, macro to micro.
 *
 * Two rules hold the whole thing together.
 *
 * First, scroll progress never enters React state. A rAF-throttled listener
 * writes one MotionValue; card opacity and the background come off it through
 * `useTransform` (composited, no re-render), and the camera reads a plain ref
 * inside the r3f loop. A `useState` on scroll would re-render a 20,000-vertex
 * scene on every wheel tick.
 *
 * The progress is computed here rather than with `useScroll({ target })`,
 * which silently stopped updating its transforms in this layout — the pinned
 * child inside the measured track appears to defeat its measurement. Deriving
 * it from the track's own rect is a few more lines and is inspectable when it
 * misbehaves.
 *
 * Second, nothing important is only reachable by scrolling. There is a skip
 * link to the workspace in the corner from the first frame, the launch
 * platform below works as a plain page, and reduced-motion users get the same
 * content with the camera parked.
 */

// One source of truth with the monitor — see MONEY_PAIR.
const PAIR_SUBJECTS = { left: MONEY_PAIR.nonResponder, right: MONEY_PAIR.responder } as const;

export function LandingPage() {
  const trackRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const reduced = useReducedMotion() ?? false;

  const scrollYProgress = useMotionValue(0);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    let frame = 0;
    const update = () => {
      const total = el.offsetHeight - window.innerHeight;
      const travelled = -el.getBoundingClientRect().top;
      const p = total <= 0 ? 0 : Math.min(1, Math.max(0, travelled / total));
      scrollYProgress.set(p);
      progressRef.current = p;
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [scrollYProgress]);

  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [pair, setPair] = useState<{ left: SubjectBundle; right: SubjectBundle } | null>(null);

  useEffect(() => {
    loadManifest().then(setManifest).catch(() => {});
    Promise.all([loadSubject(PAIR_SUBJECTS.left), loadSubject(PAIR_SUBJECTS.right)])
      .then(([left, right]) => setPair({ left, right }))
      .catch(() => {});
  }, []);

  // A representative frame from the middle of each recording, rather than the
  // first — frame 0 is just where the file happens to start.
  const frame: DiveFrame = useMemo(() => {
    if (!pair) return { topo: null, electrodes: null, pair: null };
    const mid = (b: SubjectBundle) => {
      const rows = b.conditions.moderate.topo;
      return rows[Math.floor(rows.length / 2)];
    };
    return {
      topo: mid(pair.right),
      electrodes: pair.right.electrodes,
      pair: { left: mid(pair.left), right: mid(pair.right) },
    };
  }, [pair]);

  // Dark to clinical light, across the middle of the dive.
  const pageBg = useTransform(scrollYProgress, [0.42, 0.74], ["#0b1220", "#f1f5f9"]);
  const headingInk = useTransform(scrollYProgress, [0.42, 0.74], ["#e8eef6", "#0f172a"]);
  const cardBg = useTransform(
    scrollYProgress,
    [0.42, 0.74],
    ["rgba(13,22,38,0.82)", "rgba(255,255,255,0.9)"],
  );
  const cardBorder = useTransform(
    scrollYProgress,
    [0.42, 0.74],
    ["rgba(148,163,184,0.25)", "rgba(226,232,240,1)"],
  );
  const cardInk = useTransform(scrollYProgress, [0.42, 0.74], ["#e8eef6", "#0f172a"]);
  const cardMuted = useTransform(scrollYProgress, [0.42, 0.74], ["#94a3b8", "#475569"]);

  const heroOpacity = useTransform(scrollYProgress, [0, 0.07], [1, 0]);
  const card1 = useTransform(scrollYProgress, [0.13, 0.2, 0.31, 0.36], [0, 1, 1, 0]);
  const card2 = useTransform(scrollYProgress, [0.38, 0.44, 0.56, 0.6], [0, 1, 1, 0]);
  const card3 = useTransform(scrollYProgress, [0.63, 0.69, 0.8, 0.85], [0, 1, 1, 0]);

  const cardStyle = { background: cardBg, borderColor: cardBorder, color: cardInk };

  return (
    <motion.div style={{ background: pageBg }} className="relative">
      <SkipLink />

      {/* Scroll track. The stage inside is pinned for its whole length; the
          height is what gives the dive its pacing. */}
      <div ref={trackRef} className="relative h-[560vh]">
        <div className="sticky top-0 h-screen overflow-hidden">
          <div className="absolute inset-0">
            <DeepDiveCanvas frame={frame} progressRef={progressRef} reducedMotion={reduced} />
          </div>

          {/* Hero. The scrim keeps the headline legible where the cortex
              drifts up behind it — the alternative is pushing the brain so far
              down that the opening loses its scale. */}
          <motion.div
            style={{ opacity: heroOpacity }}
            className="pointer-events-none absolute inset-x-0 top-0 h-[62vh] bg-gradient-to-b from-[#0b1220] via-[#0b1220]/85 to-transparent"
          />
          <motion.div
            style={{ opacity: heroOpacity }}
            className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center px-6 pt-[12vh] text-center"
          >
            <span className="status text-[#7f9bc4]">Probe · depth of anesthesia</span>
            <motion.h1
              style={{ color: headingInk }}
              className="mt-5 max-w-2xl text-[clamp(2.1rem,5vw,3.6rem)] font-semibold leading-[1.05] tracking-tight"
            >
              Inside the Anesthetized Mind.
            </motion.h1>
            <p className="mt-5 max-w-xl text-sm leading-relaxed text-[#a8bad4]">
              The monitor in every operating room measures whether the brain is talking to
              itself. We measure whether it is still listening to the room.
            </p>
          </motion.div>

          <motion.div
            style={{ opacity: heroOpacity }}
            className="pointer-events-none absolute inset-x-0 bottom-10 flex flex-col items-center gap-2"
          >
            <span className="status text-[#7f9bc4]">Scroll to probe</span>
            <ScrollPulse reduced={reduced} />
          </motion.div>

          {/* Pinned cards */}
          <StoryCard opacity={card1} style={cardStyle} align="left">
            <CardMetrics muted={cardMuted} progress={scrollYProgress} />
          </StoryCard>

          <StoryCard opacity={card2} style={cardStyle} align="center">
            <CardComparison manifest={manifest} muted={cardMuted} />
          </StoryCard>

          <StoryCard opacity={card3} style={cardStyle} align="right">
            <CardSandbox muted={cardMuted} />
          </StoryCard>
        </div>
      </div>

      <RosterPeek manifest={manifest} />
      <LaunchPlatform frame={frame} />
    </motion.div>
  );
}

function SkipLink() {
  return (
    <Link
      href="/monitor/"
      className="absolute right-4 top-4 z-30 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-2xs font-semibold text-white/80 backdrop-blur transition-colors hover:bg-white/20 hover:text-white focus-visible:bg-white/20"
    >
      Skip to workspace →
    </Link>
  );
}

function ScrollPulse({ reduced }: { reduced: boolean }) {
  return (
    <motion.span
      className="block h-8 w-[1.5px] origin-top rounded-full bg-gradient-to-b from-[#7f9bc4] to-transparent"
      animate={reduced ? undefined : { scaleY: [0.4, 1, 0.4], opacity: [0.35, 1, 0.35] }}
      transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

function StoryCard({
  opacity,
  style,
  align,
  children,
}: {
  opacity: MotionValue<number>;
  style: Record<string, unknown>;
  align: "left" | "center" | "right";
  children: React.ReactNode;
}) {
  const position =
    align === "left"
      ? "md:left-[6vw] md:right-auto md:w-[26rem]"
      : align === "right"
        ? "md:right-[6vw] md:left-auto md:w-[26rem]"
        : "md:left-1/2 md:right-auto md:w-[34rem] md:-translate-x-1/2";

  return (
    <motion.div
      style={{ opacity, ...style }}
      className={`pointer-events-none absolute inset-x-4 bottom-[8vh] rounded-panel border p-5 shadow-raised backdrop-blur-md md:inset-x-auto md:top-1/2 md:bottom-auto md:-translate-y-1/2 ${position}`}
    >
      {children}
    </motion.div>
  );
}

/** Card 1 — the two numbers the monitor actually reports. */
function CardMetrics({
  muted,
  progress,
}: {
  muted: MotionValue<string>;
  progress: MotionValue<number>;
}) {
  // Counters wound by scroll position rather than a timer, so they respond to
  // the reader's own pace and land on the same value every time.
  const sdp = useTransform(progress, [0.15, 0.34], [92, 37]);
  const alpha = useTransform(progress, [0.15, 0.34], [0.81, 0.29]);

  return (
    <>
      <span className="status" style={{ color: "#5b8def" }}>
        01 · The metrics
      </span>
      <h2 className="mt-2 text-xl font-semibold tracking-tight">
        One number, computed from the rhythm.
      </h2>
      <motion.p style={{ color: muted }} className="mt-2 text-2xs leading-relaxed">
        SDP is a spectral depth proxy — log alpha over delta, anchored to this patient&apos;s
        own awake baseline. It is what today&apos;s monitors compute.
      </motion.p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Readout label="SDP" value={sdp} digits={0} />
        <Readout label="Alpha index" value={alpha} digits={2} />
      </div>

      <WaveStrip />
    </>
  );
}

function Readout({
  label,
  value,
  digits,
}: {
  label: string;
  value: MotionValue<number>;
  digits: number;
}) {
  const [shown, setShown] = useState("0");
  useMotionValueEvent(value, "change", (v) => setShown(v.toFixed(digits)));
  useEffect(() => {
    setShown(value.get().toFixed(digits));
  }, [value, digits]);

  return (
    <div className="rounded-lg border border-current/10 px-3 py-2.5">
      <span className="label" style={{ color: "inherit", opacity: 0.6 }}>
        {label}
      </span>
      <p className="metric-hero mt-1 text-3xl">{shown}</p>
    </div>
  );
}

/** A looping reconstructed-trace placeholder — decorative, and labeled as such. */
function WaveStrip() {
  return (
    <div className="mt-4">
      <svg viewBox="0 0 240 34" className="h-9 w-full" aria-hidden>
        <motion.path
          d="M0 17 Q 10 4 20 17 T 40 17 T 60 17 T 80 17 T 100 17 T 120 17 T 140 17 T 160 17 T 180 17 T 200 17 T 220 17 T 240 17"
          fill="none"
          stroke="#5b8def"
          strokeWidth="1.5"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />
      </svg>
      <p className="text-2xs opacity-60">Reconstructed trace — illustrative</p>
    </div>
  );
}

/** Card 2 — the money plot, in one sentence. */
function CardComparison({
  manifest,
  muted,
}: {
  manifest: Manifest | null;
  muted: MotionValue<string>;
}) {
  const stat = (id: string) =>
    manifest?.subjects.find((s) => s.subject === id)?.conditions.moderate.median;

  return (
    <>
      <span className="status" style={{ color: "#5b8def" }}>
        02 · The comparison
      </span>
      <h2 className="mt-2 text-xl font-semibold tracking-tight">
        Same drug. Same number. Opposite patients.
      </h2>
      <motion.p style={{ color: muted }} className="mt-2 text-2xs leading-relaxed">
        Both at 1.2 µg/mL propofol. One was answering questions. Nothing in the spectrum
        separates them.
      </motion.p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <OutcomeTile
          subject={PAIR_SUBJECTS.left}
          sdp={stat(PAIR_SUBJECTS.left)}
          tag="Did not respond"
          tone="neutral"
        />
        <OutcomeTile
          subject={PAIR_SUBJECTS.right}
          sdp={stat(PAIR_SUBJECTS.right)}
          tag="Responded to command"
          tone="alert"
        />
      </div>
    </>
  );
}

function OutcomeTile({
  subject,
  sdp,
  tag,
  tone,
}: {
  subject: string;
  sdp?: number;
  tag: string;
  tone: "neutral" | "alert";
}) {
  return (
    <div
      className="rounded-lg border px-3 py-2.5"
      style={{ borderColor: tone === "alert" ? "#eb6834" : "currentColor", opacity: 0.98 }}
    >
      <span className="metric text-2xs opacity-60">{subject}</span>
      <p className="metric-hero mt-0.5 text-3xl">{sdp?.toFixed(0) ?? "—"}</p>
      <p
        className="mt-1.5 text-2xs font-semibold"
        style={{ color: tone === "alert" ? "#eb6834" : "inherit", opacity: tone === "alert" ? 1 : 0.65 }}
      >
        {tag}
      </p>
    </div>
  );
}

/** Card 3 — the sandbox, with the warning it requires. */
function CardSandbox({ muted }: { muted: MotionValue<string> }) {
  return (
    <>
      <span className="status" style={{ color: "#5b8def" }}>
        03 · The sandbox
      </span>
      <h2 className="mt-2 text-xl font-semibold tracking-tight">
        Push the index and watch it lie.
      </h2>
      <motion.p style={{ color: muted }} className="mt-2 text-2xs leading-relaxed">
        Aim a simulated beam at the thalamus and drive delta. The index falls — not because
        anything happened to consciousness, but because delta sits in its denominator.
      </motion.p>

      <div
        className="mt-4 flex items-baseline gap-2.5 rounded-lg px-3 py-2.5"
        style={{ background: "rgba(235,104,52,0.12)", border: "1px solid rgba(235,104,52,0.5)" }}
      >
        <span className="status shrink-0" style={{ color: "#eb6834" }}>
          Simulation
        </span>
        <span className="text-2xs leading-relaxed" style={{ color: "#eb6834" }}>
          No such device exists and no intervention was recorded.
        </span>
      </div>
    </>
  );
}

/** The cohort, condensed — a peek at what the workspace opens onto. */
function RosterPeek({ manifest }: { manifest: Manifest | null }) {
  return (
    <section className="mx-auto max-w-5xl px-6 py-20">
      <span className="status text-ink-3">The cohort</span>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
        Twenty subjects, four sedation levels each.
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">
        Median SDP at moderate sedation, and the propofol target that produced it. The
        responders are scattered through the same range as everyone else.
      </p>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead>
            <tr className="border-b border-rule">
              <th className="label py-2 font-medium">Subject</th>
              <th className="label py-2 text-right font-medium">Median SDP</th>
              <th className="label py-2 text-right font-medium">Propofol</th>
              <th className="label py-2 text-right font-medium">Behavior at moderate</th>
            </tr>
          </thead>
          <tbody>
            {(manifest?.subjects ?? []).map((s) => {
              const m = s.conditions.moderate;
              return (
                <tr key={s.subject} className="border-b border-rule/70">
                  <td className="metric py-2 text-2xs font-medium text-ink">{s.subject}</td>
                  <td className="metric py-2 text-right text-2xs text-ink-2">
                    {m.median.toFixed(1)}
                  </td>
                  <td className="metric py-2 text-right text-2xs text-ink-3">
                    {/* Null on the real dataset — no dosage figure ships with
                        those recordings. Render a dash rather than inventing
                        a concentration. */}
                    {m.drugConcentration === null ? (
                      "—"
                    ) : (
                      <>
                        {m.drugConcentration.toFixed(1)} <span className="unit">µg/mL</span>
                      </>
                    )}
                  </td>
                  <td
                    className="py-2 text-right text-2xs font-semibold"
                    style={{ color: s.responsive ? "#b4451d" : "#94a3b8" }}
                  >
                    {s.responsive ? "Responded to command" : "No response"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!manifest ? <p className="py-6 text-2xs text-ink-3">Loading cohort…</p> : null}
      </div>
    </section>
  );
}

/** The destination. */
function LaunchPlatform({ frame }: { frame: DiveFrame }) {
  return (
    <section className="mx-auto max-w-5xl px-6 pb-24">
      <div className="panel px-6 py-10 text-center md:px-10 md:py-14">
        {/* The dive ends with the cortex scrolled away, so the destination gets
            its own still of it — same mesh, same shading path, fixed yaw. */}
        {frame.topo && frame.electrodes ? (
          <BrainThumb
            electrodes={frame.electrodes}
            topo={frame.topo}
            className="mx-auto -mt-2 mb-4 aspect-square w-full max-w-[220px]"
          />
        ) : null}
        <span className="status text-ink-3">The workspace</span>
        <h2 className="mx-auto mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-ink">
          There is no number for connected consciousness. We are proposing there should be.
        </h2>

        <Link
          href="/monitor/"
          className="mt-8 inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-3.5 text-sm font-semibold text-white shadow-card transition-colors hover:bg-accent-text"
        >
          Launch telemetry workspace →
        </Link>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          <Link href="/monitor/#compare" className="text-2xs font-semibold text-accent-text hover:underline">
            Money plot comparison
          </Link>
          <Link href="/monitor/#manual" className="text-2xs font-semibold text-accent-text hover:underline">
            Intervention sandbox
          </Link>
          <Link href="/cases/" className="text-2xs font-semibold text-accent-text hover:underline">
            Browse all cases
          </Link>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-2 border-t border-rule pt-8">
          {/* "SDP data" would overclaim: the math is real, the EEG under it is
              not. One word keeps the tag honest without weakening it. */}
          <HonestyTag kind="real" label="SDP math" />
          <HonestyTag kind="synthetic" label="Waveforms" />
          <HonestyTag kind="projection" label="Cortical heatmap" />
          <HonestyTag kind="absent" label="Coupling index" />
        </div>
        <p className="mx-auto mt-4 max-w-2xl text-2xs leading-relaxed text-ink-3">
          Replaying synthetic EEG with real SDP math, in the Chennu et al. 2016 file
          contract (n=20, propofol sedation). SDP is a spectral proxy, not BIS. The
          cortical surface is a scalp projection, not source localization.
        </p>
      </div>
    </section>
  );
}

function HonestyTag({
  kind,
  label,
}: {
  kind: "real" | "synthetic" | "projection" | "absent";
  label: string;
}) {
  const style = {
    real: { bg: "var(--accent-wash)", fg: "var(--accent-text)", word: "Real" },
    synthetic: { bg: "var(--well)", fg: "var(--ink-2)", word: "Synthetic" },
    projection: { bg: "var(--well)", fg: "var(--ink-2)", word: "Projection" },
    absent: { bg: "var(--alert-wash)", fg: "var(--alert-text)", word: "Not measured" },
  }[kind];

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5"
      style={{ background: style.bg }}
    >
      <span className="status" style={{ color: style.fg }}>
        {style.word}
      </span>
      <span className="text-2xs font-medium" style={{ color: style.fg }}>
        {label}
      </span>
    </span>
  );
}
