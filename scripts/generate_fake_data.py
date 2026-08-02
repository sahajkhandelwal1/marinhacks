#!/usr/bin/env python3
"""
Hand-fake JSON generator for PROBE frontend, per probe-prd.md §6.

Produces data/*.json matching the frontend data contract using sine waves
and random walks — no real EEG required. Frontend builds against this from
hour 1 and never waits on the data pipeline.

Usage: python3 scripts/generate_fake_data.py
"""
import json
import math
import random
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent.parent / "data"

# Approximate 10-20 montage positions, normalized to the unit circle, nose at +y.
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

CONDITIONS = {
    # name: (drug_ug_ml, sdp_center, sdp_amplitude)
    "baseline": (0.0, 88, 6),
    "mild": (0.6, 65, 8),
    "moderate": (1.2, 40, 10),
    "recovery": (0.3, 78, 7),
}

FS = 10
DURATION_S = 10  # short demo loop; real emitter will cover full 5-minute conditions
N_FRAMES = FS * DURATION_S


def make_frames(sdp_center, sdp_amplitude, ci_center, seed):
    rng = random.Random(seed)
    frames = []
    topo_walk = [rng.uniform(0.3, 0.7) for _ in ELECTRODES]
    for i in range(N_FRAMES):
        t = round(i / FS, 2)
        topo_walk = [
            min(1.0, max(0.0, v + rng.uniform(-0.03, 0.03)))
            for v in topo_walk
        ]
        sdp = sdp_center + sdp_amplitude * math.sin(i / 15.0) + rng.uniform(-1.5, 1.5)
        sdp = round(min(100, max(0, sdp)), 1)
        ci = round(min(1.0, max(0.0, ci_center + rng.uniform(-0.03, 0.03))), 3)
        frames.append({
            "t": t,
            "topo": [round(v, 3) for v in topo_walk],
            "sdp": sdp,
            "ci": ci,
        })
    return frames


def write_subject_condition(subject, condition, responsive, seed, ci_center):
    drug, sdp_center, sdp_amplitude = CONDITIONS[condition]
    payload = {
        "subject": subject,
        "condition": condition,
        "responsive": responsive,
        "drug_concentration_ug_ml": drug,
        "fs": FS,
        "electrodes": ELECTRODES,
        "frames": make_frames(sdp_center, sdp_amplitude, ci_center, seed),
    }
    out_path = OUT_DIR / f"{subject}_{condition}.json"
    out_path.write_text(json.dumps(payload, indent=2))
    print(f"wrote {out_path.relative_to(OUT_DIR.parent)}")


def main():
    OUT_DIR.mkdir(exist_ok=True)

    # Subject S00: full four-condition sweep for the main slider demo (Tier 0).
    for condition in CONDITIONS:
        write_subject_condition("S00", condition, responsive=False, seed=hash(("S00", condition)) & 0xFFFF, ci_center=0.5)

    # Subject S01: same moderate concentration as S00, but responsive — this is
    # the two-patient "money plot" pair per §3/§8. SDP is deliberately close to
    # S00's moderate SDP so the UI can show SDP failing to distinguish them.
    write_subject_condition("S01", "moderate", responsive=True, seed=hash(("S01", "moderate")) & 0xFFFF, ci_center=0.5)

    print("\nNote: ci is a placeholder center value here, not a real coupling")
    print("computation. If Tier 1 is not reached, the real emitter should")
    print("output ci: null and the frontend should render NOT MEASURED.")


if __name__ == "__main__":
    main()
