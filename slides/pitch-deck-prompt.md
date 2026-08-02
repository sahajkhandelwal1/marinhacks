# Prompt for Claude (slide generation): PROBE pitch deck

Paste everything below into Claude to generate the slideshow.

---

## Task

Build a short slideshow pitch deck for a hackathon demo. Output it as a
Claude-native slide artifact (visual slides, not a markdown outline).

**Hard time constraint: the deck must be presentable in under 2 minutes.**
Total stage time with judges is 4 minutes — roughly 2 minutes talking over
slides, then 2 minutes of a live product demo (not part of this deck). Assume
the presenter is a fast, confident talker. Err toward fewer slides with less
text rather than more. If a slide can't be explained out loud in ~15-20
seconds, cut it or split it.

Target: **5-7 slides total**, including the title slide.

You have full creative freedom to restructure the narrative — the material
below is raw source material (facts, numbers, product description, existing
pitch language), not a script to reproduce slide-for-slide. Pick the
strongest angle and cut anything that doesn't serve the 2-minute version.

## What we're pitching

**PROBE — Patient Response Observation Brain Encoder.**

One-line hook: *"The monitor in every operating room measures whether the
brain is talking to itself. We measure whether the brain is still listening
to the room."*

### The problem

General anesthesia is supposed to do two things: prevent experience, and
prevent memory. It reliably does the second. The evidence that it does the
first is much weaker than anyone assumes — because paralytic drugs mean
patients who are conscious and responsive often cannot show it.

Key numbers (all real, all citable — do not alter or round differently):

| Finding | Number | Source |
|---|---|---|
| Awareness by spontaneous patient report | ~1 in 19,600 | NAP5 (Pandit et al., 2014) |
| Awareness by structured post-op interview | ~1 in 600 | Brice-protocol studies |
| With a neuromuscular blocker (paralytic) | ~1 in 8,200 | NAP5 |
| Without a neuromuscular blocker | ~1 in 135,900 | NAP5 |
| **Responded to a spoken command during surgery** (isolated forearm technique — patients who were NOT fully paralyzed and could still move one hand) | **393 / 1,131 = 34.8%** | IFT meta-analysis, BJA 2018 |
| Occurring at induction or emergence (start/end of surgery) | 66% of cases | NAP5 |
| Judged preventable | 73.6% | NAP5 |

**The core technical fact:** Gaskell et al. (BJA 2017) found that patients who
*did* respond to command during surgery still showed the frontal alpha-delta
EEG pattern — the exact signature today's monitors read as proof of
unconsciousness. Paper title: *"Frontal alpha-delta EEG does not preclude
volitional response during anaesthesia."* Today's monitors (e.g. BIS) measure
the brain's intrinsic rhythm, which does not reliably track whether the
patient is still perceiving the room. That's why depth-of-anesthesia monitors
have never convincingly reduced awareness in randomized trials.

**Important honesty caveat, worth keeping somewhere in the deck or Q&A
framing:** responding to a command is not the same as suffering or having
recall. Most responders have no memory of it afterward. The honest claim is
*"connected consciousness is far more common than recall, and no deployed
monitor measures it"* — not *"a third of patients are being tortured."* The
honest version is still a strong, unsettling claim on its own.

### The product

**Inputs:** frontal EEG (electrodes already on the patient in every OR) +
ambient room audio (a microphone is already in the room too). Nothing new
has to be added to the OR.

**Output — two numbers, side by side:**
- **SDP (Spectral Depth Proxy)** — what today's monitors compute: the brain's
  intrinsic rhythm only. Built today, working, computed on real EEG.
- **CI (Coupling Index)** — how much of the patient's brain activity is still
  explained by what's happening in the room, measured against *that specific
  patient's own awake baseline*. This is the actual innovation. Currently not
  measured/shipped (see status below) — the deck should be honest that this
  is "not yet measured" rather than implying it's live, unless told
  otherwise by whoever presents.

**The key product insight:** every patient already sits in pre-op holding
with EEG electrodes on before surgery — that's a free, personalized "awake"
calibration baseline. Individual variability in how people respond to
anesthesia is the thing that has defeated one-size-fits-all monitors for
thirty years; per-patient baselining sidesteps that.

**Why this is buildable without a huge labeled dataset:** awareness happens
at ~0.1% prevalence in the general population — essentially impossible to
build a supervised classifier against. But CI is anomaly detection against
each patient's *own* baseline, not population classification. And where
labeled events are useful, isolated-forearm-technique (IFT) responsiveness
happens at ~30% prevalence in study populations — two orders of magnitude
more data-efficient than trying to catch spontaneous awareness reports.

### What's actually built (be precise about this — it's part of the pitch's
credibility, not a weakness to hide)

- A live, interactive web demo: a clinical monitor UI replaying real
  patient EEG data (Chennu et al. 2016 propofol sedation dataset, 20 real
  subjects, 4 sedation conditions: baseline / mild / moderate / recovery).
- **SDP is real math on real EEG** — Welch PSD, alpha/delta band-power ratio,
  normalized against each subject's own baseline condition. Not a mockup.
