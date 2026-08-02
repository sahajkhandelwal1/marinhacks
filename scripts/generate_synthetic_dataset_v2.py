#!/usr/bin/env python3
"""
Synthetic dataset v2 -- data/synthetic 2.0/.

Unlike data/synthetic/ (generated as hand-faked sdp/topo/ci numbers,
independent of the responsive label by design -- see
generate_synthetic_dataset.py), this version generates raw synthetic EEG
per subject/condition and runs it through the ACTUAL spectral pipeline in
scripts/sdp.py -- the same compute_sdp / compute_topo code that runs on
real data. sdp and topo values here are computed, not hand-faked, which is
what "looks like it could be real" means in practice: the numbers are the
output of a real signal-processing pipeline applied to a plausible (if
synthetic) EEG signal, not authored directly.

Purpose and honesty note: data/synthetic/ exists to demonstrate the PRD's
core claim -- SDP-shaped features carry no population-level responsiveness
signal (Gaskell et al. 2017, PRD §1). This dataset asks the complementary
question instead: what happens to a trained classifier if there IS a
moderate, physiologically plausible spectral difference between responders
and non-responders at matched sedation depth? RESPONDER_DEPTH_SCALE below
controls how much shallower a responsive subject's cortex "acts" relative
to nominal drug concentration. It's tuned (with per-subject jitter, so the
groups still overlap) to produce good-but-imperfect classifier separation
-- real biomarkers don't separate perfectly, and a suspiciously clean
result would look less real, not more. This dataset is NOT a replacement
for data/synthetic/ or the pitch narrative; it exists for model-development
exploration.

Raw EEG model per channel: pink (1/f) background + an alpha component
(8-13 Hz, suppressed by depth) + a delta component (0.5-4 Hz, elevated by
depth), each with independent per-subject gain (individual variability,
same idea as real inter-subject variability in spectral response to
propofol). Frontal channels carry the primary depth-linked modulation;
posterior channels (O1/O2) keep a stronger baseline (posterior alpha
dominance) that is only partly depth-modulated, so the topomap has a
plausible spatial structure instead of being uniform.

Usage: python3 "scripts/generate_synthetic_dataset_v2.py"
"""
import csv
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sdp  # scripts/sdp.py -- the real pipeline

OUT_DIR = Path(__file__).resolve().parent.parent / "data" / "synthetic 2.0"

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
POSTERIOR_CHANNELS = ["O1", "O2", "P3", "P4"]

CONDITIONS = ["baseline", "mild", "moderate", "recovery"]
DEPTH = {"baseline": 0.0, "mild": 0.45, "moderate": 1.0, "recovery": 0.1}
DRUG_CONCENTRATION = {"baseline": 0.0, "mild": 0.6, "moderate": 1.2, "recovery": 0.3}

RAW_FS = 250
DURATION_S = 300  # full 5-minute condition, PRD §5
TARGET_FS = 10  # ship 10 fps to the browser, PRD §6

N_SUBJECTS = 20
RESPONSIVE_FRACTION = 0.35  # ~34.8% IFT figure, PRD §1

# How much shallower a responder's cortex "acts" relative to nominal drug
# concentration, at conditions where sedation is actually present (mild,
# moderate). 1.0 = no difference from non-responders. Lower = bigger,
# easier-to-classify gap. Deliberately wide jitter, and non-responders get
# their own (smaller) jitter too, so the two groups' distributions overlap
# -- a perfectly-separable classifier (100% LOSO accuracy) would look less
# real, not more; no real biomarker separates two behavioral groups
# cleanly. Chosen empirically to land the LOSO classifier in a "clearly
# better than chance, nowhere near perfect" range -- see
# results/classifier_report_v2.md for the number this actually produced.
RESPONDER_DEPTH_SCALE = 0.75
RESPONDER_DEPTH_SCALE_JITTER = 0.20  # per-subject spread around the scale above
NONRESPONDER_DEPTH_JITTER = 0.15  # non-responders aren't pinned at exactly depth=1.0 either


def _pink_background(n_samples, fs, rng):
    white = rng.normal(0, 1, n_samples)
    freqs = np.fft.rfftfreq(n_samples, 1 / fs)
    freqs[0] = 1e-6
    pink = np.fft.irfft(np.fft.rfft(white) / freqs**0.9, n=n_samples)
    return pink / pink.std()


