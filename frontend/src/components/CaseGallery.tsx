"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BrainThumb } from "./BrainThumb";
import { assetUrl, DEFAULT_DATA_SOURCE } from "@/lib/dataset";
import type { Electrode } from "@/lib/types";

type ExemplarCard = {
  subject: string;
  condition: string;
  kind: "AWAKE" | "SEDATED" | "AMBIGUOUS";
  caption: string;
  responsive: boolean;
  median_sdp: number;
  /** Null on the real dataset — no dosage ships with those recordings. */
  drug_concentration_ug_ml: number | null;
  topo: number[];
  electrodes: Electrode[];
};

/**
 * Home screen: four recordings the index reads correctly, then the one it
 * doesn't.
 *
 * The order is the argument. Establish that the number works, then show a case
 * at the same drug concentration with the same number where the patient was
 * answering questions. Cases are chosen by scripts/pick_exemplars.py rather
 * than hand-picked, so the pairing survives the data being regenerated.
 */
export function CaseGallery() {
  const source = DEFAULT_DATA_SOURCE;
  const [cards, setCards] = useState<ExemplarCard[] | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(assetUrl(`/data/${source}/exemplars.json`))
      .then((r) => {
        if (!r.ok) throw new Error(`${source}/exemplars.json ${r.status}`);
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
  // The sedated card whose SDP actually sits closest to the ambiguous one.
  const nearestSedated =
    ambiguous && clear.length
      ? clear
          .filter((c) => c.kind === "SEDATED")
          .reduce<ExemplarCard | null>(
            (best, c) =>
              !best ||
              Math.abs(c.median_sdp - ambiguous.median_sdp) <
                Math.abs(best.median_sdp - ambiguous.median_sdp)
                ? c
                : best,
            null,
          )
      : null;

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 md:px-8 md:py-14">
      <header className="mb-10">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-ink" title="Patient Response Observation Brain Encoder">PROBE</h1>
          <span className="status text-ink-3">Depth of anesthesia · case gallery</span>
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-2">
          Four recordings where the spectral depth proxy is unambiguous — wide awake, or
          clearly under. Open any one to see the monitor.
        </p>
      </header>

      {error ? (
        <p className="panel px-4 py-3 text-2xs text-alert-text">
          Failed to load cases: {error.message} — run <code>npm run bundle:data</code>
        </p>
      ) : null}

      {!cards && !error ? <p className="text-2xs text-ink-3">Loading cases…</p> : null}

      <main className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {clear.map((c) => (
          <Link
            key={`${c.subject}_${c.condition}`}
            href={`/monitor/?subject=${c.subject}_${c.condition}`}
            className="panel group flex flex-col p-4 transition-shadow hover:shadow-raised"
          >
            <BrainThumb
              electrodes={c.electrodes}
              topo={c.topo}
              className="mx-auto aspect-square w-full"
            />

            <div className="mt-3 flex items-center justify-between gap-2">
              <KindChip kind={c.kind} />
              <span className="metric-hero text-2xl text-ink">{c.median_sdp.toFixed(0)}</span>
            </div>

            <div className="mt-2 flex items-baseline justify-between">
              <span className="metric text-2xs font-medium text-ink-2">
                {c.subject} · {c.condition}
              </span>
              <span className="label">SDP</span>
            </div>

            <p className="mt-2 text-2xs leading-relaxed text-ink-2">{c.caption}</p>
            <p className="mt-1.5 metric text-2xs text-ink-3">
              {/* Null on the real dataset — no dosage figure ships with those
                  recordings. Name the condition rather than invent a number. */}
              {c.drug_concentration_ug_ml === null
                ? c.condition
                : `propofol ${c.drug_concentration_ug_ml.toFixed(1)} µg/mL`}
            </p>
          </Link>
        ))}
      </main>

      {ambiguous ? (
        <section className="mt-12">
          <h2 className="status mb-3 text-alert-text">And then there is this one</h2>

          <Link
            href={`/monitor/?subject=${ambiguous.subject}_${ambiguous.condition}`}
            className="panel group grid grid-cols-1 items-center gap-6 p-6 transition-shadow hover:shadow-raised md:grid-cols-[240px_1fr]"
            style={{ borderColor: "var(--alert)" }}
          >
            <BrainThumb
              electrodes={ambiguous.electrodes}
              topo={ambiguous.topo}
              className="mx-auto aspect-square w-full max-w-[240px]"
            />

            <div>
              <div className="flex flex-wrap items-center gap-3">
                <KindChip kind="AMBIGUOUS" />
                <span className="metric text-2xs text-ink-2">
                  {ambiguous.subject} · {ambiguous.condition}
                  {ambiguous.drug_concentration_ug_ml !== null &&
                    ` · propofol ${ambiguous.drug_concentration_ug_ml.toFixed(1)} µg/mL`}
                </span>
              </div>

              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink">
                Same sedation level as the cases above. Spectral depth proxy{" "}
                <span className="metric font-semibold text-alert-text">
                  {ambiguous.median_sdp.toFixed(1)}
                </span>
                {/* Derived, not asserted. The nearest sedated card is whichever
                    one it actually is, and how close it is depends on the
                    dataset — a hardcoded "within a point of them" was on screen
                    claiming 71.0 sat beside cards reading 19 and 20. */}
                {nearestSedated && (
                  <>
                    {" "}— within{" "}
                    <span className="metric font-semibold">
                      {Math.abs(ambiguous.median_sdp - nearestSedated.median_sdp).toFixed(1)}
                    </span>{" "}
                    of subject {nearestSedated.subject}, who did not respond.
                  </>
                )}{" "}
                The monitor calls this patient unconscious.
              </p>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-2">
                They were squeezing the anesthetist&apos;s hand on request. Nothing in the
                spectrum distinguishes them from the patients who weren&apos;t — which is
                the entire reason for measuring coupling instead.
              </p>

              <span className="mt-5 inline-flex items-center gap-1.5 text-2xs font-semibold text-accent-text transition-transform group-hover:translate-x-0.5">
                Open monitor →
              </span>
            </div>
          </Link>
        </section>
      ) : null}

      <footer className="mt-12 border-t border-rule pt-4">
        <p className="max-w-3xl text-2xs leading-relaxed text-ink-3">
          {/* Source-dependent, and it matters in both directions: this line
              claimed "simulated data ... while the real release is unavailable"
              after the real recordings had already become the default. */}
          {source === "real"
            ? "Real EEG — propofol sedation recordings (n=20), healthy volunteers, run through the SDP math in scripts/sdp.py."
            : "Simulated data — a synthetic stand-in retained for A/B comparison against the real recordings."}{" "}
          SDP is a spectral proxy, not BIS. The cortical surface is a scalp
          projection, not source localization. Cases selected by
          scripts/pick_exemplars.py.
        </p>
      </footer>
    </div>
  );
}

/**
 * Outcome is never carried by color alone — the chip has a word in it, and the
 * amber is reserved for the one state that matters.
 */
function KindChip({ kind }: { kind: ExemplarCard["kind"] }) {
  const style =
    kind === "AMBIGUOUS"
      ? "bg-alert-wash text-alert-text"
      : kind === "AWAKE"
        ? "bg-accent-wash text-accent-text"
        : "bg-well text-ink-2";
  const label = kind === "AMBIGUOUS" ? "Responded to command" : kind.toLowerCase();

  return (
    <span
      className={`status inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${style}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {label}
    </span>
  );
}
