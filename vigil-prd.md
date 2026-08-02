# VIGIL — Product Requirements Document

**One line:** The monitor in every operating room measures whether the brain is talking to itself. We measure whether the brain is still listening to the room.

**Team:** 3 people, 8 hours
**Deliverable:** Live web demo (public link + QR) + 5-minute pitch
**Status of this doc:** written before the build. Scope tiers are ordered by what ships first.

---

## 1. The problem

General anesthesia is supposed to do two things: prevent experience, and prevent memory. It reliably does the second. The evidence that it does the first is much weaker than anyone assumes.

| Finding | Number | Source |
|---|---|---|
| Awareness by spontaneous patient report | ~1 : 19,600 | NAP5 (Pandit et al., 2014) |
| Awareness by structured post-op interview | ~1 : 600 | Brice-protocol studies |
| With a neuromuscular blocker | ~1 : 8,200 | NAP5 |
| Without a neuromuscular blocker | ~1 : 135,900 | NAP5 |
| During Caesarean section | ~1 : 670 | NAP5 |
| Occurring at induction or emergence | 66% of cases | NAP5 |
| Judged preventable | 73.6% | NAP5 |
| **Responded to a spoken command during surgery (isolated forearm technique)** | **393 / 1,131 = 34.8%** | **IFT meta-analysis, BJA 2018** |
| Responded after intubation, of whom 5/12 signalled *pain* | 4.6% | Sanders et al., Anesthesiology 2017 |

**The core technical fact:** Gaskell et al. (BJA 2017) examined raw EEG in patients who responded to command during surgery and found the frontal alpha–delta pattern — the signature clinicians read as proof of unconsciousness — was present in them. Title of the paper: *"Frontal alpha-delta EEG does not preclude volitional response during anaesthesia."*

That is why depth-of-anesthesia monitors have never convincingly reduced awareness in RCTs. They summarize the brain's intrinsic rhythm. Consciousness of the room is a *relational* property — whether the brain is tracking external input — and no deployed monitor measures it.

**Caveat we state ourselves, before a judge does:** IFT responsiveness is not the same as suffering. Most responders have no recall. The honest claim is *"connected consciousness is orders of magnitude more common than recall, and current monitors cannot see it,"* not *"one in three patients is being tortured."* The honest claim is still devastating.

---

## 2. The product

**Inputs:** frontal EEG (electrodes already on the patient) + ambient OR audio (a microphone is already in the room).

**Output:** two numbers side by side.
- **SDP** — Spectral Depth Proxy. What today's monitors compute. Intrinsic rhythm only.
- **CI** — Coupling Index. How much of this patient's EEG is still explained by what is happening in the room, relative to their own awake baseline.

**Why per-patient baselining is the actual product insight:** individual variability in anesthetic susceptibility is what has defeated depth-of-anesthesia monitoring for thirty years. Every patient sits in pre-op holding with electrodes already attached. That is a free, personalized awake calibration. Population norms become unnecessary.

**Why label scarcity stops being a problem:** you will never assemble a supervised dataset of awareness at 0.1% prevalence. CI is measured against the patient's own baseline, so this is anomaly detection, not classification. And where labels *are* wanted, IFT provides them at ~30% prevalence instead of 0.1% — two orders of magnitude fewer patients needed for a trial.

---

## 3. Scope tiers

Build in this order. Ship whatever is done at hour 6.

### Tier 0 — must ship (this alone is a winning demo)

Interactive monitor UI, replaying real patient data from the Chennu propofol sedation dataset, showing SDP across four sedation levels, with a **two-patient side-by-side**: one behaviorally responsive under moderate sedation, one not. SDP cannot tell them apart.

The judge drags a slider and watches the monitor say *unconscious* about a patient who was answering questions. That is the entire pitch, delivered by their own hand.

### Tier 1 — strong if reached

CI computed on a stimulus-locked dataset, plotted against SDP. A marked **DISAGREEMENT** band on the timeline where SDP says unconscious and CI says awake.

### Tier 2 — stretch, likely does not happen

Live mic input driving a real-time CI estimate on a volunteer wearing a consumer EEG headset.

> **Known risk, flagged now:** the public Chennu release is described as a *resting-state* dataset across sedation levels. The auditory discrimination task was used to classify subjects as responsive vs. drowsy, but stimulus-locked recordings may not be in the public release. **If there is no stimulus audio, CI cannot be computed on Chennu at all.** Verify this in hour 1, not hour 4. If confirmed, Tier 1 requires a different dataset (see §5) and should be treated as unlikely. Tier 0 is unaffected — Chennu's responsive/drowsy labels are exactly what Tier 0 needs.

