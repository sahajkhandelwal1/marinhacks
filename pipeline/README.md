# pipeline

Owner: Teammate B.

## Confirmed pre-event (verified directly against the real data, not just docs)

- **Tier 1 (CI) is dead on this dataset.** Every run's `events.tsv` contains
  only 10-second epoch-boundary markers plus one or two generic "comm"
  triggers near the start — no per-trial timing for the 40-trial auditory
  discrimination task. There is nothing to lock a stimulus encoding model to.
  Don't spend hackathon time re-checking this.
- **No montage translation needed.** `channels.tsv` confirms standard 10-20
  labels (`Fp1, Fp2, F3, F4, Fz, C3, C4, Cz, ...`) are present directly
  alongside E-numbered channels (91 total, all type `eeg`). `scripts/sdp.py`'s
  `FRONTAL_CHANNELS` list already matches these names — no remapping step.
- **Data is public, no auth, no request needed:**
  `https://download.fieldtriptoolbox.org/workshop/madrid2019/extra/complete_resting_data/`
  — 20 subjects (`sub-02,03,05,06,07,08,09,10,13,14,18,20,22,23,24,25,26,27,28,29`),
  BrainVision format, ~35MB/run × 4 runs/subject (~2.8GB for all 20).
- **Responsive/drowsy label**: `sub-XX_scans.tsv` has `correctresponses` (out
  of 40) per run. Hit rate = `correctresponses / 40`, threshold 0.6 **on the
  moderate-sedation run only** — this produces one label per subject, not
  per condition.

## Scripts (scaffolded, not yet run against real data)

- `download.py` — pulls the BIDS files above into `raw_data/` (gitignored).
  Idempotent; supports `--subjects` / `--limit` for a quick smoke test before
  committing to the full ~2.8GB.
- `load.py` — MNE-loads each subject/run, classifies responsive/drowsy from
  `scans.tsv`, and writes the B → You contract to `arrays/`:
  `{condition}.npy` shaped `(n_subjects, n_channels, n_samples)` (trimmed to
  the shortest subject's length per condition — run durations vary by a few
  seconds across subjects) plus `subjects.csv` and `channel_names.txt`.

Run order: `pip install -r ../requirements.txt` (needs `mne`, not yet
installed in `.venv`) → `python3 download.py` → `python3 load.py`.

## First checkpoint

Pair with the integration owner (hour 0.5–2) rather than working solo —
walk through an actual `download.py --limit 2` + `load.py` run together
early, since that's the fastest way to catch any surprise (channel count
mismatch, MNE version issue, a subject with a corrupt file) before it's a
problem at hour 3.
