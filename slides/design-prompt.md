# Prompt for Claude Design: VIGIL pitch slideshow

## The ask

Build a short slide deck for a **4-minute hackathon pitch**, where the deck itself should burn no more than **~2 minutes** of that time — the rest is a live demo of the working product. The deck should end on a slide that hands off to the demo (something like "and now, a live demo" / "watch it happen live"). Aim for **5-7 slides**, punchy and fast to read out loud — judges are listening to a person talk, not reading a document.

Write fresh copy from the facts below — don't just lift PRD language verbatim. Keep every number exactly as given; do not round, soften, or embellish the stats. Where a claim is qualified in the facts below (e.g. "proxy, not a diagnosis," "synthetic EEG"), keep that qualifier — this pitch has a life after the hackathon (competitions, cold emails) and inflated claims become things to walk back later.

Leave clear placeholders for **4 screenshots/diagrams** (specified at the bottom) — treat them as first-class content, not decoration, since the visuals are what sell a data product like this.

## Audience & tone

Hackathon judges, 4-minute slot. Assume smart generalists, not clinicians or ML specialists — plain English over jargon, translate any medical or technical term the first time it's used. Tone: serious and a little unsettling (the subject matter earns it) but not sensationalized — the honest version of this story is already the strong version.

## Visual style

The actual shipped product ("frontend/") is a light clinical theme: Inter typeface throughout, tabular numbers sized for readability at a glance, one accent blue (`#2A78D6`) + one reserved amber/orange (`#EB6834`) for the single "this is the alarming state" signal, zero border radius, hairline rules, no gradients/shadows/glassmorphism. If the deck can echo that language (clean clinical-instrument aesthetic, restrained color, the hero number doing the talking) it'll feel like one continuous product with the live demo that follows. Not a hard requirement — legibility and pacing matter more than pixel-matching.

---

## One-line pitch

The monitor in every operating room measures whether the brain is talking to itself. We measure whether the brain is still listening to the room.

## The problem

General anesthesia is supposed to do two things: prevent experience, and prevent memory. It reliably does the second. The evidence that it does the first is much weaker than anyone assumes.