def _slow_amplitude_envelope(n_samples, fs, rng, rel_std=0.30, smooth_sec=4.0):
    """Real EEG band amplitude drifts over seconds (arousal fluctuation,
    electrode/skin impedance, etc); a constant-amplitude sinusoid has near-
    zero window-to-window variance, which made compute_topo's baseline
    range degenerate (see compute_topo_smooth docstring). Low-pass-filtered
    white noise, centered at 1.0, floor clipped so amplitude never goes
    negative."""
    white = rng.normal(0, 1, n_samples)
    kernel_len = max(1, int(smooth_sec * fs))
    kernel = np.ones(kernel_len) / kernel_len
    smoothed = np.convolve(white, kernel, mode="same")
    smoothed = smoothed / smoothed.std()
    return np.clip(1.0 + rel_std * smoothed, 0.35, None)


def _channel_raw_eeg(rng, fs, duration_s, depth, alpha_gain, delta_gain, is_posterior):
    n_samples = int(fs * duration_s)
    t = np.arange(n_samples) / fs

    bg = _pink_background(n_samples, fs, rng)

    # Posterior channels keep more baseline alpha regardless of depth
    # (posterior alpha dominance, a real EEG feature); frontal channels
    # are where the depth-linked suppression is strongest and where SDP
    # actually looks (scripts/sdp.py FRONTAL_CHANNELS).
    posterior_floor = 0.35 if is_posterior else 0.0
    alpha_env = alpha_gain * (posterior_floor + (1.0 - posterior_floor) * (1.0 - 0.75 * depth))
    delta_env = delta_gain * (0.3 + 2.6 * depth)

    alpha_envelope = _slow_amplitude_envelope(n_samples, fs, rng)
    delta_envelope = _slow_amplitude_envelope(n_samples, fs, rng)
    alpha = alpha_env * alpha_envelope * np.sin(2 * np.pi * 10 * t + rng.uniform(0, 2 * np.pi))
    delta = delta_env * delta_envelope * np.sin(2 * np.pi * 1.5 * t + rng.uniform(0, 2 * np.pi))
    # small beta/theta components purely for spectral realism -- not used
    # by SDP's band ratio, just keeps the PSD shape less obviously synthetic
    beta = 0.25 * np.sin(2 * np.pi * 20 * t + rng.uniform(0, 2 * np.pi))
    theta = 0.2 * np.sin(2 * np.pi * 6 * t + rng.uniform(0, 2 * np.pi))

    return bg * 0.6 + alpha + delta + beta + theta


def generate_subject_condition_eeg(rng, condition, responsive, subject_alpha_gain,
                                    subject_delta_gain, subject_depth_scale):
    depth = DEPTH[condition]
    if condition in ("mild", "moderate"):
        depth = depth * subject_depth_scale

    data = np.zeros((len(CH_NAMES), int(RAW_FS * DURATION_S)))
    for i, ch in enumerate(CH_NAMES):
        is_posterior = ch in POSTERIOR_CHANNELS
        data[i] = _channel_raw_eeg(
            rng, RAW_FS, DURATION_S, depth,
            alpha_gain=subject_alpha_gain, delta_gain=subject_delta_gain,
            is_posterior=is_posterior,
        )
    return data


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
            "ci": None,  # Tier 1 not computed here either -- see PRD §6/§7.2
        })
    return frames


def compute_topo_smooth(baseline_data, condition_data, fs, band=sdp.BANDS["alpha"], k=3.0):
    """Same real pipeline as sdp.compute_topo (channel_band_power_series +
    topo_from_log_power), but the per-channel baseline range is mean +/-
    k*std instead of sdp.py's literal min/max. A short single-condition
    baseline recording has a narrow observed min/max, so any real
    sedation-driven drop clips every channel to exactly 0 -- verified this
    happens in the existing data/S00_moderate.json fixture too. A flat,
    uniform topomap reads as obviously synthetic, not more real, so this
    widens the range instead of patching sdp.py's shared default."""
    _, log_power_baseline = sdp.channel_band_power_series(baseline_data, fs, band)
    mu = log_power_baseline.mean(axis=0)
    sigma = log_power_baseline.std(axis=0)
    lo, hi = mu - k * sigma, mu + k * sigma
    t, log_power_cond = sdp.channel_band_power_series(condition_data, fs, band)
    return t, sdp.topo_from_log_power(log_power_cond, lo, hi)


