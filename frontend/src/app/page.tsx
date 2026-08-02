"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "framer-motion";
import {
  DeepDiveCanvas,
  DIVE_FALLBACK_SPAN,
  type DiveFrame,
} from "@/components/landing/DeepDiveCanvas";
import { loadManifest, loadSubject } from "@/lib/dataset";
import type { Manifest, SubjectBundle } from "@/lib/types";
import { MONEY_PAIR } from "@/state/monitor";
import { THEME } from "@/lib/theme";

/**
 * The front page: one scroll, macro to micro, dark to clinical light.
 *
 * Three rules hold the whole thing together.
 *
 * First, scroll progress never enters React state. A rAF-throttled listener
 * writes MotionValues; the background comes off one through `useTransform`
 * (composited, no re-render), the camera reads a plain ref inside the r3f
 * loop, and the dock transform is written straight to MotionValues in the same
 * pass. A `useState` on scroll would re-render a 20,000-vertex scene on every
 * wheel tick.
 *
 * Second, the story cards carry an opaque plate and fixed deep-slate ink. An
 * earlier version had no chrome at all and crossfaded the ink dark-to-light on
 * the same window as the background, on the theory that contrast was then
 * guaranteed by construction. It is not: two colors crossfading across the
 * same window are both mid-gray at the midpoint, which is exactly where the
 * comparison card sits, and the copy washed out to near-invisible. Ink and
 * ground are now decided independently — the plate is always light, the ink is
 * always #0F172A/#1E293B — so legibility no longer depends on where the reader
 * stopped scrolling.
 *
 * Third, the dive and its destination are one composition. The launch card is
 * a beat inside the pinned stage, not a section below it, and the cortex
 * scales down and glides into the slot at the card's head rather than sliding
 * off the top of the viewport while the card arrives underneath. The dock
 * transform is measured from the live slot (see `measureDock`) instead of
 * hardcoded, so it survives a font swap or a resize.
 *
 * The launch CTA runs an exit sequence: it signals the r3f loop through a ref
 * (camera pushes into the mesh) while an iris clip closes over the page, then
 * routes to the workspace. Reduced-motion users skip the theater and just
 * navigate.
 */

// One source of truth with the monitor — see MONEY_PAIR. S05 vs S03.
const PAIR_SUBJECTS = { left: MONEY_PAIR.nonResponder, right: MONEY_PAIR.responder } as const;

// The exact provenance wording. Not restyled, not reworded.
const HONESTY = [
  { text: "Real · SDP math", bg: THEME.accentWash, fg: THEME.accentText },
  { text: "SYNTHETIC: Waveforms", bg: THEME.well, fg: THEME.ink2 },
  { text: "PROJECTION: Cortical Scalp Field", bg: THEME.well, fg: THEME.ink2 },
] as const;

/**
 * Story-card ink. Fixed, not scroll-driven — see the note above about why
 * crossfading these was the readability bug rather than the design.
 * `accent` and `alert` are the darker `-text` steps from the token set,
 * because these are small type and need 4.5:1 rather than the 3:1 the mark
 * colors clear.
 */
const INK = {
  strong: "#0F172A",
  body: "#1E293B",
  quiet: "#475569",
  accent: THEME.accentText,
  alert: THEME.alertText,
  alertMark: THEME.alert,
} as const;

/**
 * The end of the dive, as four ordered windows.
 *
 * The order is the whole collision fix, so it is worth stating plainly. The
 * cortex has to be *above* the launch card to be visible in the slot at all —
 * the card is an opaque `.panel` and paints over anything behind it. But a
 * full-size cortex above an opaque card is exactly the reported bug: it sits
 * across the heading. So the cortex finishes docking (DOCK_TO) before the card
 * starts appearing (CARD_FROM). At every scroll position, either the card is
 * not there yet and the cortex is free to be large, or the cortex is already
 * slot-sized and clipped to the slot. There is no position where a large
 * cortex and visible card text coexist.
 *
 * Story card 03 finishes at 0.85, which is what sets the floor here: the
 * cortex is only promoted above the page content once nothing else is on it.
 */
const DOCK_FROM = 0.86;
const DOCK_TO = 0.945;
const CARD_FROM = 0.945;
const CARD_TO = 0.99;

/** Diameter of the slot the cortex docks into, in px. */
const SLOT_PX = 132;

