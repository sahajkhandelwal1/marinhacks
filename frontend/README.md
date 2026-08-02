# frontend

PROBE's monitor UI. Next.js 15 (App Router) + React 19 + Tailwind, exported as
a static site. Light clinical theme, Inter throughout.

The main stage is a 3D cortical surface (three.js via @react-three/fiber). Every
other visualization — trace, timeline, scalp field, spike raster — is a hand-
written canvas renderer, so there is no charting dependency.

This overrides `probe-prd.md` §8, which specifies a near-black OR-monitor
aesthetic and rules out a 3D brain by name. Both departures were explicit
product decisions. What carries over from §8 is the discipline: one accent hue,
amber reserved for the single status that matters, recessive chrome, honesty
labels on every panel that needs one, and the number still being the loudest
thing on screen.

```
npm run dev        # bundles data, then next dev
npm run build      # bundles data, then static export to out/
npm run typecheck
```

Deploy `out/` to any static host. For a subpath (a GitHub Pages project site)
set `NEXT_PUBLIC_BASE_PATH=/repo-name` before building. No live inference
behind the public link, per PRD §8.

## Data

Source of truth is `../data/synthetic/` — 20 subjects x 4 conditions plus
`subjects.csv`, matching the `probe-prd.md` §6 contract. (`../data/*.json` is
the older 2-subject bootstrap set; contract-identical, superseded.)
`scripts/bundle-data.mjs` repacks it into `public/data/`, and copies
`../data/brain/` (fsaverage5 cortical surface) and `../data/simulated/`
(precomputed Brian2 buckets) in alongside, so `data/` stays the single source
of truth for everything the UI fetches. All of `public/data/` is generated and
gitignored.

- `manifest.json` — cohort summary per subject and condition (median,
  quartiles, range, drug concentration, responsive flag) plus the electrode
  montage. Loaded on boot; drives the roster and the cohort strip.
- `<subject>.json` — all four conditions, columnar. ~226 KB each, loaded on
  demand and cached for the session.

`sdp` ships at the full 10 Hz. `topo` is decimated to 2 Hz because the source
frames were computed on 2-second windows at 50% overlap — 1 Hz native — then
interpolated up to 10 Hz by `../scripts/emit_json.py`. Dropping to 2 Hz
discards interpolation, not measurement; the UI re-interpolates for playback.

When real Chennu-derived JSON lands, point `SRC` in the bundler at it. Nothing
else changes — same schema, same field meanings.

## What is real and what is not

The demo makes claims on screen, so the boundary is worth stating plainly:

- **Real:** SDP and the per-electrode alpha index, computed by
  `../scripts/sdp.py` (Welch PSD, alpha/delta ratio, anchored to each subject's
  own baseline) and emitted through the §6 contract. Responsive/non-responsive
  labels and drug concentrations are carried through from the dataset
  unchanged. The cortical geometry is a real MRI-derived template surface
  (fsaverage5, FreeSurfer).
- **Synthetic:** the underlying EEG. Real math over generated signal, pending
  the Chennu recordings. The footer says so, per PRD §10. The spiking
  population panel is also synthetic and unrelated to any patient — it
  illustrates the mechanism SDP is a proxy for.
- **A projection, not a localization:** the colors on the cortex. Electrode
  values are *scalp* measurements; painting them onto a cortical surface solves
  no inverse problem. The panel says so on screen, permanently, in the alert
  color rather than as small print.
- **Reconstructed:** the scrolling trace. The contract deliberately does not
  ship raw 250 Hz EEG, so `src/lib/trace.ts` rebuilds a waveform from SDP and
  the per-channel alpha index, mirroring the generator in `emit_json.py`. It
  tracks the real index values; it is not the patient's EEG sample for sample.
  Labeled RECONSTRUCTED wherever it appears.
- **Not measured:** CI. Null in every fixture, and the greyed panel is the
  intended end state — Tier 1 is dead on the public release (no stimulus
  timing in `events.tsv`). That panel is part of the argument, not a TODO.

## Views

`#monitor` — single patient: rotating cortical surface, SDP hero, CI panel,
reconstructed trace, scrubbable SDP timeline, depth slider, cohort roster,
model status, simulated population.