def write_subject_condition(subject, condition, responsive, baseline_data, condition_data):
    _, sdp_native = sdp.compute_sdp(baseline_data, condition_data, RAW_FS, CH_NAMES, FRONTAL_CHANNELS)
    t_native, topo_native = compute_topo_smooth(baseline_data, condition_data, RAW_FS)

    t_target, sdp_target = resample_series(t_native, sdp_native, TARGET_FS, DURATION_S)
    _, topo_target = resample_series(t_native, topo_native, TARGET_FS, DURATION_S)

    payload = {
        "subject": subject,
        "condition": condition,
        "responsive": responsive,
        "drug_concentration_ug_ml": DRUG_CONCENTRATION[condition],
        "fs": TARGET_FS,
        "electrodes": ELECTRODES,
        "frames": build_frames(t_target, sdp_target, topo_target),
    }
    out_path = OUT_DIR / f"{subject}_{condition}.json"
    out_path.write_text(json.dumps(payload, indent=2))
    print(f"wrote {out_path.relative_to(OUT_DIR.parent.parent)}  "
          f"(SDP mean={sdp_target.mean():.1f})")
    return out_path


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    master_rng = np.random.default_rng(42)

    subject_ids = [f"S{n:02d}" for n in range(N_SUBJECTS)]
    n_responsive = round(N_SUBJECTS * RESPONSIVE_FRACTION)
    responsive_set = set(master_rng.choice(subject_ids, n_responsive, replace=False))

    rows = []
    for subject in subject_ids:
        responsive = subject in responsive_set

        # Per-subject variability: individual differences in overall
        # alpha/delta reactivity (real inter-subject spread), plus a
        # jittered effective-depth scale for BOTH groups (centered
        # differently) so the two distributions overlap rather than split
        # on a hard threshold.
        subject_alpha_gain = master_rng.normal(1.0, 0.18)
        subject_delta_gain = master_rng.normal(1.0, 0.18)
        if responsive:
            subject_depth_scale = np.clip(
                master_rng.normal(RESPONDER_DEPTH_SCALE, RESPONDER_DEPTH_SCALE_JITTER),
                0.35, 1.05,
            )
        else:
            subject_depth_scale = np.clip(
                master_rng.normal(1.0, NONRESPONDER_DEPTH_JITTER),
                0.7, 1.3,
            )
        subject_seed = int(master_rng.integers(0, 1 << 30))
        subject_rng = np.random.default_rng(subject_seed)

        baseline_data = generate_subject_condition_eeg(
            subject_rng, "baseline", responsive,
            subject_alpha_gain, subject_delta_gain, subject_depth_scale,
        )

        for condition in CONDITIONS:
            if condition == "baseline":
                cond_data = baseline_data
            else:
                cond_data = generate_subject_condition_eeg(
                    subject_rng, condition, responsive,
                    subject_alpha_gain, subject_delta_gain, subject_depth_scale,
                )
            write_subject_condition(subject, condition, responsive, baseline_data, cond_data)
            rows.append({"subject_id": subject, "condition": condition, "responsive": responsive})

    csv_path = OUT_DIR / "subjects.csv"
    with csv_path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["subject_id", "condition", "responsive"])
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {csv_path.relative_to(OUT_DIR.parent.parent)}")

    print(f"\n{N_SUBJECTS} subjects x {len(CONDITIONS)} conditions, computed via the real "
          f"SDP pipeline (scripts/sdp.py), {DURATION_S}s raw @ {RAW_FS}Hz -> {TARGET_FS}fps.")
    print(f"{n_responsive}/{N_SUBJECTS} subjects marked responsive.")
    print("SIMULATED data with an injected, tunable responder/non-responder spectral "
          "gap -- see module docstring. Not the pitch dataset (data/synthetic/); this "
          "one is for model-development exploration.")


if __name__ == "__main__":
    main()
