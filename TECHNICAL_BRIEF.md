# PROBE — Technical Brief

**Patient Response Observation Brain Encoder**

*A monitor for whether an anesthetized brain is still tracking the room.*

This document is the source material for a pitch, a research video, or a
written submission. It states what the system does, how each number is
computed, and — in its own section, not a footnote — exactly which parts are
measured, which are simulated, and which are neither.

Companion documents: [`probe-prd.md`](./probe-prd.md) (product spec, evidence
table, pitch structure), [`frontend/README.md`](./frontend/README.md)
(architecture), [`pipeline/README.md`](./pipeline/README.md) (dataset
findings).

---

## 1. The problem

General anesthesia is supposed to do two things: prevent experience, and
prevent memory. It reliably does the second. The evidence that it does the
first is weaker than almost anyone assumes.

| Finding | Rate | Source |
|---|---|---|
| Awareness by spontaneous patient report | ~1 : 19,600 | NAP5 (Pandit et al., 2014) |
| Awareness by structured post-op interview | ~1 : 600 | Brice-protocol studies |
| With a neuromuscular blocker | ~1 : 8,200 | NAP5 |
| Without a neuromuscular blocker | ~1 : 135,900 | NAP5 |
| During Caesarean section | ~1 : 670 | NAP5 |
| Occurring at induction or emergence | 66% of cases | NAP5 |
| Judged preventable | 73.6% | NAP5 |
| **Responded to spoken command during surgery (isolated forearm technique)** | **393 / 1,131 = 34.8%** | **IFT meta-analysis, BJA 2018** |
| Responded after intubation, of whom 5/12 signalled *pain* | 4.6% | Sanders et al., Anesthesiology 2017 |

The two rates that matter sit at opposite ends of that table. Spontaneous
recall is roughly 1 in 20,000. Responsiveness to command, when someone
actually checks, is roughly **1 in 3**. The gap between them is the subject of
this project.

### The technical fact the product rests on

Gaskell et al. (BJA 2017) examined raw EEG in patients who responded to
command during surgery, and found the frontal alpha–delta pattern — the
signature clinicians read as proof of unconsciousness — was present in them.
The paper is titled *"Frontal alpha-delta EEG does not preclude volitional
response during anaesthesia."*

This is why depth-of-anesthesia monitors have never convincingly reduced
awareness in randomized trials. They summarize the brain's **intrinsic
rhythm**. Consciousness of the room is a **relational** property — whether the
brain is tracking external input — and no deployed monitor measures it.

### The caveat, stated before a judge states it

IFT responsiveness is not the same as suffering. Most responders have no
recall. The defensible claim is *"connected consciousness is orders of
magnitude more common than recall, and current monitors cannot see it"* — not
*"one in three patients is being tortured."* The defensible claim is still the
interesting one.

---

## 2. The proposition

**Inputs, both already present in every operating room:** frontal EEG
(electrodes are already on the patient) and ambient audio (there is already a
microphone in the room).

**Output: two numbers, side by side.**

- **SDP — Spectral Depth Proxy.** What today's monitors compute. Intrinsic
  rhythm only.
- **CI — Coupling Index.** How much of this patient's EEG is still explained
  by what is happening in the room, relative to their own awake baseline.

Two design decisions carry the concept:

**Per-patient baselining.** Individual variability in anesthetic
susceptibility is what has defeated depth monitoring for thirty years. Every
patient sits in pre-op holding with electrodes already attached — a free,
personalized awake calibration. Population norms become unnecessary.

**Anomaly detection, not classification.** You will never assemble a
supervised dataset of awareness at 0.1% prevalence. Because CI is measured
against the patient's own baseline, no such dataset is required. And where
labels *are* wanted, IFT supplies them at ~30% prevalence instead of 0.1% —
two orders of magnitude fewer patients per trial.

---

## 3. What exists today

32 commits, three contributors. Roughly 1,500 lines of Python and 4,800 lines
of TypeScript across 49 components.

