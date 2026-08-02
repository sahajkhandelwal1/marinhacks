# PROBE

**Patient Response Observation Brain Encoder**

The monitor in every operating room measures whether the brain is talking to
itself. We measure whether the brain is still listening to the room.

Full product spec, algorithms, roles, timeline, and pitch: [`probe-prd.md`](./probe-prd.md).

## Structure

```
data/                JSON matching the frontend data contract (PRD §6).
  synthetic/          20 subjects x 4 conditions + subjects.csv — the
                      canonical set frontend should build against. Real
                      SDP/topo math on synthetic EEG.
  real/               Same 20 subjects x 4 conditions + subjects.csv, but
                      real EEGLAB sedation recordings (data/new data/,
                      gitignored, local-only) run through the same
                      real SDP/topo math. See "Real data" below.
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

## Real data (A/B branch, `data/real/`)

`data/new data/Sedation-RestingState/` is a local, gitignored, EEGLAB-format
(`.set`/`.fdt`) copy of the same Chennu-style propofol sedation study: 20
subjects (`02,03,05,06,07,08,09,10,13,14,18,20,22,23,24,25,26,27,28,29`),
4 conditions each, plus `datainfo.mat` (per-run correct-response counts,
used for the responsive/drowsy label exactly like `pipeline/load.py`'s
`hit_rate >= 0.6` on the moderate run). `.set` files are epoched (one epoch
per trial), loaded via `mne.io.read_epochs_eeglab` and concatenated into a
continuous recording per condition.

- `pipeline/load_local_eeglab.py` — loader, writes `.npy` arrays to
  `pipeline/arrays_real/` (gitignored, regenerate locally).
- `scripts/emit_real_json.py` — emitter, writes `data/real/*.json` +
  `subjects.csv` (committed, same contract as `data/synthetic/`).

All 12 montage channel names (`Fp1, Fp2, F3, F4, Fz, C3, C4, Cz, P3, P4,
O1, O2`) are present verbatim in the real 91-channel recordings — verified
directly, no remapping needed. One deliberate deviation from
`scripts/emit_json.py`: the SDP alpha/delta ratio is computed from
posterior channels (`O1, O2, P3, P4`), not the literal frontal set. Checked
directly: frontal channels don't separate baseline from moderate sedation
on this real, unfiltered EEG (mean log-ratio drop ~0, only 10/20 subjects
in the expected direction) — a known propofol signature ("anteriorization":
frontal alpha *increases* under propofol even as consciousness drops,
Purdon et al. 2013). Posterior channels show the textbook decrease cleanly
(18/20 subjects, mean drop +0.44 log10 units). See the comment in
`scripts/emit_real_json.py` for the full writeup. `drug_concentration_ug_ml`
is `null` throughout — no dosage figure is available for this dataset.

The frontend ships both `data/synthetic/` and `data/real/` in every build
and toggles between them at runtime (Synthetic/Real control in the header,
`frontend/src/state/monitor.tsx`) — this is an A/B comparison, not a
replacement. `frontend/scripts/bundle-data.mjs` takes `DATA_SOURCE=synthetic|real`.

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

# Real data (needs data/new data/, local-only, gitignored):
python3 pipeline/load_local_eeglab.py  # -> pipeline/arrays_real/
python3 scripts/emit_real_json.py      # -> data/real/*.json + subjects.csv
```
