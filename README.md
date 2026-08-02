# VIGIL

The monitor in every operating room measures whether the brain is talking to
itself. We measure whether the brain is still listening to the room.

Full product spec, algorithms, roles, timeline, and pitch: [`vigil-prd.md`](./vigil-prd.md).

## Structure

```
data/       JSON matching the frontend data contract (PRD §6). Currently
            emitted from synthetic EEG via scripts/emit_json.py — real SDP/
            topo math, fake signal — so frontend is never blocked.
frontend/   Topomap, slider, dual readout, two-patient view, deploy. (Owner: A)
preview/    Minimal dev viewer (not the real frontend) — open preview/index.html
            via a local static server to sanity-check data/*.json visually.
pipeline/   Chennu download, MNE loading, condition/responsive labels. (Owner: B)
            Scaffolded and verified against the real dataset's file structure,
            not yet run — see pipeline/README.md.
scripts/    sdp.py (SDP + topo computation), emit_json.py (JSON emitter,
            synthetic EEG for now), generate_fake_data.py (original hour-0
            hand-fake, superseded by emit_json.py but kept as a fallback).
slides/     Pitch deck and script.
```

## Data contract

One JSON file per subject per condition. See PRD §6 for the full schema.
`ci` is `null` until/unless Tier 1 (Coupling Index) ships — the frontend
should render a greyed `NOT MEASURED` panel in that case, which is itself
part of the pitch.

## Status

Pre-event. Confirmed directly against the real dataset's files (not just
docs): **Tier 1 (CI) is dead** — every run's `events.tsv` has only 10s
epoch-boundary markers, no per-trial stimulus timing. Tier 0 is unaffected,
and the frontal channel names (`Fp1, Fp2, F3, F4, Fz`) the PRD's SDP formula
assumes are present directly in the real montage — no translation needed.
See `pipeline/README.md` for details and the verified public download URL.

## Regenerating data

```
python3 scripts/emit_json.py           # real SDP/topo math on synthetic EEG
python3 scripts/generate_fake_data.py  # original hand-faked fallback
```