`#compare` — PRD §3/§8's closing move: S04 (did not respond) vs S02 (responded
to command) at moderate sedation, ~0-point SDP gap, plus the whole cohort
plotted by outcome. Both patients render as cortical surfaces pinned to the
same fixed viewpoint, so the two are directly comparable. Both views are addressable by hash, so the deck can point
a QR code straight at the money plot. The pair is set in `INITIAL` in
`src/state/monitor.tsx` — re-run `../scripts/find_money_plot.py` if the data
changes, since the best pairing is not guaranteed to stay the same.

`#manual` — a sandbox. Aim a simulated suppression or stimulation beam at a
lobe, set intensity and drive frequency, and watch the modeled depth index and
response trace move. **Nothing in this mode is measured**: there is no device
and no dataset here contains an intervention. The model lives in
`src/lib/manual.ts` with its assumptions stated in the open, the view carries a
SIMULATION banner rather than a footnote, and the targets are real Destrieux
parcels carried in the mesh, so at least the geometry is true.

It earns its place by making a failure mode physical. Drive delta hard and the
index drops whichever way the beam points — delta sits in SDP's denominator, so
the monitor reports a deeper patient because the arithmetic moved. Suppression
also drags the index much further than excitation lifts it, which is the same
asymmetry the product argument rests on.

Keyboard: space play/pause, arrows step (shift = 10 s), drag the SDP timeline
to scrub, click an electrode to pin the focus channel.

## Architecture notes

- **`src/state/monitor.tsx`** — playback clock and selection. Structural state
  (subject, condition, view) goes through React; the transport time does not.
  Canvases read it inside their own rAF callback and text readouts poll at
  8–12 Hz, so a 300-second recording never re-renders the tree at 60 Hz.
- **`src/components/BrainStage.tsx`** — the seam between the two render loops.
  The app clock writes the current alpha index into a `Float32Array`; the
  three.js loop inside `BrainViz3D` reads that same array on its own schedule.
  Passing a ref rather than an array prop is what keeps scrubbing from
  rebuilding the r3f scene graph 60 times a second. Vertex recolor is ~250k
  weighted sums, throttled to 20 Hz — the underlying topo data is 2 Hz, so
  that is already more than the signal carries.
- **`src/lib/topo.ts`** — the 2D scalp field. No longer on screen: the
  two-patient view now uses the cortical surface as well, so both views speak
  the same visual language. The original objection to 3D there was sound —
  two *rotating* meshes are harder to compare than two static scalps, since at
  any moment they may show different faces — so the compare cards pass
  `spin={false}`, locking both to one fixed lateral yaw. Kept as a working
  fallback, and `TopoLegend` from `Topomap.tsx` is still used by both views.
  Inverse-distance weighting into a 96x96 ImageData upscaled by the browser's
  bilinear filter (~1.3 ms/frame). Electrodes are inset by `SCALP_INSET`
  because Fp1/Fp2/O1/O2 sit at radius exactly 1.0 in the contract and would
  otherwise land on the clipped disc boundary.
- **`src/lib/color.ts`** — one sequential ramp, generated in OKLCH so lightness
  is perceptually monotone, shared by the cortex and the 2D field so both speak
  the same color language. On a light surface it runs light→dark: a bright high
  end would vanish into the white card exactly where the data matters most.
  Manual mode uses the *diverging* scale in the same file instead, because beam
  effect is a signed quantity — it needs two poles that read as opposite and a
  neutral midpoint, or "no effect" would look like an effect.
- **Color roles** — one accent hue plus one reserved status hue.
  `#2A78D6` / `#EB6834` are the categorical pair for data marks and clear every
  colorblind-safety check on the white chart surface (worst-case CVD ΔE 24.7).
  The `-text` steps are darker variants for small type, which needs 4.5:1 where
  marks only need 3:1. Outcome is never encoded by color alone — fill vs ring,
  a legend, and text ride along with it.
- **Typography** — Inter, one family, hierarchy by weight and size rather than
  color, so it survives a projector and grayscale. `.metric` / `.metric-hero`
  carry tabular figures: without them a live-updating number shimmers as digit
  widths change.
- **Units are never uppercased by CSS.** `text-transform` turns µg/mL into
  MG/ML, a thousand-fold error introduced by styling. Wrap units inside
  uppercased labels in `.unit`.
