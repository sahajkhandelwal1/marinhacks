SynthNeuro — Diffusion-Based Synthetic Neurophysiological Data Generator

Status: Draft mini-PRD Owner: Max (data lead) Relates to: VIGIL (anesthesia awareness monitor) and future consciousness/neuro-signal projects

1. One-liner

A conditional diffusion model that generates realistic, labeled multichannel EEG (and related biosignal) windows — so that projects starved of rare-label data (e.g., "responsive under sedation," "aware during general anesthesia") can train and stress-test classifiers without waiting on more patients.

2. The problem

Every dataset we found in the data-gathering phase has the same shape: plenty of unlabeled or common-condition signal, and almost no examples of the rare, high-value state.

Chennu et al. gives 20 subjects total, and only a subset are behaviorally "responsive" at moderate sedation — single digits.
ds005620 gives 21 subjects and graded dream-report labels, but "had experience while unresponsive" is a minority class within a minority class.
Anesthesia awareness in the wild is ~1:19,600 by spontaneous report, ~1:600 by structured interview (NAP5) — real prevalence numbers make supervised learning close to impossible directly on clinical data.

This is the same problem VIGIL sidesteps by using per-patient baselining instead of population classification — but baselining only gets you an anomaly score, not a validated detector. To validate, tune thresholds, or build the next tier of models (e.g., a real CI classifier), we need many more labeled examples than any single open dataset provides, and we can't ethically or practically collect more awareness events.

Synthetic data is the standard workaround in every other data-scarce biosignal domain (ECG arrhythmia, rare sleep disorders) and diffusion models are now the strongest generative approach for time series of this kind — better mode coverage than GANs, more stable training, and an emerging open literature specifically on EEG (see prior art in the data-gathering doc).

3. Goals
Generate synthetic multichannel EEG windows conditioned on a target label (e.g., sedation level × responsiveness, or "aware" vs. "unaware").
Preserve the statistical properties that matter for downstream classification: band power ratios, spatial (topographic) structure, and — where the source data has it — temporal coupling to a stimulus.
Make it easy to 10–100x the effective size of a rare class without touching real patient identifiers.
Ship an evaluation suite that proves fidelity, not just visual plausibility — so nobody downstream trusts synthetic data blindly.
4. Non-goals (v1)
Not attempting to synthesize raw clinical-grade signal for regulatory/diagnostic use — research and prototyping only.
Not generating cross-modal data (e.g., simultaneous audio + EEG) in v1 — single-modality EEG first, biosignal generalization (ECG/EMG/PPG) later.
Not building a from-scratch foundation model — fine-tune/condition existing diffusion architectures on our aggregated open datasets rather than pretraining from zero.
Not solving the "does synthetic aware-under-anesthesia data even mean anything clinically" question — that's a validation task for the consuming project, not this tool.
5. Users
Primary: us — VIGIL-adjacent projects needing more labeled sedation/consciousness EEG for classifier development.
Secondary: anyone in the open neuro-ML community hitting the same class-imbalance wall (sleep staging, seizure detection, BCI responsiveness) — the tool should be dataset-agnostic, not hardcoded to Chennu/ds005620.
6. Data sources (from data-gathering phase)
Purpose	Dataset	Access
Primary training/conditioning signal	Chennu et al. 2016 propofol sedation	Cambridge Repository, CC BY 2.0 UK
Primary training/conditioning signal	OpenNeuro ds005620	CC0, via EEG-Dash
Real-world deployment-realism check	VitalDB (BIS/EEG tracks)	CC BY 4.0
Broader pretraining corpus (generalize beyond one paradigm)	EEG-Dash (791 datasets, ~86k hrs)	via eegdash package
Stimulus-locked structure (Tier 2 conditioning)	Cogitate Consortium iEEG/MEG-EEG	Open, BIDS

Class-imbalance note: "responsive under sedation" and "reported experience while unresponsive" are the target minority classes we most want to oversample synthetically.

7. System overview

Input representation: fixed-length multichannel windows (e.g., 2–10 s at native or resampled rate), per-channel z-scored per subject, retaining scalp position metadata so the model can learn spatial structure rather than treating channels as an unordered set.

