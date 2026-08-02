# VIGIL — consciousness monitor (frontend)

A single-patient OR monitor that replays precomputed EEG-derived signals and makes
one thing impossible to miss: the conventional depth monitor can call a patient
**unconscious** while a coupling measure shows the brain is still **tracking the
room**. A judge picks a patient and sedation level, hits play (or scrubs), and
watches three signals move together.

- **SDP** — Spectral Depth Proxy. What today's monitors show (intrinsic rhythm).
- **CI** — Coupling Index. How much of the EEG is still explained by the room,
  vs. this patient's own awake baseline. Above ~0.5 → still tracking.
- **MODEL** — a spectral-only classifier that reads the same features as SDP, so
  it shares SDP's blind spot.

When SDP reads *unconscious* while CI still reads *tracking room*, the whole
instrument shifts into an awareness-alarm register and the timeline lights the
**disagreement band**. That is the demo.

## Run

```bash
cd "max frontend"
npm install
npm run dev        # http://localhost:5173
```

Build for a static host (public link / QR):

```bash
npm run build      # -> dist/  (base is relative, deploy anywhere)
npm run preview
```

## Data

The app is a pure replayer — no backend, no inference at runtime. It loads static
JSON from `public/data/`, one file per patient/condition, listed in
`public/data/manifest.json`.

Presets are generated from the team's synthetic dataset (`../data/synthetic`):

```bash
npm run presets    # scripts/emit_presets.py -> public/data/*.json + manifest.json
```

### Honesty model (deliberate)

The raw dataset carries **SDP only** — CI and the classifier were nulled by the
data team (fabricated CI was removed upstream). To demo the SDP-vs-CI thesis, the
generator produces two kinds of feed, both clearly labelled **SYNTHETIC** in the
persistent source badge:

- **vigil feed** — SDP + a synthetic CI (stays high for responsive patients as
  sedation deepens; collapses for genuinely unconscious ones) + a synthetic
  spectral-only classifier probability (a function of SDP alone → shares the
  blind spot). Nothing here claims to be real-data-backed.
- **raw feed** (Patient E) — untouched: CI and classifier left `null`, so the UI
  renders a real, visibly distinct **NOT MEASURED** state. Never a faked zero.

Per the frontend data contract, `ci` and `classifier_prob` may be `null` per
frame or absent for a recording — the UI renders NOT MEASURED and never crashes.

### Per-frame shape

```json
{
  "subject": "S00", "condition": "moderate", "responsive": true,
  "fs": 5, "feed": "vigil",
  "source_label": "SYNTHETIC · Chennu-style propofol sedation · replay",
  "electrodes": [ { "label": "Fp1", "x": -0.31, "y": 0.95 } ],
  "frames": [ { "t": 0.0, "topo": [0.42, ...], "sdp": 36, "ci": 0.69, "classifier_prob": 0.23 } ]
}
```

## Design

Grounded in clinical instrumentation rather than a generic dark dashboard:

- **Palette** — cool instrument charcoal + the plasma/voltage colormap that
  computational-neuroscience tools (NEURON/Brian2) emit. SDP = institutional
  steel, CI = live amber-gold, classifier = muted violet, disagreement = alarm red.
- **Type** — Chakra Petch (squared avionics/instrument face) for numerics and
  labels; IBM Plex Sans/Mono for body and data captions.
- **Signature** — the awareness-alarm register: quiet until SDP and CI disagree,
  then the instrument frame ignites and the timeline band pulses.

The 3D **cortical coupling field** (`BrainCanvas.tsx`) is a three.js ellipsoid
whose surface activity is interpolated from the 12 electrode band powers and
coloured through the plasma ramp — the same per-frame values a flat topomap would
use. It's an aesthetic reference to simulation output, not an actual simulation.
`prefers-reduced-motion` freezes rotation, ripples, and particle drift.

## Structure

```
src/
  App.tsx           layout + shared "current frame" state
  data.ts           types, loaders, clinical thresholds, disagreement rule
  usePlayback.ts    one rAF clock driving the shared frame index
  BrainCanvas.tsx   three.js voltage-field brain
  EEGTrace.tsx      scrolling frontal-montage band-power envelope (canvas)
  ParameterRail.tsx SDP / CI / MODEL readouts + NOT MEASURED
  Timeline.tsx      master slider + disagreement band (canvas)
scripts/emit_presets.py   dataset -> public/data presets
```