---

## 4. Roles

**You — index, integration, pitch.**
Hour 0–0.5: write the JSON schema and hand-generate one fake file for Frontend. Define the array contract with Data. These two artifacts unblock both teammates for the rest of the day and are the highest-leverage 30 minutes anyone spends.
Then: SDP implementation, JSON emitter, subject selection, slides, script. Peel off entirely at hour 5.

**Teammate A — frontend.**
Owns topomap, slider, dual readout, two-patient view, deploy. Builds against fake JSON from hour 1. Never touches Python. Never blocked.

**Teammate B — data.**
Owns: download Chennu, load in MNE, extract condition labels and the responsive/drowsy classification, epoch, hand clean arrays to you. That is the whole job and it is plenty — this is where hours disappear unpredictably.

**Interface contracts, agreed in the first ten minutes:**
- You → A: `data/*.json` matching §6
- B → You: `(n_subjects, n_channels, n_samples)` float array per condition + a `subjects.csv` with `subject_id, condition, responsive`

---

## 5. Data

**Primary — Chennu et al. 2016 propofol sedation.** 20 healthy participants, 91-channel EEG, four 5-minute conditions: baseline, mild sedation (0.6 μg/mL), moderate sedation (1.2 μg/mL), recovery. Participants classified responsive or drowsy at moderate sedation using a 60% hit-rate threshold on an auditory discrimination task. Available from the Cambridge data repository; a BIDS-converted version exists via the FieldTrip project.

This dataset is *made* for Tier 0. The responsive/drowsy label at a fixed drug concentration is the money plot.

**Backup — OpenNeuro ds005620.** 21 subjects, 1,440 recordings, CC0. Repeated-awakening study during propofol sedation with subjective experience reports. Use if Chennu access fails.

**Tier 1 candidate — local-global auditory paradigm datasets** (Bekinschtein/Dehaene lineage, disorders-of-consciousness cohorts). Stimulus-locked, designed specifically to dissociate conscious from unconscious auditory processing. This is where CI is actually computable.

**Context only, do not train on:** VitalDB (thousands of real surgical cases with BIS and vitals — cite for deployment realism), CNeuroMod (what TRIBE was trained on).

---

## 6. Data contract

Frontend builds against this from hour 1. One file per subject per condition, or one file per subject containing all conditions.

```json
{
  "subject": "S07",
  "condition": "moderate",
  "responsive": true,
  "drug_concentration_ug_ml": 1.2,
  "fs": 10,
  "electrodes": [
    {"label": "Fp1", "x": -0.31, "y": 0.95},
    {"label": "Fp2", "x":  0.31, "y": 0.95}
  ],
  "frames": [
    {"t": 0.0, "topo": [0.42, 0.11], "sdp": 38, "ci": 0.71},
    {"t": 0.1, "topo": [0.44, 0.13], "sdp": 37, "ci": 0.69}
  ]
}
```

- `x`, `y` — normalized 2D scalp coordinates, unit circle, nose at +y. Frontend interpolates; it does not need to know 10-20 montage geometry.
- `topo` — one value per electrode, same order as `electrodes`, normalized 0–1.
- `sdp` — 0–100, higher = more awake. Deliberately BIS-like in range so the comparison is legible.
- `ci` — 0–1, fraction of baseline coupling retained. **Emit `null` if Tier 1 is not reached.** Frontend renders a greyed-out panel reading `NOT MEASURED` — which is, pointedly, exactly what happens in every real OR today.
- `fs: 10` — ten frames per second is plenty for a UI. Do not ship raw 250 Hz EEG to the browser.

**Hand-fake this file in hour 0.** Sine waves and random walks. Frontend must never wait.

---

## 7. Algorithms

### 7.1 SDP — Spectral Depth Proxy (Tier 0, ~30 lines)

This is a documented proxy, not BIS. BIS is proprietary and we do not claim to reimplement it. Label it honestly in the UI and in the deck.

```
per 2-second window, 50% overlap, frontal channels only (Fp1, Fp2, F3, F4, Fz):
  1. Welch PSD, 0.5–45 Hz
  2. band powers:
       delta 0.5–4 Hz
       theta 4–8 Hz
       alpha 8–13 Hz
       beta  13–30 Hz
  3. r = log10(alpha_power / delta_power)
  4. SDP = 100 * sigmoid((r - r_mu) / r_sigma)
     where r_mu, r_sigma are fit on THIS SUBJECT's baseline condition
  5. median filter over 5 windows to kill jitter
```

Per-subject normalization at step 4 is not a shortcut — it is a small version of the same argument the whole product rests on.

