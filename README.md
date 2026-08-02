# VIGIL

The monitor in every operating room measures whether the brain is talking to
itself. We measure whether the brain is still listening to the room.

Full product spec, algorithms, roles, timeline, and pitch: [`vigil-prd.md`](./vigil-prd.md).

## Structure

```
data/                JSON matching the frontend data contract (PRD §6).
  synthetic/          20 subjects x 4 conditions + subjects.csv — the
                      canonical set frontend should build against. Real
                      SDP/topo math on synthetic EEG.
  simulated/          5 precomputed Brian2 network buckets (depth 0-100),
                      illustrative only, NOT patient data. Powers the
                      supplementary "simulated cortical population" panel.
  *.json (root)       Original 2-subject (S00/S01) hour-0 bootstrap set.
                      Superseded by synthetic/, kept for reference.
frontend/   Real Next.js app (Owner: A) — topomap, dual SDP/CI readout, EEG
            trace, simulated-network panel. See frontend/README.md for
            exactly which data files/subjects to use. Still needed: full
            condition slider, two-patient view.
preview/    Minimal dev viewer (not the real frontend) — open preview/index.html
            via a local static server to sanity-check data/*.json visually.
pipeline/   Chennu download, MNE loading, condition/responsive labels. (Owner: B)
            Scaffolded and verified against the real dataset's file structure,
            not yet run — see pipeline/README.md.
scripts/    sdp.py (SDP + topo computation, MIDPOINT/SCALE-normalized),
            emit_json.py (JSON emitter), simulate_network.py (Brian2
            illustrative panel data), find_money_plot.py (ranks
            responsive/non-responsive pairs by SDP gap), validate.py
            (checks SDP against real Sleep-EDF sleep-stage data, not yet
            run), null_ci.py (fabricated-ci fixer, in case it regresses).
slides/     Pitch deck and script.
```

## Data contract

One JSON file per subject per condition. See PRD §6 for the full schema.
`ci` is `null` until/unless Tier 1 (Coupling Index) ships — the frontend
should render a greyed `NOT MEASURED` panel in that case, which is itself
part of the pitch. Confirmed `null` everywhere as of the last check —
`scripts/null_ci.py` exists because a fabricated-ci regression already
happened once.

## Simulated network panel (supplementary, illustrative)

`scripts/simulate_network.py` (Brian2, LIF neurons) precomputes 5 depth
buckets showing a small population shift from independent/desynchronized
firing toward shared-slow-wave/synchronized bursting — the same story SDP
tells at the scalp, illustrated one level down. Not derived from any
patient data. The frontend panel is explicitly labeled `SIMULATED — NOT
PATIENT DATA` and must stay that way — this is a visual/narrative aid, not
a second data source to conflate with real SDP/CI.

## Money-plot pair (PRD §3/§8's closing move)

`scripts/find_money_plot.py` found **S02 (responded) vs S04 (did not
respond)** in `data/synthetic/` at `moderate` — SDP gap ~0. Rerun it
whenever the underlying data changes (new synthetic set, or once real
Chennu data lands) — this pairing isn't guaranteed to stay best.

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