### 3.1 SDP — Spectral Depth Proxy

`scripts/sdp.py`. A documented proxy, explicitly **not** BIS, which is
proprietary and not reimplemented here.

```
per 2-second window, 50% overlap, frontal channels (Fp1, Fp2, F3, F4, Fz):
  1. Welch PSD, 0.5–45 Hz
  2. band powers: delta 0.5–4, theta 4–8, alpha 8–13, beta 13–30 Hz
  3. r = log10(alpha_power / delta_power)
  4. SDP = 100 * sigmoid((r - (mu - MIDPOINT)) / SCALE)
       mu is fit on THIS SUBJECT's own baseline recording
  5. median filter over 5 windows
```

**One deliberate deviation from the spec**, documented in the module and worth
stating aloud rather than hiding: the PRD specifies normalizing by the
baseline's own standard deviation. In practice that sigma is tiny when a
baseline is short or low-noise, which saturates the sigmoid to 0 or 100 for
any real condition shift and destroys the graded 0–100 reading. `MIDPOINT` and
`SCALE` are fixed constants instead. The per-patient anchor — the actual
product thesis — is retained via `mu`.

Validated across four sedation levels, cohort ranges: **baseline 79–97, mild
45–89, moderate 19–66, recovery 62–92.** Between-subject spread is scaled by
condition — narrow when everyone is awake (a ceiling effect), widest under
drug, which is where anesthetic susceptibility actually varies.

An independent check exists but has not been run: `scripts/validate.py` scores
SDP against Sleep-EDF's expert-labeled sleep stages (Wake → N1 → N2 → N3),
which is real, freely available, graded-arousal EEG. If SDP falls monotonically
across those stages, the band-power math is sound independently of anything in
this repo.

### 3.2 Scalp topography

Per-electrode alpha power, min-max normalized against the same subject's
baseline range. Drives the cortical surface color and the 2D field.

### 3.3 The 3D cortex

`scripts/export_brain_mesh.py` exports the **fsaverage5 pial surface** —
FreeSurfer's standard MRI-derived template brain — plus the Destrieux atlas,
via nilearn. **20,484 vertices, 40,960 faces, 152 named anatomical parcels**,
packed into a 524 KB binary (positions f32, indices u16, sulcal depth u8,
parcel labels u8) with a JSON manifest.

Real gyri and sulci, not a wrinkled sphere. Sulcal depth drives fold shading
so anatomy reads independently of scene lighting. Electrode values are
projected onto vertices by inverse-distance weighting from electrode
directions, precomputed once per mesh so per-frame recolor is a weighted sum.

### 3.4 Simulated cortical population

`scripts/simulate_network.py`. A 60-neuron leaky integrate-and-fire network
(Brian2), precomputed at five depth levels. As depth rises, firing shifts from
independent and noise-driven toward a shared ~1.5 Hz slow-wave drive —
synchronized bursts with quiet gaps between, rather than generalized
hyperactivity. Rate CV climbs 0.30 → 1.66 across the range while mean rate
stays modest.

This illustrates, one level below the scalp, the same
desynchronization-to-synchronization story SDP reads from EEG. It is not
derived from any patient and is labeled as such on screen.

### 3.5 Interface

Next.js 15 / React 19 / three.js. Light clinical theme, one accent hue, with
the alert color reserved for the single status that matters. Every
visualization except the cortex is a hand-written canvas renderer — no
charting dependency.

- **Landing dive** (`/`) — a scroll-driven sequence over the cortical surface,
  deliberately dark against the light clinical workspace it leads into. Ends
  on the same honesty badges the workspace carries: REAL SDP math, SYNTHETIC
  waveforms, PROJECTION cortical heatmap, NOT MEASURED coupling index.
- **Case gallery** (`/cases`) — five exemplar recordings chosen by
  `scripts/pick_exemplars.py`: two unambiguously awake, two unambiguously
  sedated, and then one that breaks the pattern.