### 7.2 CI — Coupling Index (Tier 1)

Standard encoding-model / temporal-response-function setup. Requires stimulus-locked data.

```
1. Stimulus audio → embeddings.
     Preferred: TRIBE's audio branch.
     Practical: Wav2Vec2-BERT or a Whisper encoder — TRIBE's own audio branch
     is a pretrained speech model, so this is an ablation, not a substitution.
     Take a mid-layer hidden state, ~50 Hz, PCA to ~32 dims.
2. Resample embeddings to EEG sample rate. Build lagged design matrix,
   lags 0–500 ms.
3. Ridge regression: lagged embeddings → each EEG channel.
   FIT ON BASELINE (awake) CONDITION ONLY. Cross-validate alpha on held-out
   baseline segments.
4. Freeze. Apply to each sedation condition.
   r_cond = Pearson(predicted, actual), averaged over channels.
5. CI = clip(r_cond / r_baseline, 0, 1)
```

**If there is no stimulus audio but there are auditory event markers**, degrade gracefully to an evoked-response measure: average ERP amplitude in a late window (300–600 ms post-stimulus), normalized to baseline. Weaker, but same story — late components are the ones that track conscious processing.

**If neither exists, CI does not ship.** Emit `null`, grey the panel, and pitch coupling as the thesis rather than the result. This is not a defeat. "Here's the monitor. Here's what it misses. Here's what we're building next" is an honest and genuinely strong pitch.

---

## 8. Frontend spec

**Aesthetic direction: operating-room monitor, not data-viz dashboard.** Every adult in that room has stood in a hospital hallway watching one of these. Borrow that vocabulary and the emotional weight comes free.

- Near-black ground. Not pure `#000` — something like `#0A0E0F`, the greenish black of a clinical display.
- Numbers in a monospace face at a size that is frankly too large. The number *is* the interface.
- Two accent colors only: a clinical green for the trace, an amber for the disagreement state. Resist adding a third.
- Zero border radius. Hairline rules. No shadows, no gradients, no glassmorphism.
- Sound on: OR ambience under the demo — suction, monitor beep, muffled voices. Nobody else at this hackathon will have audio. Default muted with a visible unmute; autoplay will be blocked anyway.

**Layout**

```
┌──────────────────────────────────────────────────────┐
│  VIGIL                          ● REPLAY  Chennu n=20│
├────────────────────────┬─────────────────────────────┤
│                        │   SDP            CI         │
│      [ topomap ]       │    38            0.71       │
│                        │   ─────         ─────       │
│                        │   "unconscious"  "awake"    │
├────────────────────────┴─────────────────────────────┤
│  ~~~~~~~~~~~~~ EEG trace, scrolling ~~~~~~~~~~~~~~~  │
├──────────────────────────────────────────────────────┤
│  BASELINE ──── MILD ──── MODERATE ──── RECOVERY      │
│  ●━━━━━━━━━━━━━━━━━━━━━━━━━━━▓▓▓▓▓▓━━━━━━━━━━━━━━━   │
│                              └ DISAGREEMENT           │
└──────────────────────────────────────────────────────┘
```

**Topomap implementation:** 2D canvas, head outline, electrode dots at their `x`/`y`, inverse-distance-weighted color interpolation across the disc. ~60 lines, 60fps. **Do not build a 3D brain.** A rotating three.js mesh takes 5× longer and reads as video game; a flat topomap reads as clinical instrument.

**The slider is the product.** One control, labeled *anesthetic depth*, scrubbing through the four conditions. Topomap, SDP, CI, and trace all move together. Everything else is chrome.

**Two-patient view** is the closing move: same drug concentration, two patients, SDP nearly identical, one of them was answering questions. Label them by outcome, not by ID — `PATIENT A — did not respond` / `PATIENT B — responded to command`.

**Honesty labels, non-negotiable:**
- Persistent footer: `Replaying: Chennu et al. 2016, n=20, propofol sedation`
- Sandbox mode: `SANDBOX — your audio, recorded patient EEG`
- SDP panel: `spectral proxy, not BIS`

These cost one line each and convert every possible "gotcha" into evidence of rigor. To a non-specialist judge, "n=20 real patients" also sounds like a lot for one day. It is.

**Deploy static.** Precompute all JSON, push to Vercel or GitHub Pages. No live inference behind the public link — it will fall over the moment three judges open it, and that failure happens during deliberation when you are not there to explain. Must work on a phone; judges will open the QR on their phones.

---

## 9. Timeline

