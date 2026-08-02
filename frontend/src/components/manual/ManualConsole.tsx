"use client";

import {
  BANDS,
  PRESETS,
  REGIONS,
  bandFor,
  hzToSlider,
  sliderToHz,
  type BeamState,
  type RegionId,
} from "@/lib/manual";

export function ManualConsole({
  beam,
  onChange,
}: {
  beam: BeamState;
  onChange: (next: BeamState) => void;
}) {
  const band = bandFor(beam.hz);
  const region = REGIONS.find((r) => r.id === beam.region) ?? REGIONS[0];

  return (
    <div className="flex flex-col divide-y divide-rule">
      <Section title="Target region">
        <div className="grid grid-cols-2 gap-1.5">
          {REGIONS.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onChange({ ...beam, region: r.id as RegionId })}
              aria-pressed={r.id === beam.region}
              className={`rounded-md border px-2.5 py-2 text-left text-2xs font-semibold transition-colors ${
                r.id === beam.region
                  ? "border-accent bg-accent-wash text-accent-text"
                  : "border-rule text-ink-2 hover:border-rule-strong hover:text-ink"
              } ${r.id === "thalamus" ? "col-span-2" : ""}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-2xs leading-relaxed text-ink-3">{region.note}</p>
      </Section>

      <Section title="Beam mode">
        <div className="grid grid-cols-2 gap-1.5">
          {(
            [
              ["suppress", "Suppression", "inhibitory"],
              ["stimulate", "Stimulation", "excitatory"],
            ] as const
          ).map(([mode, label, sub]) => {
            const active = beam.mode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onChange({ ...beam, mode })}
                aria-pressed={active}
                className={`rounded-md border px-2.5 py-2 transition-colors ${
                  active
                    ? mode === "suppress"
                      ? "border-accent bg-accent-wash"
                      : "border-alert bg-alert-wash"
                    : "border-rule hover:border-rule-strong"
                }`}
              >
                <span
                  className={`block text-2xs font-semibold ${
                    active ? (mode === "suppress" ? "text-accent-text" : "text-alert-text") : "text-ink-2"
                  }`}
                >
                  {label}
                </span>
                <span className="mt-0.5 block text-2xs text-ink-3">{sub}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section
        title="Ray intensity"
        value={`${Math.round(beam.intensity * 100)}%`}
      >
        <input
          className="scrub mt-1"
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(beam.intensity * 100)}
          onChange={(e) => onChange({ ...beam, intensity: Number(e.target.value) / 100 })}
          aria-label="Ray intensity, percent"
        />
        <div className="mt-1 flex justify-between text-2xs text-ink-3">
          <span>off</span>
          <span>full</span>
        </div>
      </Section>

      <Section
        title="Drive frequency"
        value={
          <>
            {beam.hz.toFixed(1)} <span className="unit">Hz</span>
          </>
        }
      >
        <input
          className="scrub mt-1"
          type="range"
          min={0}
          max={1000}
          step={1}
          value={Math.round(hzToSlider(beam.hz) * 1000)}
          onChange={(e) => onChange({ ...beam, hz: sliderToHz(Number(e.target.value) / 1000) })}
          aria-label="Drive frequency in hertz"
          aria-valuetext={`${beam.hz.toFixed(1)} hertz${band ? `, ${band.label}` : ""}`}
        />
        <div className="mt-2 grid grid-cols-4 gap-1">
          {BANDS.map((b) => {
            const active = band?.id === b.id;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => onChange({ ...beam, hz: (b.lo + b.hi) / 2 })}
                aria-pressed={active}
                className={`rounded px-1 py-1.5 text-2xs font-semibold transition-colors ${
                  active ? "bg-accent text-white" : "bg-well text-ink-2 hover:text-ink"
                }`}
              >
                {b.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-2xs text-ink-3">
          {band ? `${band.label} · ${band.lo}–${band.hi} Hz` : "between named bands"}
        </p>
      </Section>

      <Section title="Presets">
        <div className="flex flex-col gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange(p.beam)}
              className="rounded-md border border-rule px-2.5 py-2 text-left transition-colors hover:border-rule-strong hover:bg-well"
            >
              <span className="block text-2xs font-semibold text-ink">{p.label}</span>
              <span className="mt-0.5 block text-2xs leading-relaxed text-ink-3">
                {p.description}
              </span>
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  value,
  children,
}: {
  title: string;
  value?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="px-4 py-3.5">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="panel-title">{title}</h3>
        {value ? <span className="metric text-2xs font-semibold text-ink">{value}</span> : null}
      </div>
      {children}
    </section>
  );
}