- The demo's centerpiece: a **two-patient side-by-side comparison**. Two
  patients at the *same* drug concentration — one who behaviorally responded
  to command, one who did not — and their SDP scores are nearly identical.
  SDP cannot tell them apart. That's the whole argument, made visually, in
  one screen.
- **CI (the Coupling Index) is not yet computed** — the public Chennu dataset
  turned out not to include the stimulus-timing data needed to compute it
  (verified directly against the real dataset files). The UI has an honest
  greyed-out "NOT MEASURED" panel for it rather than faking a number. This
  is framed as itself part of the pitch: *this is exactly what happens in
  every real OR today — nothing measures this.*
- Underlying EEG signal in the demo is synthetic (generated to match real
  statistical properties) pending access to the raw Chennu recordings; the
  demo is labeled honestly on screen about what's real vs. reconstructed vs.
  synthetic. Mention this only briefly if at all — this is a hackathon demo,
  the point is the concept and the visual argument, not implying full
  clinical validation.

### The demo product (what the 2-minute live demo after this deck will show)

Not for the deck to explain in ​depth, since it's demoed live afterward — but
the deck's closing slide(s) should set it up / hand off to it:
- A monitor screen with a rotating 3D cortical brain surface, an SDP score,
  a CI panel (greyed "NOT MEASURED"), and a scrubbable timeline slider
  across the four sedation conditions.
- A "compare" view: the two patients side by side at matched drug
  concentration — one responded, one didn't, same SDP. This is the money
  shot.

### Positioning / what this could become

The surgical OR is the entry wedge (300M+ procedures/year, a named
malpractice category). The bigger claim: a consciousness index that works
on *whatever ambient stimuli are already happening* — no controlled
lab paradigm needed. That generalizes to ICU sedation monitoring, disorders
of consciousness assessment, pediatric anesthesia, and locked-in-syndrome
assessment. Mention this only as a brief "where this goes next" beat if
there's room — do not let it crowd out the core 2-minute story.

### Honest positioning on regulatory/deployment path (use only if there's a
slide for objections/roadmap — otherwise skip, this is Q&A material)

Not pitched as an FDA Class III bedside alarm on day one. Positioned first
as a retrospective research/risk-flagging tool over large existing surgical
datasets (e.g. VitalDB-scale archives), to prove the epidemiology before
ever building a real-time alarm.

## Tone and style direction

- **Clinical, confident, unsettling-but-not-sensational.** This is a
  patient-safety story backed by real peer-reviewed numbers, not a scare
  pitch. Let the numbers do the work; avoid melodrama in the copy.
- Visual language should evoke an **operating-room monitor** — think clinical
  display aesthetics (dark or near-black backgrounds work well, monospace/
  tabular numerals for data, a restrained color palette — e.g. one clinical
  accent color plus one alert/warning color, used sparingly and
  consistently). Avoid generic "startup pitch deck" gradients, stock photos,
  or cartoon illustration styles. This should look like it belongs in a
  hospital, not a SaaS landing page.
- Minimal text per slide. Big numbers, short phrases, not paragraphs. This
  will be talked over live in ~15-20 seconds per slide — the slide is a
  visual anchor for the spoken line, not the full explanation.
- Cite sources briefly (small footer text) on any slide using the NAP5 /
  IFT / Gaskell numbers — it's a hackathon audience of judges, and a cited
  real number is more persuasive than an uncited big claim.

## Screenshot placeholders — required

Reserve clearly marked placeholder space (labeled placeholder box, not a
generic image icon) on at least these slides — do not fill them in, actual
screenshots will be dropped in afterward:

1. **A "Monitor view" placeholder** — the single-patient monitor screen
   (rotating cortical brain surface, SDP score, greyed CI panel, sedation
   timeline slider). Label the placeholder box: `[SCREENSHOT: Monitor view]`.
2. **A "Compare view" placeholder** — the two-patient side-by-side money
   shot (matched drug concentration, one responded / one didn't, ~identical
   SDP). Label the placeholder box: `[SCREENSHOT: Compare view — money plot]`.

These should each get a slide (or a meaningful portion of a slide) roughly
sized for a real product screenshot — not a small thumbnail — since this is
the visual proof of the whole argument.

## Suggested shape (a starting point, not a mandate — restructure freely)

1. **Title / cold open** — product name, one-line hook, maybe the single
   most striking number (34.8%) as a teaser.
2. **The problem** — the core stat story: paralysis hides responsiveness;
   monitors watch the wrong thing (alpha-delta pattern persists in
   responders).
3. **The insight / what we measure** — SDP vs. CI, per-patient baseline,
   nothing new added to the OR.
4. **Monitor view screenshot slide.**
5. **Compare view screenshot slide — the money plot.**
6. **What's real today** (built on 20 real patients, honest about CI status)
   — short, credibility-building.
7. **Close / handoff to live demo** — the ask: "there's no number for this
   today; we're proposing the first version of one," then hand off to the
   presenter running the live demo.

Cut or merge any of these if it helps hit the 2-minute constraint — 5 slides
is fine if the content lands cleanly.
