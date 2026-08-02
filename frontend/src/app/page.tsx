"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { BrainThumb } from "@/components/BrainThumb";
import type { Electrode } from "@/hooks/useVigilData";
import { cn } from "@/lib/utils";

type ExemplarCard = {
  subject: string;
  condition: string;
  kind: "AWAKE" | "SEDATED" | "AMBIGUOUS";
  caption: string;
  responsive: boolean;
  median_sdp: number;
  drug_concentration_ug_ml: number;
  topo: number[];
  electrodes: Electrode[];
};

const CARD_SHELL =
  "rounded-2xl border bg-[var(--bg-panel)] backdrop-blur-md shadow-[0_20px_60px_-25px_rgba(0,0,0,0.7)] transition-all duration-300";

const KIND_STYLE: Record<ExemplarCard["kind"], { label: string; cls: string; border: string }> = {
  AWAKE: {
    label: "AWAKE",
    cls: "border-[var(--accent-emerald-a30)] bg-[var(--accent-emerald-a10)] text-[var(--accent-emerald)]",
    border: "border-[var(--border-hairline)] hover:border-[var(--accent-emerald-a30)]",
  },
  SEDATED: {
    label: "SEDATED",
    cls: "border-[var(--accent-cyan-a40)] bg-[rgba(6,182,212,0.1)] text-[var(--accent-cyan)]",
    border: "border-[var(--border-hairline)] hover:border-[var(--accent-cyan-a40)]",
  },
  AMBIGUOUS: {
    label: "RESPONDED TO COMMAND",
    cls: "border-[var(--accent-amber-a40)] bg-[var(--accent-amber-a10)] text-[var(--accent-amber)]",
    border: "border-[var(--border-alert)] hover:border-[var(--accent-amber)]",
  },
};

