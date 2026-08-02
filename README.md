# PROBE

**Patient Response Observation Brain Encoder**

The monitor in every operating room measures whether the brain is talking to
itself. We measure whether the brain is still listening to the room.

Roughly **1 in 3** surgical patients, when someone actually checks with the
isolated forearm technique, responds to spoken command during general
anesthesia (393/1,131, IFT meta-analysis, BJA 2018). Spontaneous recall is
about 1 in 20,000. The monitor in the room said they were unconscious — and
the frontal alpha–delta pattern clinicians read as proof of unconsciousness is
present in the patients who respond (Gaskell et al., BJA 2017).

Depth-of-anesthesia monitors summarize the brain's **intrinsic rhythm**.
Consciousness of the room is a **relational** property. PROBE is a proposal for
measuring the second thing, and a working demonstration of why the first thing
is not enough.

## Documentation

| Document | Purpose |
|---|---|
| [`TECHNICAL_BRIEF.md`](./TECHNICAL_BRIEF.md) | **Start here.** Full technical brief — evidence, algorithms, what is real vs simulated, limitations, roadmap. Source material for a pitch or research video. |
| [`probe-prd.md`](./probe-prd.md) | Original product spec: evidence table, scope tiers, pitch structure, Q&A prep. |
| [`frontend/README.md`](./frontend/README.md) | UI architecture, rendering, color and typography decisions. |
| [`pipeline/README.md`](./pipeline/README.md) | Chennu dataset findings and the verified download path. |

## Quickstart

```bash
# Python — index computation, data generation, mesh export
python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt
./.venv/bin/python scripts/sdp.py                       # SDP self-test
./.venv/bin/python scripts/generate_synthetic_dataset.py # 20 subjects x 4 conditions
./.venv/bin/python scripts/null_ci.py data/synthetic/*.json

# Frontend — bundles data, then serves
cd frontend && npm install && npm run dev
```

Then open <http://localhost:3000>. Note the cortical mesh is 524 KB and takes a
few seconds to fetch and parse on first load; the gallery cards fill in after
it lands.

## What you are looking at

| Route | What it is |
|---|---|
| `/` | Scroll-driven dive: the problem, the two-patient comparison, the cohort, and the honesty badges. Deliberately dark against the clinical workspace it leads into. |
| `/cases` | Case gallery — five exemplars, four unambiguous and one that breaks the pattern. |
| `/monitor` | Single patient: cortical surface, SDP, CI panel, reconstructed trace, scrubbable timeline. |
| `/monitor#compare` | Two patients, same drug, opposite outcomes. Presets to the widest SDP separation so the difference is visible on arrival; the caption says so and points at the closest pair, which is the case the monitor genuinely cannot call. Both patients selectable. |
| `/monitor#manual` | Intervention sandbox. |

A **Synthetic / Real** toggle in the header switches the whole workspace between
the two datasets at runtime. Both ship in every build — this is an A/B
comparison, not a replacement.

## The two numbers

- **SDP — Spectral Depth Proxy.** What today's monitors compute. Welch PSD over
  frontal channels, log alpha/delta ratio, anchored to the patient's own awake
  baseline, median filtered. Explicitly **not** BIS.
- **CI — Coupling Index.** How much of this patient's EEG is still explained by
  what is happening in the room, relative to their own baseline. **Not
  implemented** — see below.

Per-patient baselining is the design insight: individual variability in
anesthetic susceptibility is what defeated depth monitoring for thirty years,
and every patient sits in pre-op with electrodes already attached. That makes
this anomaly detection against a personal baseline rather than classification
against population norms — which also means no supervised dataset of awareness
at 0.1% prevalence is required.

## What is real and what is not

The project's credibility rests on this being stated plainly rather than
buried. The UI carries these labels on screen.

| Component | Status |
|---|---|
| SDP algorithm | **Real.** Runs as described. |
| Cortical geometry | **Real.** fsaverage5 pial surface, MRI-derived FreeSurfer template, 20,484 vertices, 152 Destrieux parcels. |
| Spiking network panel | **Real simulation** (Brian2 LIF) of a synthetic population — not a patient. |
| Underlying EEG | **Synthetic.** Real math over generated signal. |
| Cortex coloring | **A projection, not a localization.** Scalp values painted on cortex; no inverse problem is solved. |
| EEG trace | **Reconstructed** from SDP and the per-channel alpha index. Not sample-for-sample EEG. |
| CI | **Not measured.** Null everywhere. |

**Why CI is null.** Direct inspection of the public Chennu release — the actual
`events.tsv` files, not the documentation — shows only 10-second
epoch-boundary markers. No per-trial stimulus timing survives the BIDS
conversion, so CI is not computable on this dataset. The greyed **NOT
MEASURED** panel is not a TODO; it is what every operating room reports today.

`scripts/null_ci.py` exists because fabricated CI values were caught and
removed three separate times. If you regenerate the dataset, run it again.

## Real EEG (`data/real/`)

The workspace now carries a second dataset: **real** EEGLAB-format propofol
sedation recordings, same 20 subjects and 4 conditions, run through the same
`scripts/sdp.py` math. Source recordings live in `data/new data/` — local and
gitignored; the emitted JSON is committed.

