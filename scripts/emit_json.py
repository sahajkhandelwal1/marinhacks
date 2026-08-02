#!/usr/bin/env python3
"""
JSON emitter — wires SDP + topomap computation into the data/*.json contract
(probe-prd.md §6). Currently runs on synthetic EEG so it's ready the moment
Teammate B hands off real (baseline_data, condition_data, fs, ch_names)
arrays — swap _synthetic_eeg() calls in main() for real arrays and nothing
else in this file needs to change.

ci is always emitted as null: Tier 1 is confirmed dead on the public Chennu
release (resting-state only, no stimulus-locked markers survive the BIDS
conversion — see the planning notes). Frontend renders NOT MEASURED.
"""
import json
from pathlib import Path

import numpy as np

import sdp

OUT_DIR = Path(__file__).resolve().parent.parent / "data"

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
CH_NAMES = [e["label"] for e in ELECTRODES]
FRONTAL_CHANNELS = ["Fp1", "Fp2", "F3", "F4", "Fz"]

TARGET_FS = 10  # PRD §6: ship 10 fps to the browser, not raw EEG rate


def resample_series(t_native, values, target_fs, duration_s):
    t_target = np.arange(0, duration_s, 1.0 / target_fs)
    if values.ndim == 1:
        return t_target, np.interp(t_target, t_native, values)
    out = np.zeros((len(t_target), values.shape[1]))
    for c in range(values.shape[1]):
        out[:, c] = np.interp(t_target, t_native, values[:, c])
    return t_target, out


def build_frames(t_target, sdp_series, topo_series):
    frames = []
    for i, t in enumerate(t_target):
        frames.append({
            "t": round(float(t), 2),
            "topo": [round(float(v), 3) for v in topo_series[i]],
            "sdp": round(float(sdp_series[i]), 1),
            "ci": None,  # Tier 1 not computable on Chennu -- see planning notes
        })
    return frames


def emit(subject, condition, responsive, drug_ug_ml, baseline_data, condition_data, fs, duration_s):
    _, sdp_native = sdp.compute_sdp(baseline_data, condition_data, fs, CH_NAMES, FRONTAL_CHANNELS)
    t_native, topo_native = sdp.compute_topo(baseline_data, condition_data, fs)

    t_target, sdp_target = resample_series(t_native, sdp_native, TARGET_FS, duration_s)
    _, topo_target = resample_series(t_native, topo_native, TARGET_FS, duration_s)

    payload = {
        "subject": subject,
        "condition": condition,
        "responsive": responsive,
        "drug_concentration_ug_ml": drug_ug_ml,
        "fs": TARGET_FS,
        "electrodes": ELECTRODES,
        "frames": build_frames(t_target, sdp_target, topo_target),
    }
    out_path = OUT_DIR / f"{subject}_{condition}.json"
    out_path.write_text(json.dumps(payload, indent=2))
    print(f"wrote {out_path.relative_to(OUT_DIR.parent)}  (SDP mean={sdp_target.mean():.1f})")


# --- synthetic EEG stand-in, until B hands off real Chennu arrays ---
#
# DEPTH-parameterized generator (ported from an earlier bootstrap.py):
# one knob per condition (how sedated) instead of hand-tuned alpha/delta
# pairs. RESPONDER_SPECTRAL_OFFSET encodes the Gaskell et al. finding
# directly (PRD §1): a responsive subject's spectrum at a given drug
# concentration looks nearly as sedated as a non-responsive subject's —
# the alpha-delta pattern doesn't distinguish them. Set close to 1.0 (not
# exactly 1.0) so the money-plot pair is close but not literally identical.

DEPTH = {"baseline": 0.0, "mild": 0.45, "moderate": 1.0, "recovery": 0.1}
RESPONDER_SPECTRAL_OFFSET = 0.90
DRUG_CONCENTRATION = {"baseline": 0.0, "mild": 0.6, "moderate": 1.2, "recovery": 0.3}


def _pink_background(n_samples, fs, rng):
    """~1/f background, closer to real EEG's spectral shape than white noise."""
    white = rng.normal(0, 1, n_samples)
    freqs = np.fft.rfftfreq(n_samples, 1 / fs)
    freqs[0] = 1e-6
    pink = np.fft.irfft(np.fft.rfft(white) / freqs**0.9, n=n_samples)
    return pink / pink.std()


def _synthetic_eeg(fs, duration_s, n_channels, depth, seed):
    rng = np.random.default_rng(seed)
    n_samples = int(fs * duration_s)
    t = np.arange(n_samples) / fs
    data = np.zeros((n_channels, n_samples))
    for ch in range(n_channels):
        bg = _pink_background(n_samples, fs, rng)
        alpha = (1.0 - 0.75 * depth) * np.sin(2 * np.pi * 10 * t + rng.uniform(0, 2 * np.pi))
        delta = (0.3 + 2.6 * depth) * np.sin(2 * np.pi * 1.5 * t + rng.uniform(0, 2 * np.pi))
        data[ch] = bg * 0.6 + alpha + delta
    return data


def main():
    OUT_DIR.mkdir(exist_ok=True)
    fs = 250
    duration_s = 30  # short demo loop; a real emitter run covers the full 5-minute conditions

    s00_baseline = _synthetic_eeg(fs, duration_s, len(CH_NAMES), DEPTH["baseline"], seed=10)
    for condition, depth in DEPTH.items():
        cond_data = _synthetic_eeg(fs, duration_s, len(CH_NAMES), depth, seed=hash(("S00", condition)) & 0xFFFF)
        emit("S00", condition, False, DRUG_CONCENTRATION[condition], s00_baseline, cond_data, fs, duration_s)

    s01_baseline = _synthetic_eeg(fs, duration_s, len(CH_NAMES), DEPTH["baseline"], seed=20)
    s01_moderate = _synthetic_eeg(fs, duration_s, len(CH_NAMES), DEPTH["moderate"] * RESPONDER_SPECTRAL_OFFSET, seed=21)
    emit("S01", "moderate", True, DRUG_CONCENTRATION["moderate"], s01_baseline, s01_moderate, fs, duration_s)


if __name__ == "__main__":
    main()