- **Monitor** — rotating cortical surface, SDP hero readout, CI panel,
  reconstructed EEG trace, scrubbable timeline, cohort roster.
- **Two patients** — the closing move. Same drug concentration, two cortices
  pinned to an identical fixed viewpoint, SDP within a fraction of a point,
  opposite behavioral outcomes. Either patient is operator-selectable, and the
  summary line is derived from the actual pair rather than asserted, so the
  disagreement claim is only made when the outcomes genuinely disagree.
- **Manual mode** — an interactive intervention sandbox.

The money pair is a single shared constant (`MONEY_PAIR` in
`src/state/monitor.tsx`), so the landing dive, the gallery, and the compare
view cannot drift onto different patients. Re-run
`scripts/find_money_plot.py` whenever the dataset is regenerated — the tightest
pairing is not guaranteed to stay the same.

Playback runs on a transport clock that writes into a `Float32Array` which the
three.js loop reads on its own schedule, so scrubbing a five-minute recording
never re-renders the React tree.

### 3.6 Data pipeline

Two paths. `pipeline/load_local_eeglab.py` + `scripts/emit_real_json.py`
**have been run**: they load real EEGLAB `.set`/`.fdt` sedation recordings,
derive the responsive/drowsy label from `datainfo.mat` correct-response counts
on the same `hit_rate >= 0.6` rule, and emit `data/real/` on the §6 contract.
Source recordings are local and gitignored; the emitted JSON is committed.

`pipeline/download.py` and `pipeline/load.py` remain scaffolded against the
Chennu BIDS mirror and have not been run — the local EEGLAB copy made them
unnecessary for now.

**A finding from the real data.** SDP's alpha/delta ratio there is computed
from *posterior* channels, not frontal. On real EEG the frontal channels fail
to separate baseline from moderate sedation — mean log-ratio change ~0, correct
direction in only 10/20 subjects — because propofol *increases* frontal alpha
even as consciousness drops (anteriorization; Purdon et al. 2013, Cimenser et
al. 2011). Posterior channels show the textbook decrease in 18/20 subjects.
This corroborates, from real recordings, the anteriorization the synthetic
generator encodes by design, and it is why `sdp.py` takes the channel list as
a parameter.

**Calibration.** `sdp.py`'s default MIDPOINT/SCALE were fitted on its synthetic
self-test and compress real recordings into 61-97, with baseline and moderate
under 7 points apart. `emit_real_json.py` carries constants fitted to the real
effect size (the recovered per-subject `r - mu` spans -1.15 to +0.31 log10
units), putting the real cohort across 5-100.

---

## 4. What is real, what is not

This section is the reason the rest of the document is trustworthy. It should
appear in the video.

| Component | Status |
|---|---|
| SDP algorithm | **Real.** Welch PSD, alpha/delta ratio, per-subject baseline anchoring. Runs as described. |
| Cortical geometry | **Real.** fsaverage5, MRI-derived FreeSurfer template. |
| Anatomical parcellation | **Real.** Destrieux atlas, 152 named regions. |
| Spiking network | **Real simulation.** Brian2 LIF dynamics, honestly computed — of a synthetic population, not a patient. |
| Underlying EEG | **Both.** A real EEGLAB propofol sedation set (20 subjects, `data/real/`) and a synthetic set, switchable at runtime. The synthetic set predates the real recordings arriving. |
| Cortical surface coloring | **A projection, not a localization.** Electrode values are *scalp* measurements; painting them on cortex solves no inverse problem. Labeled on screen, permanently, in the alert color. |
| EEG trace | **Reconstructed.** The data contract deliberately does not ship raw 250 Hz EEG. The trace is rebuilt from SDP and the per-channel alpha index. It tracks the real index values; it is not the patient's EEG sample for sample. |
| CI | **Not measured.** Null in every fixture. |

### Why CI is null, and why that is part of the argument