- `pipeline/load_local_eeglab.py` — loads `.set`/`.fdt` epochs via
  `mne.io.read_epochs_eeglab`, concatenates per condition, derives the
  responsive/drowsy label from `datainfo.mat` correct-response counts using the
  same `hit_rate >= 0.6` rule as `pipeline/load.py`.
- `scripts/emit_real_json.py` — emits `data/real/*.json` on the same §6
  contract as the synthetic set.

**One deliberate deviation, and it is a genuine finding.** SDP's alpha/delta
ratio is computed from **posterior** channels (`O1, O2, P3, P4`) rather than the
frontal set. On real EEG the frontal channels fail to separate baseline from
moderate sedation — mean log-ratio change ≈ 0, correct direction in only 10/20
subjects. That is not a bug: it is *anteriorization*, the known propofol
signature in which frontal alpha **increases** as consciousness drops (Purdon et
al. 2013, Cimenser et al. 2011), which fights a naive "less alpha = deeper"
formula at exactly the frontal electrodes. Posterior channels show the textbook
decrease cleanly — 18/20 subjects, mean drop +0.44 log₁₀ units.

Two things worth noting about that. It independently corroborates the
anteriorization encoded in the synthetic generator, arrived at from the opposite
direction. And it is why `sdp.py` takes the channel list as a parameter rather
than hardcoding it — the module docstring says so.

All 12 montage channel names are present verbatim in the real 91-channel
recordings, so no remapping was needed. `drug_concentration_ug_ml` is `null`
throughout — no dosage figure ships with this dataset.

## Repository layout

```
scripts/       sdp.py                       SDP + per-channel topography
               generate_synthetic_dataset.py 20 subjects x 4 conditions
               emit_json.py                 SDP -> §6 JSON contract
               export_brain_mesh.py         fsaverage5 cortex -> binary
               simulate_network.py          Brian2 LIF population
               pick_exemplars.py            chooses the gallery cases
               find_money_plot.py           ranks responder/non-responder pairs
               validate.py                  SDP vs Sleep-EDF (not yet run)
               null_ci.py                   strips fabricated CI
               emit_real_json.py            real EEG -> §6 JSON contract
pipeline/      load_local_eeglab.py — EEGLAB loader for data/new data/
               download.py, load.py — Chennu BIDS ingest. Verified against
               the live archive, NOT yet run.
data/          synthetic/  20 subjects x 4 conditions + subjects.csv
               real/       same shape, from real EEGLAB recordings
               brain/      cortex.bin + manifest (fsaverage5)
               simulated/  5 Brian2 depth buckets
               exemplars.json, plus the superseded 2-subject bootstrap set
frontend/      Next.js 15 / React 19 / three.js. public/data is generated.
preview/       Standalone dev viewer, superseded by frontend/
slides/        Deck and script
```

## Key results

Awake versus sedated is not subtle and SDP handles it: **97 vs 19**. Per
condition the cohort spans baseline 79–97, mild 45–89, moderate 19–66,
recovery 62–92 — roughly the full 0–100 scale, with the widest spread under
drug where anesthetic susceptibility actually differs. The cortex shows alpha
anteriorization: occipital when awake, frontal under propofol.

Responder versus non-responder at the same 1.2 µg/mL is where it fails. Two
patients can differ by **47 SDP points** in either direction, and the closest
matched pair differs by **0.5 points** with opposite behavioral outcomes.
Across the cohort the best single SDP threshold classifies at **70% against a
65% majority baseline** — five points above chance, i.e. a real
population-level difference that is useless for calling an individual
patient.

That is the argument. Not that spectral monitors are broken, but that they
answer a different question than the one that matters.

## Regenerating

Anything derived can be rebuilt. Order matters — the money pair and exemplars
depend on the dataset:

```bash
./.venv/bin/python scripts/generate_synthetic_dataset.py
./.venv/bin/python scripts/null_ci.py data/synthetic/*.json
./.venv/bin/python scripts/find_money_plot.py data/synthetic   # update MONEY_PAIR
./.venv/bin/python scripts/pick_exemplars.py
./.venv/bin/python scripts/export_brain_mesh.py                # only if mesh changes
./.venv/bin/python scripts/simulate_network.py                 # only if sim changes
cd frontend && npm run bundle:data
```

`MONEY_PAIR` lives in `frontend/src/state/monitor.tsx` and is shared by the
landing dive, gallery, and compare view. It is currently set to the **widest**
SDP separation (S08 responded, 66 · S10 did not, 19) so the contrast reads
immediately. `find_money_plot.py` reports the **tightest** pair — the one SDP
cannot call — which is the stronger argument and is one selection away in the
UI. Neither pairing survives regeneration unchanged, so re-run the script and
update the constant.

## Status and limitations

- **Synthetic EEG throughout.** The real Chennu ingest is written and verified
  against the live archive but has not been run. No claim here has been tested
  on patient recordings.
- **CI is unimplemented** — the central proposition is unmeasured.
- **No ambient-audio pipeline exists.** The OR microphone input central to the
  concept is not built.
- **n=20, healthy volunteers, propofol sedation** — not surgical anesthesia, no
  neuromuscular blockade, no surgical stimulus.

Next steps and the full CI recipe are in
[`TECHNICAL_BRIEF.md`](./TECHNICAL_BRIEF.md) §8.
