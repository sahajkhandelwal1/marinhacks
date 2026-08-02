"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, Volume2, VolumeX } from "lucide-react";
import { BrainViz3D } from "@/components/BrainViz3D";
import { EEGTraceCanvas } from "@/components/EEGTraceCanvas";
import { MetricReadout } from "@/components/MetricReadout";
import { SimulatedNetworkCanvas } from "@/components/SimulatedNetworkCanvas";
import { useSimulatedNetwork } from "@/hooks/useSimulatedNetwork";
import { useVigilData } from "@/hooks/useVigilData";
import { cn } from "@/lib/utils";

const CARD_SHELL =
  "rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-panel)] backdrop-blur-md shadow-[0_20px_60px_-25px_rgba(0,0,0,0.7)] transition-colors duration-300";

function MonitorView() {
  const searchParams = useSearchParams();
  const subject = searchParams.get("subject") ?? "S00_moderate";

  const {
    data,
    isLoading,
    error,
    currentFrame,
    currentFrameIndex,
    setFrameIndex,
    isPlaying,
    togglePlay,
  } = useVigilData(subject);

  const [isMuted, setIsMuted] = useState(true);

  const sdp = currentFrame?.sdp ?? null;
  const ci = currentFrame?.ci ?? null;

  // Simulated network panel: depth is derived from the real, currently
  // playing SDP value (0 = awake/desynchronized, 1 = deep/synchronized),
  // so the illustrative panel tracks the actual demo instead of running on
  // its own independent clock.
  const { pickBucket, error: simError } = useSimulatedNetwork();
  const networkDepth = sdp === null ? 0.5 : Math.min(1, Math.max(0, 1 - sdp / 100));
  const networkBucket = pickBucket(networkDepth);

  const sdpStatus = sdp === null ? undefined : sdp < 50 ? "UNCONSCIOUS" : "AWAKE";
  const sdpTone = sdp === null ? "emerald" : sdp < 50 ? "amber" : "emerald";

  const showDisagreement = sdp !== null && ci !== null && sdp < 50 && ci > 0.5;
  const ciStatus = showDisagreement
    ? "CONNECTED (DISAGREEMENT)"
    : ci !== null
      ? "CONNECTED"
      : undefined;
  const ciTone = showDisagreement ? "amber" : "emerald";

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-void)] font-mono text-sm tracking-[0.2em] text-[var(--accent-cyan)]">
        INITIALIZING VIGIL...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-void)] font-mono text-sm tracking-[0.2em] text-[var(--accent-amber)]">
        TELEMETRY ERROR: {error?.message ?? "UNKNOWN"}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-void)] p-4 text-[var(--text-primary)] md:p-6">
      {/* Header */}
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-5">
          <h1 className="font-mono text-3xl font-semibold tracking-tight text-[var(--text-primary)] [text-shadow:0_0_28px_rgba(6,182,212,0.35)]">
            VIGIL
          </h1>
          <div className="flex items-center gap-2 font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--accent-cyan)] shadow-[0_0_8px_var(--accent-cyan)]" />
            REPLAY CHENNU N=20
            <span className="text-[var(--text-muted-a50)]">·</span>
            SUBJECT {subject.toUpperCase()}
          </div>
        </div>

        <div className="flex items-center gap-3">
        <Link
          href="/"
          className="flex items-center gap-1.5 rounded-full border border-[var(--border-hairline)] px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] text-[var(--text-muted)] transition-colors duration-200 hover:border-[var(--accent-cyan-a40)] hover:text-[var(--accent-cyan)]"
        >
          <ArrowLeft className="h-3 w-3" />
          CASES
        </Link>
        <button
          type="button"
          onClick={() => setIsMuted((m) => !m)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-hairline)] bg-[var(--bg-panel)] text-[var(--text-muted)] transition-colors duration-200 hover:border-[var(--accent-cyan-a40)] hover:text-[var(--accent-cyan)]"
          aria-label={isMuted ? "Unmute audio" : "Mute audio"}
        >
          {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
        </div>
      </header>

      {/* Dashboard grid */}
      <main className="grid flex-1 grid-cols-1 items-start gap-5 lg:grid-cols-[1.3fr_1fr]">
        {/* Topomap card */}
        <section className={cn(CARD_SHELL, "p-6")}>
          <BrainViz3D
            electrodes={data.electrodes}
            topo={currentFrame?.topo ?? []}
            alert={showDisagreement}
            className="mx-auto aspect-square w-full max-h-[560px]"
          />
        </section>

        {/* Right column: dual telemetry + disagreement banner */}
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-5">
            <MetricReadout
              title="SDP"
              subtitle="INTRINSIC RHYTHM"
              value={sdp}
              unit="UNITS"
              status={sdpStatus}
              statusTone={sdpTone}
              range={{ min: 0, max: 100, minLabel: "0 DEEP", maxLabel: "100 AWAKE" }}
            />
            <MetricReadout
              title="CI"
              subtitle="AMBIENT COUPLING"
              value={ci}
              unit="INDEX"
              fallback={{
                label: "[ NOT MEASURED ]",
                sublabel: "NO AMBIENT AUDIO PIPELINE",
              }}
              status={ciStatus}
              statusTone={ciTone}
              isAmber={ci === null || showDisagreement}
              range={{ min: 0, max: 1, minLabel: "0 UNCOUPLED", maxLabel: "1 COUPLED" }}
            />
          </div>

          {showDisagreement && (
            <div className="flex items-center justify-center gap-2 rounded-full border border-[var(--accent-amber-a40)] bg-[var(--accent-amber-a10)] px-4 py-2 font-mono text-xs tracking-[0.1em] text-[var(--accent-amber)] shadow-[0_0_24px_-6px_var(--accent-amber)] transition-colors duration-300">
              <AlertTriangle className="h-3.5 w-3.5" />
              SDP AND CI DISAGREE — REVIEW MANUALLY
            </div>
          )}
        </div>

        {/* EEG trace oscilloscope card (full width) */}
        <section
          className={cn(
            CARD_SHELL,
            "p-4 lg:col-span-2",
            showDisagreement &&
              "border-[var(--border-alert)] shadow-[0_0_40px_-10px_rgba(245,158,11,0.35)]"
          )}
        >
          <EEGTraceCanvas
            frames={data.frames}
            electrodes={data.electrodes}
            upToIndex={currentFrameIndex}
            sdp={sdp}
            alert={showDisagreement}
            className="h-56 w-full md:h-64"
          />
        </section>

        {/* Simulated cortical network (illustrative, not patient data) */}
        <section className={cn(CARD_SHELL, "p-4 lg:col-span-2")}>
          {networkBucket ? (
            <SimulatedNetworkCanvas
              spikes={networkBucket.spikes}
              populationRateHz={networkBucket.population_rate_hz}
              nNeurons={networkBucket.n_neurons}
              durationS={networkBucket.duration_s}
              depth={networkDepth}
              className="h-40 w-full md:h-48"
            />
          ) : (
            <div className="flex h-40 items-center justify-center font-mono text-xs tracking-[0.15em] text-[var(--text-muted)] md:h-48">
              {simError ? `SIMULATION LOAD ERROR: ${simError.message}` : "LOADING SIMULATED NETWORK..."}
            </div>
          )}
        </section>
      </main>

      {/* Transport / scrubber */}
      <footer
        className={cn(CARD_SHELL, "mt-6 flex items-center gap-4 px-4 py-3")}
      >
        <button
          type="button"
          onClick={togglePlay}
          className="rounded-full border border-[var(--border-hairline)] px-4 py-1.5 font-mono text-[11px] tracking-[0.15em] text-[var(--text-primary)] transition-colors duration-200 hover:border-[var(--accent-cyan-a40)] hover:text-[var(--accent-cyan)]"
        >
          {isPlaying ? "PAUSE" : "PLAY"}
        </button>
        <span className="whitespace-nowrap font-mono text-xs tabular-nums text-[var(--text-muted)]">
          FRAME {String(currentFrameIndex).padStart(3, "0")} /{" "}
          {String(data.frames.length - 1).padStart(3, "0")}
        </span>
        <input
          type="range"
          min={0}
          max={data.frames.length - 1}
          value={currentFrameIndex}
          onChange={(e) => setFrameIndex(Number(e.target.value))}
          className="w-full accent-accent-cyan"
          aria-label="Frame scrubber"
        />
      </footer>
    </div>
  );
}

export default function MonitorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--bg-void)] font-mono text-sm tracking-[0.2em] text-[var(--accent-cyan)]">
          INITIALIZING VIGIL...
        </div>
      }
    >
      <MonitorView />
    </Suspense>
  );
}