| Hour | You | A — frontend | B — data |
|---|---|---|---|
| 0–0.5 | **Schema + fake JSON → A. Array contract → B.** | Scaffold, canvas | Start Chennu download |
| 0.5–2 | SDP on any EEG, synthetic if needed | Topomap on fake data | Load in MNE. **Check for stimulus data.** |
| 2–3 | Wire SDP → JSON emitter | **Slider + dual readout. Deploy ugly.** | **CHECKPOINT: loads, or pivot** |
| 3–4.5 | SDP on real Chennu, all 20 subjects | Polish, mobile, OR aesthetic | Extract responsive/drowsy labels |
| 4.5–5 | **Pick the two subjects. Freeze the story.** | Two-patient view | Verify labels against the paper |
| 5–6 | Slides + script | Final polish, QR | Sanity-check every number on screen |
| 6 | **FREEZE — whatever works, ships** | Final deploy | — |
| 6–8 | Rehearse ×4, one full run with live link on screen | On call for breakage only | Ask hostile questions during run 4 |

CI goes in the 3–4.5 slot **only if B clears the hour-3 checkpoint early and stimulus data exists.**

---

## 10. Kill criteria — decided now, not in the moment

| Trigger | Action |
|---|---|
| Hour 1: no stimulus-locked data in Chennu | CI is Tier 2. Stop thinking about it. Say so on stage. |
| Hour 3: raw EEG will not load | Pivot to ds005620. If that fails, synthesize and label the footer `SIMULATED`. Still a demo. |
| Hour 5: CI output is noise | Ship `null`. Grey panel reading `NOT MEASURED`. Pitch coupling as thesis. |
| Hour 6: anything is half-done | It does not ship. Nobody has ever regretted freezing early. |

At hour 3 you personally look at B's screen. Not "how's it going" — actually look. If raw EEG is not plotting, make the call there.

---

## 11. Pitch

**Structure: 5 minutes. QR code on slide 1, not the last slide** — judges who open it early spend your whole pitch playing with it, which is what you want.

**Cold open, no slide:**

> "One in three surgical patients, when asked to squeeze the doctor's hand during surgery, squeezes it. Some squeeze twice — that's the signal for *I'm in pain*. Almost none of them remember it afterward. That's not a horror story, that's a meta-analysis of 1,131 patients."
>
> *(pause)*
>
> "The monitor in the room said they were unconscious."

**Three beats, plain English:**
1. **It's the paralysis.** 1 in 8,200 with a paralytic. 1 in 136,000 without. They can't tell you because they can't move.
2. **The monitor measures the wrong thing.** It listens to the brain talking to itself. We listen for whether the brain is still tracking the room.
3. **Nothing new goes in the OR.** The electrodes are already on. There's already a microphone. It's software.

**Demo:** hand the slider to a judge. Let them find the disagreement band themselves.

**Close on the ask, not the tech:**

> "There is no number for this. Nobody is measuring it. We're proposing there should be a number — and this is the first version of it."

---

## 12. Q&A prep

| Question | Answer |
|---|---|
| "Isn't TRIBE an fMRI model?" | Yes. We use its stimulus embeddings, not its fMRI output head. It's a stimulus encoder for us, not a brain reader. |
| "BIS exists. The RCTs were equivocal." | Because BIS measures the wrong thing — and the IFT literature proves it. Alpha-delta coexists with command-following. |
| "34.8% means your alarm never stops." | Which is why the output is graded and time-windowed to induction and emergence, where two-thirds of cases occur. Decision support, not a klaxon. |
| "How does this get into a hospital?" | Not as an FDA Class III alarm on day one. As a retrospective risk-flag research tool over VitalDB-scale archives. Prove the epidemiology, then earn the alarm. |
| "What if you tell someone they were aware and they weren't?" | Take this seriously. Disclosure of awareness is itself a psychological intervention. Output goes to the anesthesiologist during the case, not to the patient afterward. |
| "What did you actually build today?" | The interface, the index, and the analysis on 20 real patients. Say the boundary out loud: what runs today is SDP on open sedation data; what doesn't exist yet is the OR audio pipeline and prospective validation. |

That last row is the one that matters. Volunteering the boundary is what makes everything else credible.

---

## 13. What this becomes after Saturday

The surgical case is the wedge because it has 300M+ annual procedures and a named malpractice category. The general claim is larger: **a consciousness index that works on ambient stimuli** — no controlled paradigm, no clicks and beeps, just whatever is already happening in the room. That generalizes to ICU sedation, disorders of consciousness, pediatric anesthesia, and locked-in assessment.

Which is also the argument for keeping every number in this deck real. This pitch has a life after Saturday — ISEF, URTC, cold emails. Fabricated numbers become things you have to track or quietly walk back later.

You don't need them. **34.8%** is not improvable.
