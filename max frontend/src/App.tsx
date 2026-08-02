import { useEffect, useRef, useState } from "react";
import {
  isDisagreement,
  loadManifest,
  loadRecording,
  type Frame,
  type Manifest,
  type ManifestPatient,
  type Recording,
} from "./data";
import { usePlayback } from "./usePlayback";
import { BrainCanvas } from "./BrainCanvas";
import { EEGTrace } from "./EEGTrace";
import { ParameterRail } from "./ParameterRail";
import { Timeline } from "./Timeline";
import "./App.css";

const CONDITION_ORDER = ["baseline", "mild", "moderate", "recovery"];

export function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [patient, setPatient] = useState<ManifestPatient | null>(null);
  const [condition, setCondition] = useState("moderate");
  const [rec, setRec] = useState<Recording | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadManifest()
      .then((m) => {
        setManifest(m);
        setPatient(m.patients[0]);
      })
      .catch((e) => setError(String(e)));
  }, []);

  // load recording when patient/condition changes
  useEffect(() => {
    if (!patient) return;
    const entry =
      patient.conditions.find((c) => c.condition === condition) ??
      patient.conditions[0];
    if (!entry) return;
    setRec(null);
    loadRecording(entry.file)
      .then(setRec)
      .catch((e) => setError(String(e)));
  }, [patient, condition]);

  if (error) {
    return (
      <div className="fatal">
        <div className="cap">signal fault</div>
        <p>Couldn't load recording data. Run <code>npm run presets</code>, then reload.</p>
        <pre>{error}</pre>
      </div>
    );
  }
  if (!manifest || !patient) return <Booting />;

  return (
    <Instrument
      manifest={manifest}
      patient={patient}
      condition={condition}
      rec={rec}
      onPatient={(p) => setPatient(p)}
      onCondition={setCondition}
    />
  );
}

function Instrument({
  manifest,
  patient,
  condition,
  rec,
  onPatient,
  onCondition,
}: {
  manifest: Manifest;
  patient: ManifestPatient;
  condition: string;
  rec: Recording | null;
  onPatient: (p: ManifestPatient) => void;
  onCondition: (c: string) => void;
}) {
  const frames = rec?.frames ?? [];
  const { index, playing, speed, setSpeed, toggle, seek, reset } = usePlayback(
    Math.max(1, frames.length),
    rec?.fs ?? 5
  );

  // reset playback when the recording swaps
  const recKey = `${patient.id}/${condition}`;
  const lastKey = useRef(recKey);
  useEffect(() => {
    if (lastKey.current !== recKey) {
      lastKey.current = recKey;
      reset();
    }
  }, [recKey, reset]);

  const frame: Frame | null = frames[index] ?? null;
  const disagreement = frame ? isDisagreement(frame) : false;

  // shared refs for the self-driven canvases
  const frameRef = useRef<Frame | null>(null);
  const alarmRef = useRef(false);
  frameRef.current = frame;
  alarmRef.current = disagreement;

  const elapsed = frame ? frame.t : 0;
  const total = frames.length ? frames[frames.length - 1].t : 0;

  return (
    <div className={`instrument${disagreement ? " alarm" : ""}`}>
      <div className="alarm-frame" aria-hidden="true" />

      <header className="topbar">
        <div className="brand">
          <span className="wordmark">VIGIL</span>
          <span className="brand-tag">consciousness monitor</span>
        </div>

        <div className="selectors">
          <label className="sel">
            <span className="cap">patient</span>
            <select
              value={patient.id}
              onChange={(e) =>
                onPatient(manifest.patients.find((p) => p.id === e.target.value)!)
              }
            >
              {manifest.patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.responsive ? "responded (IFT+)" : "no response (IFT−)"}
                </option>
              ))}
            </select>
          </label>

          <div className="sel">
            <span className="cap">sedation condition</span>
            <div className="conditions" role="radiogroup" aria-label="sedation condition">
              {CONDITION_ORDER.filter((c) =>
                patient.conditions.some((pc) => pc.condition === c)
              ).map((c) => (
                <button
                  key={c}
                  role="radio"
                  aria-checked={c === condition}
                  className={c === condition ? "cond active" : "cond"}
                  onClick={() => onCondition(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="source">
          <span className="source-dot" />
          <span className="cap source-label">{rec?.source_label ?? "loading feed…"}</span>
          <span className="cap source-sub">{recKey}</span>
        </div>
      </header>

      <main className="stage">
        <section className="brain-pane">
          <div className="pane-tag cap">cortical coupling field</div>
          {rec && (
            <BrainCanvas
              key={recKey}
              electrodes={rec.electrodes}
              frameRef={frameRef}
              alarmRef={alarmRef}
            />
          )}
          <div className="colorbar" aria-hidden="true">
            <span className="cap">low</span>
            <div className="colorbar-ramp" />
            <span className="cap">high · activity</span>
          </div>
          <div className={`verdict-banner${disagreement ? " show" : ""}`} role="status">
            <span className="verdict-banner-lead">DISAGREEMENT</span>
            <span className="verdict-banner-body">
              Monitor reads <b>unconscious</b> · coupling shows the brain still{" "}
              <b>tracking the room</b>
            </span>
          </div>
        </section>

        <aside className="rail-pane">
          {frame && <ParameterRail frame={frame} disagreement={disagreement} />}
        </aside>
      </main>

      <section className="eeg-pane">
        <div className="pane-tag cap">frontal montage · band-power envelope</div>
        {rec && <EEGTrace key={recKey} electrodes={rec.electrodes} frameRef={frameRef} alarmRef={alarmRef} />}
      </section>

      <footer className="transport">
        <div className="transport-controls">
          <button className="play" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
            {playing ? "❚❚" : "▶"}
            <span>{playing ? "pause" : "play"}</span>
          </button>
          <button className="ghost" onClick={reset} aria-label="Restart">
            ⟲
          </button>
          <div className="speeds" role="radiogroup" aria-label="playback speed">
            {[1, 4, 10].map((s) => (
              <button
                key={s}
                role="radio"
                aria-checked={s === speed}
                className={s === speed ? "spd active" : "spd"}
                onClick={() => setSpeed(s)}
              >
                {s}×
              </button>
            ))}
          </div>
          <div className="clock cap">
            <span>{fmt(elapsed)}</span> / <span>{fmt(total)}</span>
          </div>
        </div>
        {frames.length > 0 && <Timeline frames={frames} index={index} onSeek={seek} />}
        <div className="legend">
          <Legend color="var(--steel)" label="SDP" />
          <Legend color="var(--signal)" label="CI" />
          <Legend color="var(--alarm)" label="disagreement" />
        </div>
      </footer>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="legend-item">
      <i style={{ background: color }} />
      <span className="cap">{label}</span>
    </span>
  );
}

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function Booting() {
  return (
    <div className="booting">
      <span className="wordmark">VIGIL</span>
      <span className="cap">initializing instrument…</span>
    </div>
  );
}