Key stats (NAP5 — the UK's 5th National Audit Project, the largest study of its kind, and a 2018 British Journal of Anaesthesia meta-analysis of the isolated forearm technique):

| Finding | Number |
|---|---|
| Awareness by spontaneous patient report | ~1 in 19,600 |
| Awareness by structured post-op interview | ~1 in 600 |
| **Responded to a spoken command during surgery** (isolated forearm technique — a small tourniquet keeps one hand unparalyzed so a patient can still squeeze on request even under a paralytic) | **393 / 1,131 = 34.8%** |
| Awareness occurring at induction or emergence (going under / waking up) | 66% of cases |
| Judged preventable, in retrospect | 73.6% |

The gap between "1 in 19,600 remembers" and "1 in 3 responds to a command" is explained almost entirely by paralysis: patients given a neuromuscular blocker can't move even if they're aware, so most of connected consciousness never gets reported at all. Most responders have no recall afterward — this is not "patients are being tortured and remembering it," it's "connected consciousness is far more common than anyone measuring it today would guess, because the tool that measures it doesn't exist."

**The core technical fact:** researchers (Gaskell et al., BJA 2017) looked at raw EEG in patients who *did* respond to command during surgery, and found the exact brainwave pattern anesthesiologists are trained to read as "proof of unconsciousness" (frontal alpha-delta pattern) was present in them anyway. The signal the entire industry watches does not distinguish these patients from truly unconscious ones. That's the reason depth-of-anesthesia monitors (like BIS, the current standard) have never convincingly reduced awareness in randomized trials — they measure the brain's *internal* rhythm, not whether the brain is still tracking the outside world.

## The product

**Inputs:** frontal EEG (electrodes already on the patient in every OR) + ambient room audio (a microphone is already in the room). No new hardware.

**Output:** two numbers, side by side:
- **SDP (Spectral Depth Proxy)** — what today's monitors compute: intrinsic brain rhythm only. Deliberately scored 0-100, BIS-like, so the comparison is legible. Explicitly labeled in the UI as "a documented proxy, not BIS" — BIS is proprietary and this doesn't claim to reimplement it.
- **CI (Coupling Index)** — how much of this patient's brain activity is still explained by what's happening in the room, measured *against that same patient's own awake baseline* recorded minutes earlier in pre-op holding.

**Why per-patient baselining is the real insight:** individual variability in how people respond to anesthesia is what has defeated depth-of-anesthesia monitoring for thirty years — the same drug concentration knocks one patient out and leaves another answering questions. Every patient already sits in pre-op with electrodes on before they're sedated. That's a free, personalized "awake" calibration sitting unused today. Population averages become unnecessary once you have the patient's own baseline.

**Why the data problem is smaller than it looks:** you'll never assemble enough documented cases of real intraoperative awareness to train a classifier — it's too rare (~0.1%) as a labeled event. But CI doesn't need that; it's anomaly detection against a patient's own resting baseline, not classification across patients. And on the rare occasions labels *are* wanted, the isolated forearm technique gives command-response labels at ~30% prevalence instead of ~0.1% — roughly two orders of magnitude fewer patients needed to validate anything.

## What was actually built (be precise about this — it's a strength, not a hedge)

- **Real:** SDP and a per-electrode "alpha index," computed with a documented signal-processing pipeline (Welch power spectral density, alpha/delta band ratio, anchored to each subject's own baseline) on a public 20-subject propofol sedation EEG dataset (Chennu et al. 2016), following the exact published responsive/non-responsive labels from that dataset.
- **Real:** the cortical brain geometry rendered in the UI is an actual MRI-derived anatomical template (fsaverage5, FreeSurfer) — not a generic 3D model.
- **Synthetic, clearly labeled as such on screen:** the underlying EEG waveforms shown moment-to-moment are reconstructed/generated to drive the visualization smoothly, pending access to raw recordings — the *math* (SDP) is real, computed on real per-subject data; the live scrolling trace is a faithful reconstruction, not sample-for-sample patient EEG.
- **Not yet measured:** CI (the coupling/room-awareness half of the product) — the specific dataset used doesn't include the stimulus-timing data needed to compute it, so it's null in the current build. This is stated honestly in the product itself (a visibly greyed "NOT MEASURED" panel) rather than faked. Frame this as: "here's the monitor, here's what it already catches, here's the exact next piece we're building" — not as an unfinished demo.
- **The demo's closing move:** two real patients from the dataset, sedated to the same drug concentration, with nearly identical SDP scores — except one of them, per the published labels, responded to a spoken command during the recording and the other didn't. The current-generation number cannot tell them apart. That pairing is the single most important thing on screen.

## Why it matters / what it's good for

- **No new hardware, existing OR workflow.** Electrodes and a microphone are already standard equipment. This is a software layer, not a device to get cleared and installed.
- **Immediate use case:** intraoperative awareness detection during general anesthesia — flagging the induction and emergence windows (going under / waking up), where two-thirds of real awareness events happen, as a decision-support signal for the anesthesiologist during the case (not disclosed to the patient afterward — that's a separate, carefully-handled clinical decision).
- **Realistic path to adoption:** not proposed as a Class III FDA-regulated alarm on day one. Proposed first as a retrospective research tool over large existing surgical-vitals archives (e.g. VitalDB-scale datasets) to establish the epidemiology at scale, before any real-time alarm is earned.
- **The idea generalizes past the OR.** The underlying concept — a consciousness/awareness index driven by whatever ambient stimuli are already present, with no controlled stimulus paradigm required — extends to ICU sedation monitoring, disorders-of-consciousness assessment, pediatric anesthesia, and locked-in-syndrome assessment. The operating room is the wedge (300M+ annual surgical procedures worldwide, and a recognized malpractice category), not the ceiling.

## The honest ask

There is currently no deployed number for "is this patient's brain still tracking the room." Nobody measures it. This project is a first version of that number, built and validated (at the SDP layer) on real patient data in a single day.

---

## Screenshot / diagram placeholders (leave clearly marked space for these)

1. **Case gallery / home screen** — a grid of patient cards, each showing a small rotating 3D cortical brain surface, an AWAKE/SEDATED status pill, and a hero SDP number. Good as an early "here's the interface" establishing shot.
2. **Single-patient monitor view** — the core screen: a large rotating 3D cortical surface with activation coloring, the SDP hero number, the (currently greyed "NOT MEASURED") CI panel, a scrolling reconstructed EEG trace, and a scrubbable timeline slider across sedation levels. This is the main product shot.
3. **Two-patient compare view** — the money plot described above: two patients side by side at matching sedation/drug concentration, near-identical SDP, one labeled as having responded to command and one not. This should probably be the emotional high point of the deck, right before the demo handoff slide.
4. **Data/architecture diagram (not a screenshot — to be created)** — a simple flow: `EEG electrodes + room microphone (already in the OR)` → `SDP (intrinsic rhythm) + CI (room-coupling, against patient's own awake baseline)` → `two numbers on the monitor`. Useful for the "how it works" beat without slowing down into signal-processing detail.
