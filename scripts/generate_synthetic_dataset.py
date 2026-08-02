#!/usr/bin/env python3
"""
Full synthetic Chennu-shaped dataset, generated because the WiFi at the venue
cannot reliably pull the real Chennu propofol release (PRD §5/§9, hour 0-2
data risk). This is a stand-in for teammate B's pipeline output, not a
replacement for it — swap data/synthetic/ for the real thing the moment
Chennu loads.

Simulates 20 subjects x 4 conditions (baseline, mild, moderate, recovery),
full 5-minute recordings at fs=10 per PRD §5/§6, with a responsive/drowsy
label per subject (~35% responsive, matching the 34.8% IFT figure in PRD §1).

CI is synthesized to encode the product thesis on purpose: responsive
subjects keep elevated coupling at moderate sedation even though SDP drops
like everyone else's. Non-responsive subjects' CI collapses along with SDP.
That is the DISAGREEMENT band the frontend needs to render (PRD §3 Tier 1,
§8 layout) even though no real stimulus-locked data has been processed yet.

Usage: python3 scripts/generate_synthetic_dataset.py
"""
import csv
import json
import math
import random
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent.parent / "data" / "synthetic"

ELECTRODES = [
    {"label": "Fp1", "x": -0.31, "y": 0.95},
    {"label": "Fp2", "x": 0.31, "y": 0.95},
    {"label": "F3", "x": -0.50, "y": 0.55},
    {"label": "F4", "x": 0.50, "y": 0.55},
    {"label": "Fz", "x": 0.00, "y": 0.55},
    {"label": "C3", "x": -0.55, "y": 0.00},
    {"label": "C4", "x": 0.55, "y": 0.00},
    {"label": "Cz", "x": 0.00, "y": 0.00},
    {"label": "P3", "x": -0.50, "y": -0.55},
    {"label": "P4", "x": 0.50, "y": -0.55},
    {"label": "O1", "x": -0.31, "y": -0.95},
    {"label": "O2", "x": 0.31, "y": -0.95},
]

CONDITIONS = ["baseline", "mild", "moderate", "recovery"]
DRUG_CONC = {"baseline": 0.0, "mild": 0.6, "moderate": 1.2, "recovery": 0.3}

FS = 10
DURATION_S = 300  # full 5-minute condition per PRD §5
N_FRAMES = FS * DURATION_S

N_SUBJECTS = 20
RESPONSIVE_FRACTION = 0.35  # ~34.8% IFT figure, PRD §1

# Pull-back strength for the topo random walk, per frame. ~0.01 gives a
# relaxation time of ~100 frames (10s at fs=10): slow enough to look like
# drifting scalp topography, fast enough to stay stationary over 5 minutes.
TOPO_REVERSION = 0.01


def sdp_center_for(condition, subject_offset):
    base = {
        "baseline": 88,
        "mild": 66,
        "moderate": 40,
        "recovery": 77,
    }[condition]
    return base + subject_offset


def ci_center_for(condition, responsive, subject_jitter):
    """
    Baseline/mild/recovery: CI tracks SDP-ish (both drop under sedation).
    Moderate is where the thesis lives: responsive subjects retain coupling
    that SDP cannot see; non-responsive subjects lose it, same as SDP does.
    """
    if condition == "baseline":
        return 0.93 + subject_jitter
    if condition == "mild":
        return 0.75 + subject_jitter
    if condition == "moderate":
        return (0.62 if responsive else 0.20) + subject_jitter
    if condition == "recovery":
        return 0.85 + subject_jitter
    raise ValueError(condition)


def make_frames(rng, sdp_center, sdp_amplitude, ci_center, ci_amplitude):
    frames = []
    topo_home = [rng.uniform(0.3, 0.7) for _ in ELECTRODES]
    topo_walk = list(topo_home)
    for i in range(N_FRAMES):
        t = round(i / FS, 2)
        # Mean-reverting (Ornstein-Uhlenbeck style) rather than a free random
        # walk. A pure walk over N_FRAMES=3000 steps has sigma ~= 0.63, far
        # wider than the [0,1] range, so channels drifted into the clamp and
        # pinned at 1.0 -- the whole scalp progressively "lit up" over a
        # recording for no physiological reason. Pulling toward each channel's
        # own home value keeps the walk stationary. Same number of rng draws
        # as before, so SDP/CI streams are byte-identical.
        topo_walk = [
            min(1.0, max(0.0, v + rng.uniform(-0.02, 0.02) + TOPO_REVERSION * (home - v)))
            for v, home in zip(topo_walk, topo_home)
        ]
        slow = math.sin(i / 220.0) + 0.4 * math.sin(i / 47.0)
        sdp = sdp_center + sdp_amplitude * slow + rng.uniform(-1.5, 1.5)
        sdp = round(min(100, max(0, sdp)), 1)
        ci_slow = math.sin(i / 260.0 + 1.3)
        ci = ci_center + ci_amplitude * ci_slow + rng.uniform(-0.02, 0.02)
        ci = round(min(1.0, max(0.0, ci)), 3)
        frames.append({
            "t": t,
            "topo": [round(v, 3) for v in topo_walk],
            "sdp": sdp,
            "ci": ci,
        })
    return frames


def write_subject_condition(rng, subject, condition, responsive, subject_offset, subject_jitter):
    sdp_center = sdp_center_for(condition, subject_offset)
    ci_center = ci_center_for(condition, responsive, subject_jitter)
    payload = {
        "subject": subject,
        "condition": condition,
        "responsive": responsive,
        "drug_concentration_ug_ml": DRUG_CONC[condition],
        "fs": FS,
        "electrodes": ELECTRODES,
        "frames": make_frames(
            rng,
            sdp_center=sdp_center,
            sdp_amplitude=7 if condition != "moderate" else 9,
            ci_center=ci_center,
            ci_amplitude=0.06,
        ),
    }
    out_path = OUT_DIR / f"{subject}_{condition}.json"
    out_path.write_text(json.dumps(payload, indent=2))
    return out_path


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    master_rng = random.Random(42)

    subject_ids = [f"S{n:02d}" for n in range(N_SUBJECTS)]
    n_responsive = round(N_SUBJECTS * RESPONSIVE_FRACTION)
    responsive_set = set(master_rng.sample(subject_ids, n_responsive))

    rows = []
    for subject in subject_ids:
        responsive = subject in responsive_set
        subject_offset = master_rng.uniform(-6, 6)
        subject_jitter = master_rng.uniform(-0.05, 0.05)
        subject_seed = master_rng.randint(0, 1 << 30)
        subject_rng = random.Random(subject_seed)

        for condition in CONDITIONS:
            path = write_subject_condition(
                subject_rng, subject, condition, responsive,
                subject_offset, subject_jitter,
            )
            rows.append({
                "subject_id": subject,
                "condition": condition,
                "responsive": responsive,
            })
            print(f"wrote {path.relative_to(OUT_DIR.parent.parent)}")

    csv_path = OUT_DIR / "subjects.csv"
    with csv_path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["subject_id", "condition", "responsive"])
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {csv_path.relative_to(OUT_DIR.parent.parent)}")

    print(f"\n{N_SUBJECTS} subjects x {len(CONDITIONS)} conditions, "
          f"{N_FRAMES} frames each ({DURATION_S}s @ {FS}fs).")
    print(f"{n_responsive}/{N_SUBJECTS} subjects marked responsive.")
    print("SIMULATED data — not real Chennu recordings. Swap in the real")
    print("pipeline output the moment WiFi/download allows (PRD §5, §10).")


if __name__ == "__main__":
    main()
