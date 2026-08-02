# frontend

VIGIL's monitor UI. Next.js 15 (App Router) + React 19 + Tailwind, exported as
a static site. No charting or 3D dependency — every visualization is a canvas
renderer in `src/lib`.

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
`subjects.csv`, matching the `vigil-prd.md` §6 contract. (`../data/*.json` is
the older 2-subject bootstrap set; contract-identical, superseded.)
`scripts/bundle-data.mjs` repacks it into `public/data/`:

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

- **Real:** SDP and the topomap alpha index, computed by `../scripts/sdp.py`
  (Welch PSD, alpha/delta ratio, anchored to each subject's own baseline) and
  emitted through the §6 contract. Responsive/non-responsive labels and drug
  concentrations are carried through from the dataset unchanged.
- **Synthetic:** the underlying EEG. Real math over generated signal, pending
  the Chennu recordings. The footer says so, per PRD §10.
- **Reconstructed:** the scrolling trace. The contract deliberately does not
  ship raw 250 Hz EEG, so `src/lib/trace.ts` rebuilds a waveform from SDP and
  the per-channel alpha index, mirroring the generator in `emit_json.py`. It
  tracks the real index values; it is not the patient's EEG sample for sample.
  Labeled RECONSTRUCTED wherever it appears.
- **Not measured:** CI. Null in every fixture, and the greyed panel is the
  intended end state — Tier 1 is dead on the public release (no stimulus
  timing in `events.tsv`). That panel is part of the argument, not a TODO.

## Views

`#monitor` — single patient: topomap, SDP hero, CI panel, reconstructed trace,
scrubbable SDP timeline, depth slider, cohort roster, model status.

`#compare` — PRD §3/§8's closing move: S04 (did not respond) vs S02 (responded
to command) at moderate sedation, ~0-point SDP gap, plus the whole cohort
plotted by outcome. Both views are addressable by hash, so the deck can point
a QR code straight at the money plot. The pair is set in `INITIAL` in
`src/state/monitor.tsx` — re-run `../scripts/find_money_plot.py` if the data
changes, since the best pairing is not guaranteed to stay the same.

Keyboard: space play/pause, arrows step (shift = 10 s), drag the SDP timeline
to scrub, click an electrode to pin the focus channel.

## Architecture notes

- **`src/state/monitor.tsx`** — playback clock and selection. Structural state
  (subject, condition, view) goes through React; the transport time does not.
  Canvases read it inside their own rAF callback and text readouts poll at
  8–12 Hz, so a 300-second recording never re-renders the tree at 60 Hz.
- **`src/lib/topo.ts`** — inverse-distance weighting into a 96x96 ImageData,
  upscaled by the browser's bilinear filter (~1.3 ms/frame). Electrodes are
  inset by `SCALP_INSET` because Fp1/Fp2/O1/O2 sit at radius exactly 1.0 in the
  contract and would otherwise land on the clipped disc boundary. 2D on
  purpose: §8 is explicit that a flat topomap reads as an instrument and a
  rotating 3D mesh reads as a video game.
- **`src/lib/color.ts`** — the topomap ramp is generated in OKLCH so lightness
  is perceptually monotone; `inkOn()` picks label ink from the local field
  value so labels stay legible over both ends of the ramp.
- **Color roles** — two accent hues (§8). `--signal-deep` / `--alarm-deep`
  (`#199E70` / `#C98500`) are the categorical pair for data marks; they clear
  every colorblind-safety check against the `#0A0E0F` surface. The brighter
  steps are instrument chrome: single-series traces, the hero number, the top
  of the ramp. Outcome is never encoded by color alone — fill vs ring, a
  legend, and text ride along with it.
- **Units are never uppercased by CSS.** `text-transform` turns µg/mL into
  MG/ML, a thousand-fold error introduced by styling. Wrap units inside
  uppercased labels in `.unit`.