export default function Home() {
  const [cards, setCards] = useState<ExemplarCard[] | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/data/exemplars.json")
      .then((r) => {
        if (!r.ok) throw new Error(`exemplars.json ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!cancelled) setCards(d.cards);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const clear = cards?.filter((c) => c.kind !== "AMBIGUOUS") ?? [];
  const ambiguous = cards?.find((c) => c.kind === "AMBIGUOUS");

  return (
    <div className="min-h-screen bg-[var(--bg-void)] px-4 py-8 text-[var(--text-primary)] md:px-8 md:py-12">
      <header className="mx-auto mb-10 max-w-6xl">
        <div className="flex items-baseline gap-4">
          <h1 className="font-mono text-4xl font-semibold tracking-tight [text-shadow:0_0_28px_rgba(6,182,212,0.35)]">
            VIGIL
          </h1>
          <span className="font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">
            Depth of anesthesia · case gallery
          </span>
        </div>
        <p className="mt-4 max-w-2xl font-sans text-sm leading-relaxed text-[var(--text-muted)]">
          Four recordings where the spectral depth proxy is unambiguous — wide
          awake, or clearly under. Pick any one to open the monitor.
        </p>
      </header>

      {error && (
        <div className="mx-auto max-w-6xl font-mono text-xs tracking-[0.15em] text-[var(--accent-amber)]">
          FAILED TO LOAD CASES: {error.message}
        </div>
      )}

      {!cards && !error && (
        <div className="mx-auto max-w-6xl font-mono text-xs tracking-[0.2em] text-[var(--accent-cyan)]">
          LOADING CASES...
        </div>
      )}

      {/* The unambiguous cases. */}
      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {clear.map((c, i) => {
          const style = KIND_STYLE[c.kind];
          return (
            <Link
              key={`${c.subject}_${c.condition}`}
              href={`/monitor?subject=${c.subject}_${c.condition}`}
              className={cn(CARD_SHELL, style.border, "group flex flex-col overflow-hidden p-4")}
            >
              <BrainThumb
                electrodes={c.electrodes}
                topo={c.topo}
                className="mx-auto aspect-square w-full"
              />
              <div className="mt-3 flex items-center justify-between">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] tracking-[0.12em]",
                    style.cls
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current shadow-[0_0_8px_currentColor]" />
                  {style.label}
                </span>
                <span className="font-mono text-2xl font-semibold tabular-nums leading-none">
                  {c.median_sdp.toFixed(0)}
                </span>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="font-mono text-[10px] tracking-[0.12em] text-[var(--text-muted)]">
                  {c.subject} · {c.condition.toUpperCase()}
                </span>
                <span className="font-mono text-[9px] tracking-[0.1em] text-[var(--text-muted-a50)]">
                  SDP
                </span>
              </div>
              <p className="mt-2 font-sans text-[11px] leading-snug text-[var(--text-muted)]">
                {c.caption}
              </p>
              <p className="mt-1 font-mono text-[9px] tracking-[0.1em] text-[var(--text-muted-a50)]">
                PROPOFOL {c.drug_concentration_ug_ml.toFixed(1)} µg/mL
              </p>
            </Link>
          );
        })}
      </main>

      {/* The case that breaks the pattern. */}
      {ambiguous && (
        <section className="mx-auto mt-12 max-w-6xl">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-[var(--accent-amber)]" />
            <h2 className="font-mono text-xs tracking-[0.16em] text-[var(--accent-amber)]">
              AND THEN THERE IS THIS ONE
            </h2>
          </div>

          <Link
            href={`/monitor?subject=${ambiguous.subject}_${ambiguous.condition}`}
            className={cn(
              CARD_SHELL,
              "group grid grid-cols-1 items-center gap-6 border-[var(--border-alert)] p-6 hover:border-[var(--accent-amber)] md:grid-cols-[240px_1fr]"
            )}
          >
            <BrainThumb
              electrodes={ambiguous.electrodes}
              topo={ambiguous.topo}
              className="mx-auto aspect-square w-full max-w-[240px]"
            />

            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] tracking-[0.12em]",
                    KIND_STYLE.AMBIGUOUS.cls
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current shadow-[0_0_14px_currentColor]" />
                  {KIND_STYLE.AMBIGUOUS.label}
                </span>
                <span className="font-mono text-[10px] tracking-[0.12em] text-[var(--text-muted)]">
                  {ambiguous.subject} · {ambiguous.condition.toUpperCase()} · PROPOFOL{" "}
                  {ambiguous.drug_concentration_ug_ml.toFixed(1)} µg/mL
                </span>
              </div>

              <p className="mt-4 max-w-2xl font-sans text-sm leading-relaxed text-[var(--text-primary)]">
                Same drug concentration as the sedated cases above. Same spectral
                depth proxy —{" "}
                <span className="font-mono font-semibold text-[var(--accent-amber)]">
                  {ambiguous.median_sdp.toFixed(1)}
                </span>
                , within a point of them. The monitor calls this patient
                unconscious.
              </p>
              <p className="mt-3 max-w-2xl font-sans text-sm leading-relaxed text-[var(--text-muted)]">
                They were squeezing the anesthetist&apos;s hand on request.
                Nothing in the spectrum distinguishes them from the patients who
                weren&apos;t — which is the entire reason for measuring coupling
                instead.
              </p>

              <span className="mt-5 inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.14em] text-[var(--accent-amber)] transition-transform duration-200 group-hover:translate-x-1">
                OPEN MONITOR <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </Link>
        </section>
      )}

      <footer className="mx-auto mt-12 max-w-6xl border-t border-[var(--border-hairline)] pt-4">
        <p className="font-mono text-[9px] leading-relaxed tracking-[0.1em] text-[var(--text-muted-a50)]">
          SIMULATED DATA — stand-in for Chennu et al. 2016 propofol sedation
          (n=20) while the real release is unavailable. SDP is a spectral proxy,
          not BIS. Cases selected by scripts/pick_exemplars.py.
        </p>
      </footer>
    </div>
  );
}