/**
 * How much of the slot the cortex fills once docked. The remainder is the
 * breathing room between the mesh's silhouette and the slot's ring — without
 * it the cortex reads as jammed into the well rather than seated in it.
 */
const SLOT_FIT = 0.9;

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export default function Page() {
  const router = useRouter();
  const trackRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const launchRef = useRef(0);
  const launchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduced = useReducedMotion() ?? false;

  const [launching, setLaunching] = useState(false);
  const scrollYProgress = useMotionValue(0);

  // Where the cortex has to end up, in stage-local px. Measured rather than
  // assumed; see measureDock.
  const dock = useRef({ x: 0, y: 0, scale: 0.24, openR: 4000, dockedR: 4000 });
  const dockX = useMotionValue(0);
  const dockY = useMotionValue(0);
  const dockScale = useMotionValue(1);
  const dockClip = useMotionValue("none");

  // The cortex's settled on-screen span, reported by the canvas once the mesh
  // is available. A ref, not state — this must not re-render the scene.
  const spanRef = useRef(DIVE_FALLBACK_SPAN);

  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [pair, setPair] = useState<{ left: SubjectBundle; right: SubjectBundle } | null>(null);

  /**
   * Measure the offset from the stage's center to the slot's center, the scale
   * that seats the cortex in the slot, and the clip that keeps it there.
   *
   * The canvas wrapper is the full stage and the camera looks at the origin,
   * so the cortex is centered in it and scaling about the wrapper's center
   * scales the cortex about its own. That reduces the whole dock to one
   * translate plus one scale, both composited.
   *
   * The clip is the guarantee rather than the decoration. `clip-path` is
   * resolved in the element's own coordinates and *then* transformed, so a
   * circle centered on the wrapper stays centered on the cortex through the
   * translate and scales with it. Interpolating its local radius from "larger
   * than the stage" to `slotRadius / dockScale` means its on-screen radius
   * lands exactly on the slot: whatever the mesh does, the canvas cannot paint
   * outside that circle, so it cannot reach the heading, the CTA, the chips or
   * the footnote.
   *
   * The span comes from the geometry via `onDockGeometry`, not from a constant
   * — see `settledSpan` in DeepDiveCanvas for why assuming it was the bug.
   */
  const measureDock = useCallback(() => {
    const stage = stageRef.current;
    const slot = slotRef.current;
    if (!stage || !slot) return;

    const s = stage.getBoundingClientRect();
    const m = slot.getBoundingClientRect();
    if (!s.height || !m.width) return;

    // On-screen diameter of the cortex at the track's settled camera distance.
    const cortexPx = spanRef.current * s.height;
    const scale = Math.min(0.6, Math.max(0.05, (m.width * SLOT_FIT) / cortexPx));

    dock.current = {
      x: m.left + m.width / 2 - (s.left + s.width / 2),
      y: m.top + m.height / 2 - (s.top + s.height / 2),
      scale,
      // Wide enough to clip nothing during the dive, where the camera pushes
      // in to 2.05 radii and the cortex is far larger than it is at settle.
      openR: Math.hypot(s.width, s.height),
      dockedR: m.width / 2 / scale,
    };
  }, []);

  // Written straight to the ref and re-measured; deliberately not state.
  const handleDockGeometry = useCallback(
    (span: number) => {
      if (!Number.isFinite(span) || span <= 0) return;
      spanRef.current = span;
      measureDock();
    },
    [measureDock],
  );

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

      // The dock rides the same pass rather than its own subscription, so the
      // transform and the camera can never be a frame out of step.
      const t = smoothstep(DOCK_FROM, DOCK_TO, p);
      const target = dock.current;
      dockX.set(target.x * t);
      dockY.set(target.y * t);
      dockScale.set(1 + (target.scale - 1) * t);
      dockClip.set(
        t <= 0
          ? "none"
          : `circle(${target.openR + (target.dockedR - target.openR) * t}px at 50% 50%)`,
      );
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const onResize = () => {
      measureDock();
      onScroll();
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(frame);
    };
  }, [scrollYProgress, dockX, dockY, dockScale, dockClip, measureDock]);

  // Re-measure after anything that can reflow the card and move the slot: the
  // data landing, and the web font swapping in under the headline. Without the
  // font hook the target is measured against the fallback's line count and the
  // cortex docks a line-height off center.
  useEffect(() => {
    measureDock();
    if (typeof document === "undefined" || !document.fonts) return;
    let live = true;
    document.fonts.ready.then(() => {
      if (live) measureDock();
    });
    return () => {
      live = false;
    };
  }, [measureDock, manifest, pair]);

  useEffect(
    () => () => {
      if (launchTimer.current) clearTimeout(launchTimer.current);
    },
    [],
  );

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

  // The exit sequence: camera push (via ref, read in the r3f loop) plus an
  // iris close (composited clip-path), then the route change.
  const beginLaunch = (e: MouseEvent) => {
    e.preventDefault();
    if (launching) return;
    if (reduced) {
      router.push("/monitor/");
      return;
    }
    setLaunching(true);
    launchRef.current = 1;
    launchTimer.current = setTimeout(() => router.push("/monitor/"), 880);
  };

  // Dark to clinical light, across the middle of the dive.
  const pageBg = useTransform(scrollYProgress, [0.42, 0.74], ["#0b1220", "#f1f5f9"]);

  const heroOpacity = useTransform(scrollYProgress, [0, 0.07], [1, 0]);
  const card1 = useTransform(scrollYProgress, [0.13, 0.2, 0.31, 0.36], [0, 1, 1, 0]);
  const card2 = useTransform(scrollYProgress, [0.38, 0.44, 0.56, 0.6], [0, 1, 1, 0]);
  const card3 = useTransform(scrollYProgress, [0.63, 0.69, 0.8, 0.85], [0, 1, 1, 0]);

  // The card assembles around an already-seated cortex, rather than arriving
  // underneath a cortex that is still on its way. See the window constants.
  const launchOpacity = useTransform(scrollYProgress, [CARD_FROM, CARD_TO], [0, 1]);
  const launchRise = useTransform(scrollYProgress, [CARD_FROM, CARD_TO], [22, 0]);
  const launchPointer = useTransform(scrollYProgress, (p) =>
    p > CARD_FROM + 0.01 ? "auto" : "none",
  );

  /**
   * The cortex is promoted above the page content for the dock and only for
   * the dock. It has to be above the card to be visible in the slot at all,
   * and it must not be above story card 03, which is still fading out at 0.85.
   * A step rather than an interpolation because z-index has no meaningful
   * in-between; the step lands in the gap between the two.
   */
  const canvasZ = useTransform(scrollYProgress, (p) => (p >= DOCK_FROM ? 30 : 0));

  return (
    <motion.div style={{ background: pageBg }} className="relative">
      {/* Scroll track. The stage inside is pinned for its whole length; the
          height is what gives the dive its pacing, and the last stretch is the
          dock plus the launch card. */}
      <div ref={trackRef} className="relative h-[640vh]">
        <div ref={stageRef} className="sticky top-0 h-screen overflow-hidden">
          {/* Two nested transforms that compose: the inner one is the
              scroll-driven dock, the outer is the launch bloom. Keeping them
              on separate elements means neither has to know about the other. */}
          {/* pointer-events-none is load-bearing, not tidiness: once the
              cortex is promoted to z-30 for the dock, a full-stage canvas
              would otherwise sit over the card and swallow the CTA's clicks. */}
          <motion.div
            className="pointer-events-none absolute inset-0"
            style={{ zIndex: canvasZ }}
            animate={launching ? { scale: 1.18, opacity: 0 } : { scale: 1, opacity: 1 }}
            transition={{ duration: 0.8, ease: [0.72, 0, 0.28, 1] }}
          >
            <motion.div
              className="h-full w-full"
              style={{ x: dockX, y: dockY, scale: dockScale, clipPath: dockClip }}
            >
              <DeepDiveCanvas
                frame={frame}
                progressRef={progressRef}
                launchRef={launchRef}
                reducedMotion={reduced}
                onDockGeometry={handleDockGeometry}
              />
            </motion.div>
          </motion.div>

          {/* Hero scrim — a viewport-wide gradient, not a box, so it rides
              the blend instead of fighting it. */}
          <motion.div
            style={{ opacity: heroOpacity }}
            className="pointer-events-none absolute inset-x-0 top-0 h-[62vh] bg-gradient-to-b from-[#0b1220] via-[#0b1220]/85 to-transparent"
          />
          <motion.div
            style={{ opacity: heroOpacity }}
            className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center px-6 pt-[12vh] text-center"
          >
            <span className="status text-[#7f9bc4]">Probe · depth of anesthesia</span>
            <h1 className="mt-5 max-w-2xl text-[clamp(2.1rem,5vw,3.6rem)] font-semibold leading-[1.05] tracking-tight text-[#e8eef6]">
              Inside the Anesthetized Mind.
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-relaxed text-[#a8bad4]">
              The monitor in every operating room measures whether the brain is talking to
              itself. We measure whether it is still listening to the room.
            </p>
            <div className="pointer-events-auto mt-8">
              <ActionButton href="/monitor/" onClick={beginLaunch}>
                Launch telemetry workspace
              </ActionButton>
            </div>
          </motion.div>

          <motion.div
            style={{ opacity: heroOpacity }}
            className="pointer-events-none absolute inset-x-0 bottom-10 flex flex-col items-center gap-2"
          >
            <span className="status text-[#7f9bc4]">Scroll to probe</span>
            <ScrollPulse reduced={reduced} />
          </motion.div>

          {/* Pinned story cards. */}
          <StoryCard opacity={card1} align="left">
            <CardMetrics progress={scrollYProgress} />
          </StoryCard>

          <StoryCard opacity={card2} align="center">
            <CardComparison manifest={manifest} />
          </StoryCard>

          <StoryCard opacity={card3} align="right">
            <CardSandbox />
          </StoryCard>

          {/* The destination, as the dive's last beat rather than a section
              below it. */}
          <motion.div
            style={{ opacity: launchOpacity, pointerEvents: launchPointer }}
            className="absolute inset-0 z-20 flex justify-center overflow-y-auto px-4 py-6"
          >
            {/* my-auto rather than items-center: a flex item centered by
                alignment gets its overflow clipped on the *start* edge, so on
                a short viewport the card's head — the slot the cortex docks
                into — would be the part that goes unreachable. */}
            <LaunchPlatform slotRef={slotRef} rise={launchRise} onLaunch={beginLaunch} />
          </motion.div>
        </div>
      </div>

      {/* Iris close — the last thing before the route change. */}
      <motion.div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-50"
        style={{ background: "var(--canvas)" }}
        initial={{ clipPath: "circle(0% at 50% 50%)" }}
        animate={{
          clipPath: launching ? "circle(142% at 50% 50%)" : "circle(0% at 50% 50%)",
        }}
        transition={{ duration: 0.85, ease: [0.72, 0, 0.28, 1] }}
      />
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Chrome                                                              */
/* ------------------------------------------------------------------ */

function ScrollPulse({ reduced }: { reduced: boolean }) {
  return (
    <motion.span
      className="block h-8 w-[1.5px] origin-top rounded-full bg-gradient-to-b from-[#7f9bc4] to-transparent"
      animate={reduced ? undefined : { scaleY: [0.4, 1, 0.4], opacity: [0.35, 1, 0.35] }}
      transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* The CTA                                                             */
/* ------------------------------------------------------------------ */

const CTA_SPRING = { type: "spring", stiffness: 380, damping: 26 } as const;

/**
 * The launch CTA.
 *
 * Every moving part is a transform or an opacity, so hovering it costs the
 * compositor and nothing else — which matters because it is hovered while a
 * 20,000-vertex scene is rendering behind it. Nothing here animates width,
 * background-position, or box-shadow.
 *
 * It has to hold up on both grounds the page has: the near-black hero and the
 * white launch card. A solid blue face with a light rim reads as raised on
 * both; the bloom behind it does the work that a border alone can't on the
 * dark end.
 */
function ActionButton({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick?: (e: MouseEvent) => void;
  children: ReactNode;
}) {
  const reduced = useReducedMotion() ?? false;

  return (
    <motion.span
      initial="rest"
      animate="rest"
      whileHover={reduced ? undefined : "hover"}
      whileTap={reduced ? undefined : { scale: 0.978 }}
      transition={CTA_SPRING}
      className="relative isolate inline-flex"
    >
      {/* Ambient bloom, behind everything. Reads as the control being live
          rather than as a drop shadow. */}
      <motion.span
        aria-hidden
        variants={{
          rest: { opacity: 0.3, scale: 0.88 },
          hover: { opacity: 0.8, scale: 1.06 },
        }}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
        className="pointer-events-none absolute -inset-4 -z-10 rounded-full blur-2xl"
        style={{
          background:
            "radial-gradient(closest-side, rgba(42,120,214,0.8), rgba(42,120,214,0) 72%)",
        }}
      />

      {/* Hairline gradient rim. A 1px padded wrapper is the only way to get a
          gradient border that follows a fully rounded radius. */}
      <motion.span
        variants={{ rest: { scale: 1 }, hover: { scale: 1.025 } }}
        transition={CTA_SPRING}
        className="relative rounded-full p-px"
        style={{
          background:
            "linear-gradient(150deg, rgba(255,255,255,0.75), rgba(255,255,255,0.08) 48%, rgba(255,255,255,0.5))",
        }}
      >
        <Link
          href={href}
          onClick={onClick}
          className="relative flex items-center gap-3 overflow-hidden rounded-full px-6 py-3 text-[0.8125rem] font-semibold tracking-[0.015em] text-white"
          style={{
            background: "linear-gradient(168deg, #3F8BEA 0%, #2A78D6 44%, #1B5FB0 100%)",
            boxShadow:
              "0 12px 26px -14px rgba(2,6,18,0.9), inset 0 1px 0 rgba(255,255,255,0.3)",
          }}
        >
          {/* Sheen sweep. Skewed and overwide so the leading edge clears the
              radius before the trailing edge enters it. */}
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
            }}
            variants={{
              rest: { x: "0%", opacity: 0 },
              hover: { x: "460%", opacity: 1 },
            }}
            transition={{ duration: 0.9, ease: [0.33, 1, 0.68, 1] }}
          />

          <TelemetryDot reduced={reduced} />
          <span className="relative">{children}</span>
          <ArrowTrack />
        </Link>
      </motion.span>
    </motion.span>
  );
}

/** A live-signal tell on the button face. */
function TelemetryDot({ reduced }: { reduced: boolean }) {
  return (
    <span aria-hidden className="relative flex h-1.5 w-1.5 shrink-0">
      <span className="absolute inset-0 rounded-full bg-white" />
      {reduced ? null : (
        <motion.span
          className="absolute -inset-1 rounded-full border border-white"
          animate={{ scale: [0.6, 1.6], opacity: [0.75, 0] }}
          transition={{ duration: 2.1, repeat: Infinity, ease: "easeOut" }}
        />
      )}
    </span>
  );
}

/** A rule that extends into a chevron on hover. scaleX, never width. */
function ArrowTrack() {
  return (
    <span aria-hidden className="relative flex shrink-0 items-center gap-[3px]">
      <motion.span
        className="block h-px w-4 origin-left rounded-full bg-white"
        variants={{ rest: { scaleX: 0.3, opacity: 0.55 }, hover: { scaleX: 1, opacity: 1 } }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.svg
        width="7"
        height="9"
        viewBox="0 0 7 9"
        fill="none"
        variants={{ rest: { x: 0, opacity: 0.75 }, hover: { x: 2, opacity: 1 } }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      >
        <path
          d="M1 1l4.5 3.5L1 8"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </motion.svg>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Story cards                                                         */
/* ------------------------------------------------------------------ */

/**
 * The plate every story card sits on.
 *
 * Near-opaque rather than a tint: the card has to be legible over near-black
 * tissue at the top of the dive and over #f1f5f9 at the bottom, and only an
 * opaque ground makes the ink's contrast independent of what is behind it. The
 * remaining 6% and the blur are what stop it reading as a cutout — the cortex
 * still moves faintly under the edges.
 */
const PLATE: React.CSSProperties = {
  background: "rgba(255,255,255,0.94)",
  border: "1px solid rgba(15,23,42,0.10)",
  boxShadow:
    "inset 0 1px 0 rgba(255,255,255,0.9), 0 24px 60px -26px rgba(2,6,18,0.8), 0 2px 8px -4px rgba(15,23,42,0.18)",
};

function StoryCard({
  opacity,
  align,
  children,
}: {
  opacity: MotionValue<number>;
  align: "left" | "center" | "right";
  children: ReactNode;
}) {
  const position =
    align === "left"
      ? "md:left-[6vw] md:right-auto md:w-[26rem]"
      : align === "right"
        ? "md:right-[6vw] md:left-auto md:w-[26rem]"
        : "md:left-1/2 md:right-auto md:w-[34rem] md:-translate-x-1/2";

  return (
    <motion.div
      style={{ opacity }}
      className={`pointer-events-none absolute inset-x-4 bottom-[8vh] md:inset-x-auto md:top-1/2 md:bottom-auto md:-translate-y-1/2 ${position}`}
    >
      <div
        className="rounded-xl px-5 py-5 backdrop-blur-xl"
        style={{ ...PLATE, color: INK.strong }}
      >
        {children}
      </div>
    </motion.div>
  );
}

/** Card 1 — the two numbers the monitor actually reports. */
function CardMetrics({ progress }: { progress: MotionValue<number> }) {
  // Counters wound by scroll position rather than a timer, so they respond to
  // the reader's own pace and land on the same value every time.
  const sdp = useTransform(progress, [0.15, 0.34], [92, 37]);
  const alpha = useTransform(progress, [0.15, 0.34], [0.81, 0.29]);

  return (
    <>
      <span className="status" style={{ color: INK.accent }}>
        01 · The metrics
      </span>
      <h2 className="mt-2 text-xl font-semibold tracking-tight" style={{ color: INK.strong }}>
        One number, computed from the rhythm.
      </h2>
      <p className="mt-2 text-2xs leading-relaxed" style={{ color: INK.body }}>
        SDP is a spectral depth proxy — log alpha over delta, anchored to this patient&apos;s
        own awake baseline. It is what today&apos;s monitors compute.
      </p>

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
  useMotionValueEventSafe(value, (v) => setShown(v.toFixed(digits)));
  useEffect(() => {
    setShown(value.get().toFixed(digits));
  }, [value, digits]);

  return (
    <div
      className="rounded-lg px-3 py-2.5"
      style={{ background: THEME.well, border: `1px solid ${THEME.rule}` }}
    >
      <span className="label" style={{ color: INK.quiet }}>
        {label}
      </span>
      <p className="metric-hero mt-1 text-3xl" style={{ color: INK.strong }}>
        {shown}
      </p>
    </div>
  );
}

// Thin wrapper so the subscription API reads the same at every call site.
function useMotionValueEventSafe(value: MotionValue<number>, cb: (v: number) => void) {
  useEffect(() => value.on("change", cb), [value, cb]);
}

/** A looping reconstructed-trace placeholder — decorative, and labeled as such. */
function WaveStrip() {
  return (
    <div className="mt-4">
      <svg viewBox="0 0 240 34" className="h-9 w-full" aria-hidden>
        <motion.path
          d="M0 17 Q 10 4 20 17 T 40 17 T 60 17 T 80 17 T 100 17 T 120 17 T 140 17 T 160 17 T 180 17 T 200 17 T 220 17 T 240 17"
          fill="none"
          stroke={THEME.accent}
          strokeWidth="1.5"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />
      </svg>
      <p className="text-2xs" style={{ color: INK.quiet }}>
        Reconstructed trace — illustrative
      </p>
    </div>
  );
}

/** Card 2 — the money plot, in one sentence. */
function CardComparison({ manifest }: { manifest: Manifest | null }) {
  const stat = (id: string) =>
    manifest?.subjects.find((s) => s.subject === id)?.conditions.moderate.median;

  return (
    <>
      <span className="status" style={{ color: INK.accent }}>
        02 · The comparison
      </span>
      <h2 className="mt-2 text-xl font-semibold tracking-tight" style={{ color: INK.strong }}>
        Same drug. Same number. Opposite patients.
      </h2>
      <p className="mt-2 text-2xs leading-relaxed" style={{ color: INK.body }}>
        Both at 1.2 µg/mL propofol. One was answering questions. Nothing in the spectrum
        separates them.
      </p>

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
  const alert = tone === "alert";
  return (
    <div
      className="rounded-lg px-3 py-2.5"
      style={{
        background: alert ? THEME.alertWash : THEME.well,
        border: `1px solid ${alert ? INK.alertMark : THEME.rule}`,
      }}
    >
      <span className="metric text-2xs" style={{ color: INK.quiet }}>
        {subject}
      </span>
      <p className="metric-hero mt-0.5 text-3xl" style={{ color: INK.strong }}>
        {sdp?.toFixed(0) ?? "—"}
      </p>
      <p
        className="mt-1.5 text-2xs font-semibold"
        style={{ color: alert ? INK.alert : INK.body }}
      >
        {tag}
      </p>
    </div>
  );
}

/** Card 3 — the sandbox, with the warning it requires. */
function CardSandbox() {
  return (
    <>
      <span className="status" style={{ color: INK.accent }}>
        03 · The sandbox
      </span>
      <h2 className="mt-2 text-xl font-semibold tracking-tight" style={{ color: INK.strong }}>
        Push the index and watch it lie.
      </h2>
      <p className="mt-2 text-2xs leading-relaxed" style={{ color: INK.body }}>
        Aim a simulated beam at the thalamus and drive delta. The index falls — not because
        anything happened to consciousness, but because delta sits in its denominator.
      </p>

      <div
        className="mt-4 flex items-baseline gap-2.5 rounded-lg px-3 py-2.5"
        style={{ background: THEME.alertWash, border: `1px solid ${INK.alertMark}` }}
      >
        <span className="status shrink-0" style={{ color: INK.alert }}>
          Simulation
        </span>
        <span className="text-2xs leading-relaxed" style={{ color: INK.alert }}>
          No such device exists and no intervention was recorded.
        </span>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Destination                                                         */
/* ------------------------------------------------------------------ */

/**
 * The final beat, inside the pinned stage.
 *
 * The circular slot at the head is deliberately empty: it is the landing pad
 * the live cortex docks into, not a placeholder for a second render of it.
 * That is why the card frame itself carries no transform — `measureDock` reads
 * the slot's rect straight off the layout, so anything animating the frame
 * would move the target out from under the animation. The entrance motion
 * therefore lives on the text block below the slot instead.
 */
function LaunchPlatform({
  slotRef,
  rise,
  onLaunch,
}: {
  slotRef: React.RefObject<HTMLDivElement | null>;
  rise: MotionValue<number>;
  onLaunch: (e: MouseEvent) => void;
}) {
  return (
    <div className="panel my-auto h-fit w-full max-w-2xl px-6 py-8 text-center md:px-10 md:py-10">
      {/* Landing pad for the cortex, which docks on top of it. Sized in px
          because the dock scale and clip are both computed from its measured
          width — a percentage or a rem here would silently retune the dock.
          It sits outside the `rise` wrapper below on purpose: anything that
          transformed the slot would move the target out from under the
          animation aiming at it. */}
      <div
        ref={slotRef}
        aria-hidden
        className="relative mx-auto rounded-full"
        style={{
          width: SLOT_PX,
          height: SLOT_PX,
          background:
            "radial-gradient(closest-side, rgba(42,120,214,0.12), rgba(42,120,214,0.03) 62%, rgba(42,120,214,0) 78%)",
          boxShadow:
            "inset 0 0 0 1px rgba(15,23,42,0.07), inset 0 2px 10px -4px rgba(15,23,42,0.16)",
        }}
      />

      {/* mt-6 is the gap the cortex is guaranteed never to cross: the clip
          stops at the slot's edge, and the eyebrow starts below that. */}
      <motion.div className="mt-6" style={{ y: rise }}>
        <span className="status text-ink-3">The workspace</span>
        <h2 className="mx-auto mt-3 max-w-xl text-[clamp(1.35rem,2.6vw,1.9rem)] font-semibold leading-tight tracking-tight text-ink">
          There is no number for connected consciousness. We are proposing there should be.
        </h2>

        <div className="mt-7">
          <ActionButton href="/monitor/" onClick={onLaunch}>
            Launch telemetry workspace
          </ActionButton>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-2 border-t border-rule pt-6">
          {HONESTY.map((h) => (
            <HonestyChip key={h.text} {...h} />
          ))}
        </div>
        <p className="mx-auto mt-4 max-w-2xl text-2xs leading-relaxed text-ink-3">
          Replaying synthetic EEG with real SDP math, in the Chennu et al. 2016 file
          contract (n=20, propofol sedation). SDP is a spectral proxy, not BIS. The
          cortical surface is a scalp projection, not source localization.
        </p>
      </motion.div>
    </div>
  );
}

/** The exact tag strings, verbatim — no uppercase transform, no rewording. */
function HonestyChip({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-full px-3 py-1.5 text-[0.625rem] font-semibold tracking-[0.04em]"
      style={{ background: bg, color: fg }}
    >
      {text}
    </span>
  );
}
