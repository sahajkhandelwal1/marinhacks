# VIGIL

The monitor in every operating room measures whether the brain is talking to
itself. We measure whether the brain is still listening to the room.

Full product spec, algorithms, roles, timeline, and pitch: [`vigil-prd.md`](./vigil-prd.md).

## Structure

```
data/       JSON fixtures matching the frontend data contract (PRD §6).
            Hand-faked to start — sine waves and random walks — so frontend
            is never blocked. Regenerate with scripts/generate_fake_data.py.
frontend/   Topomap, slider, dual readout, two-patient view, deploy. (Owner: A)
pipeline/   Chennu download, MNE loading, condition/responsive labels. (Owner: B)
scripts/    SDP computation, JSON emitter, subject selection. (Owner: integration)
slides/     Pitch deck and script.
```

## Data contract

One JSON file per subject per condition. See PRD §6 for the full schema.
`ci` is `null` until/unless Tier 1 (Coupling Index) ships — the frontend
should render a greyed `NOT MEASURED` panel in that case, which is itself
part of the pitch.

## Status

Pre-event. See the planning notes for confirmed findings and open risks
before build day — most importantly: **Tier 1 (CI) is not computable on the
public Chennu release** (resting-state only, no stimulus-locked markers
survive the BIDS conversion). Tier 0 is unaffected.

## Regenerating fake data

```
python3 scripts/generate_fake_data.py
```