Tier 1 was intended to compute CI on stimulus-locked recordings. Direct
inspection of the public Chennu release — the actual `events.tsv` files, not
the documentation — shows only 10-second epoch-boundary markers and a couple
of generic triggers per run. **No per-trial stimulus timing survives the BIDS
conversion.** The auditory discrimination task exists only as summary
behavioral metrics in `scans.tsv`.

CI is therefore not computable on this dataset, and the panel reads **NOT
MEASURED**. That greyed panel is not a TODO. It is what every operating room
reports today.

---

## 5. What the demo shows

### 5.1 SDP works where the question is easy

Awake versus sedated is not subtle, and SDP handles it: **97 versus 19** on a
0–100 scale. The cortex tells the same story anatomically — awake eyes-closed
alpha is occipital, and under propofol the peak migrates frontal. That is
alpha anteriorization, the classic propofol signature. Awake brains glow at
the back; sedated brains glow at the front.

### 5.2 SDP fails where the question matters — and fails harder on real data

**On the real recordings, a single SDP threshold classifies responders at 65%
against a 65% majority baseline: exactly chance.** Responders average 48.9,
non-responders 51.3 — the patients who did *not* respond read marginally
*higher*. Whatever SDP measures on real EEG, it carries no information about
whether the patient was answering questions.

The synthetic cohort below was built before those recordings arrived and is
kept as an A/B reference; it is deliberately a little kinder to SDP (70% versus
a 65% baseline).


At a fixed 1.2 µg/mL, SDP is not merely imprecise — it is unordered with
respect to outcome. The default comparison shows two patients **47 points
apart** (19 versus 66) where the higher reading belongs to the responder; the
closest matched pair differs by **0.5 points** with opposite outcomes; and
pairs exist where the non-responder reads a full 13 points *more awake* than
the patient who was answering questions.

Across the full cohort of 20, the groups overlap so heavily that the best
single SDP threshold classifies at **70% against a 65% majority baseline** —
five points above chance, which is another way of saying useless for calling
an individual patient.

There is a real population-level difference, because a patient who still
responds at a fixed concentration is by definition less deeply anesthetized. **A population-level difference that
cannot call an individual patient is exactly the failure mode the product
addresses.**

### 5.3 The closing line

Same drug. Same depth reading. Opposite behavior. The monitor is not wrong
about the rhythm — the rhythm is not the question.

---

## 6. Engineering notes worth telling

Findings that make good video content because each one is a case of the demo
nearly lying and being caught.

**Fabricated CI values, three times.** Synthetic fixtures shipped
plausible-looking CI numbers (0.49, 0.711) that were never computed from any
coupling model. Caught and nulled on each occasion; `scripts/null_ci.py` exists
because it recurred. The generator should emit null at source.

**The whole scalp lit up over a recording.** Reported as "the brain gets
brighter by the end." It was not accumulation in the renderer — the generator
drove topography with a free random walk whose sigma over 3,000 frames was
~0.63, far wider than its own [0,1] range, so channels drifted into the clamp
and pinned at 1.0. Replaced with a mean-reverting process. Mean topography now
holds flat end to end.

**Topography carried no information about depth.** SDP varied 87 → 39 across
conditions while mean topo sat flat at 0.503 versus 0.517. A "clearly awake"
and "clearly under" brain rendered identically. Fixed by encoding real alpha
anteriorization, which is both more accurate and more legible.

**Faster playback made it slower.** Shrinking the frame interval produced 4.7
frames/sec and froze the renderer outright. Each tick was a React state update
recoloring 20k vertices. Capping ticks at 12 Hz and stepping several frames
per tick — plus hoisting constant tissue color out of the per-frame path —
gave 122 frames/sec, a ~26× improvement.

**A caption that became false.** The two-patient view asserted "same depth
reading, opposite behavior." Safe while the pair was hardcoded; flatly wrong
once an operator could select two responders. The line is now derived from the
actual pair, and the disagreement claim is made only when the outcomes
genuinely disagree and the SDP gap is genuinely small.