Model: conditional denoising diffusion probabilistic model (DDPM) or latent diffusion (VAE encoder → diffusion in latent space, cheaper to train/sample) operating on the windowed signal. Conditioning vector includes:

sedation level / condition label (baseline, mild, moderate, recovery)
behavioral label (responsive / drowsy, or aware / unaware where available)
optionally subject-level baseline embedding, so generation can be "personalized" the same way VIGIL's SDP is per-subject baselined

Training loop (high level):

Load + harmonize windows across source datasets (montage remapping, resampling, filtering to a common band).
Train unconditional diffusion backbone on the pooled corpus (EEG-Dash-scale) for general EEG statistics.
Fine-tune / condition on the labeled subset (Chennu + ds005620) so the model can be steered toward rare classes.
Sample: generate N synthetic windows per target class, with the ability to interpolate between conditions (e.g., "just past the responsiveness threshold").

Output: synthetic windows in the same JSON/array contract style already used in VIGIL (per-subject, per-condition arrays + metadata), so they drop straight into existing downstream pipelines without a new data-loading path.

8. Evaluation plan (the part that earns trust)

Fidelity must be shown, not asserted. Three tiers, cheapest first:

Signal-statistics fidelity: band power distributions, spectral entropy, Lempel-Ziv complexity, and topographic (spatial) correlation, real vs. synthetic, per condition. (The open seege toolkit referenced in prior-art research is built for exactly this — reuse rather than rebuild.)
Discriminability test: can a simple classifier tell real from synthetic windows? Report AUC; closer to 0.5 is better.
Downstream utility (the metric that actually matters): train a responsiveness/awareness classifier on (a) real-only, (b) real + synthetic, (c) synthetic-only. Compare held-out real-data performance. Precedent from synthetic-ECG work: real+synthetic beats real-only; synthetic-only alone underperforms — expect the same pattern here, and report it honestly if it holds.
9. Scope tiers

Tier 0 — must ship Unconditional diffusion model trained on pooled Chennu + ds005620 windows, producing plausible single-channel or few-channel EEG segments. Tier 0 evaluation: band-power and complexity fidelity only.

Tier 1 — strong if reached Full conditioning on sedation level + responsiveness label, multichannel with spatial structure, sampling steerable by class. Discriminability + downstream utility evaluation.

Tier 2 — stretch Personalized generation conditioned on a subject's own awake baseline (mirrors VIGIL's per-patient baselining philosophy) — i.e., "given this subject's baseline, generate what their moderate-sedation-responsive EEG would plausibly look like."

10. Risks
Risk	Mitigation
Model learns dataset artifacts (electrode setup, filtering) rather than physiology	Train across multiple source datasets, not just Chennu; check fidelity metrics per-source
Synthetic minority-class data looks plausible but encodes wrong correlations (e.g., fake "awareness" signature that's actually noise)	Downstream utility test on held-out real data is the gate — never validate synthetic quality using only synthetic-vs-synthetic metrics
Small n (20–21 subjects) means diffusion model overfits and just memorizes/interpolates real subjects	Held-out subject test; nearest-neighbor distance check between synthetic and real windows to catch near-duplication
Downstream users (future us) trust synthetic data uncritically	Ship the evaluation report alongside every generated dataset — never distribute synthetic data without its fidelity scorecard
Scope creep into a general-purpose biosignal foundation model	Explicitly out of scope in v1 (see Non-goals)
11. Success metrics
Fidelity: synthetic vs. real band-power/complexity distributions statistically indistinguishable (or quantified gap) per condition.
Utility: real+synthetic classifier training measurably improves rare-class (responsive/aware) recall vs. real-only, on held-out real data.
Adoption: VIGIL's own follow-on classifier work can use this instead of waiting on new patient data.
12. Open questions
Is 2 real datasets (41 subjects total) enough signal to condition on, or do we need the broader EEG-Dash corpus just to get the diffusion backbone stable before fine-tuning on the tiny labeled set?
Do we synthesize raw time-domain signal or spectral/topographic representations (EFDMs, per prior art) — time domain is more useful downstream but harder to get right; worth prototyping both cheaply before committing.
How do we handle sampling-rate and montage mismatches across source datasets during pooled pretraining?