**A request to widen the gap.** The responder/non-responder SDP difference was
asked to be enlarged "even if it isn't completely true." It was not. What the
investigation did surface was a real defect: responsiveness had been assigned
statistically *independent* of SDP, so the visible difference was sampling
noise rather than an effect. The corrected version gives responders a
physiologically motivated lift, sized deliberately so that individual
variability still dominates — a first attempt at lift 8 against spread 9
produced 85% threshold accuracy, which would have argued that spectral
monitors work.

---

## 7. Limitations

- **Real recordings are in, but are healthy-volunteer sedation, not surgery.**
  20 subjects of real EEGLAB propofol sedation now drive the workspace
  alongside the synthetic set. No neuromuscular blockade, no surgical stimulus,
  and no dosage figure ships with them (`drug_concentration_ug_ml` is null).
- **The synthetic set remains synthetic** and is retained for A/B comparison,
  not as evidence.
- **CI is unimplemented.** The central proposition is unmeasured. The
  Chennu release cannot support it; a stimulus-locked dataset
  (Bekinschtein/Dehaene lineage) or new collection is required.
- **The cortex is a projection.** No source localization is performed.
- **No ambient-audio pipeline exists.** The OR-microphone input central to the
  concept is not built.
- **n=20, healthy volunteers, propofol sedation** — not surgical anesthesia,
  no neuromuscular blockade, no surgical stimulus.

---

## 8. What comes next

**Immediate.** Run `pipeline/download.py` and `load.py` against the real
Chennu release; swap synthetic arrays for real ones in `emit_json.py::main()`
(no other change required — same schema). Run `scripts/validate.py` against
Sleep-EDF for an independent check of the band-power math.

**CI, properly.** Requires stimulus-locked recordings. Standard
encoding-model setup: stimulus audio → embeddings (Wav2Vec2-BERT or a Whisper
encoder), lagged design matrix 0–500 ms, ridge regression fit on the awake
baseline only, frozen, then applied per condition. CI = correlation ratio
against baseline. Where no continuous audio exists but event markers do,
degrade to late-window ERP amplitude (300–600 ms), which is weaker but tells
the same story.

**Validation path.** IFT-labeled cohorts at ~30% prevalence rather than
awareness at 0.1%. Retrospective risk-flagging over VitalDB-scale archives
before any prospective alarm.

**Deployment posture.** Not an FDA Class III alarm on day one. A retrospective
research tool first: prove the epidemiology, then earn the alarm.

---

## 9. Anticipated questions

**"BIS exists, and the trials were equivocal."** Because BIS measures the
wrong thing, and the IFT literature demonstrates it. Alpha-delta coexists with
command-following.

**"34.8% means your alarm never stops."** Which is why the output is graded and
time-windowed to induction and emergence, where two-thirds of cases occur.
Decision support, not a klaxon.

**"What if you tell someone they were aware and they were not?"** Disclosure of
awareness is itself a psychological intervention. Output goes to the
anesthesiologist during the case, not to the patient afterward.

**"What did you actually build?"** The index, the interface, and the analysis
pipeline. What runs today is SDP over synthetic recordings on a real cortical
surface. What does not exist is the OR audio pipeline, CI, and any validation
on patient data. That boundary is on screen in the product, not only in this
document.

---

## 10. The general claim

The surgical case is the wedge because it has 300M+ annual procedures and a
named malpractice category. The broader proposition is a **consciousness index
that works on ambient stimuli** — no controlled paradigm, no clicks and beeps,
just whatever is already happening in the room. That generalizes to ICU
sedation, disorders of consciousness, pediatric anesthesia, and locked-in
assessment.

Which is also the argument for keeping every number here real. **34.8% is not
improvable.**

---

*Reproduce anything in this document:*
`pip install -r requirements.txt` · `python3 scripts/sdp.py` (self-test) ·
`python3 scripts/generate_synthetic_dataset.py` · `python3
scripts/find_money_plot.py data/synthetic` · `cd frontend && npm run dev`
