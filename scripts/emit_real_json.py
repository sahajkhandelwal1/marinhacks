#!/usr/bin/env python3
"""
JSON emitter for the REAL local EEGLAB sedation data
(data/new data/Sedation-RestingState/, loaded via
pipeline/load_local_eeglab.py). Modeled on scripts/emit_json.py's emit(),
but wired to actual per-subject EEG arrays instead of synthesized ones --
this is the real hand-off scripts/emit_json.py's docstring was waiting for.

Per scripts/sdp.py's docstring: the product thesis is per-subject
baseline-anchoring, so each subject's own baseline recording fits the SDP
sigmoid midpoint and the topomap's per-channel min-max range; every one of
that subject's 4 condition recordings (baseline included, against itself)
is then scored against that anchor.

ELECTRODES is copied verbatim from scripts/emit_json.py so scalp positions
match between data/synthetic/*.json and data/real/*.json -- required for
both to render through the same Topomap component.

drug_concentration_ug_ml: no dosage figure is available for this dataset,
so it is always null (unlike the synthetic fixtures, which invent one).

ci is always null -- Tier 1 (coupling index) needs stimulus-locked audio
markers that don't survive in this resting-state recording either. See
scripts/null_ci.py and the README's "Data contract" section.

Usage: python3 scripts/emit_real_json.py
"""
import csv
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pipeline"))
import load_local_eeglab as loader  # noqa: E402

import sdp  # noqa: E402

OUT_DIR = Path(__file__).resolve().parent.parent / "data" / "real"

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

# Deviation from scripts/emit_json.py, deliberate and empirically driven:
# literal frontal channels (Fp1, Fp2, F3, F4, Fz) do NOT cleanly separate
# baseline from moderate sedation on this real, unfiltered clinical EEG --
# checked directly (log10 alpha/delta, averaged over each full recording,
# all 20 subjects): mean(baseline - moderate) = -0.06, only 10/20 subjects
# even have the expected sign. That is not a loader bug -- channel names,
# positions (verified via the montage: Fp1/Fp2 have high +y, O1/O2 have
# high -y, i.e. correctly anterior/posterior), condition-index ordering,
# and units all check out. It is a known propofol EEG signature:
# "anteriorization" (Purdon et al. 2013, Cimenser et al. 2011) -- propofol
# INCREASES frontal alpha power even as consciousness drops, which fights
# the naive "less alpha = more sedated" formula at exactly the frontal
# electrodes the PRD's example names. Posterior/parietal channels don't
# have that confound and show the textbook decrease cleanly: same check
# with O1, O2, P3, P4 gives mean(baseline - moderate) = +0.44, correct
# sign in 18/20 subjects. So for the REAL dataset only, the channels fed
# into sdp.compute_sdp's alpha/delta ratio are posterior, not frontal --
# sdp.py's own docstring says this parameter is deliberately not
# hardcoded for exactly this reason. The topomap (all 12 ELECTRODES) and
# the JSON contract are unaffected; this only changes which channels feed
# the scalar SDP number.
SDP_CHANNELS = ["O1", "O2", "P3", "P4"]

TARGET_FS = 10  # match scripts/emit_json.py -- 10 fps to the browser


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
            "ci": None,
        })
    return frames


def subset_channels(data, native_ch_names, wanted_labels):
    idx = [native_ch_names.index(label) for label in wanted_labels]
    return data[idx, :]


def emit(subject, condition, responsive, baseline_data, condition_data, native_ch_names, fs):
    """baseline_data / condition_data: (n_channels_native, n_samples) volts,
    same native channel ordering as native_ch_names. Subsets down to the 12
    ELECTRODES for topo and SDP_CHANNELS for the SDP ratio (see the module
    docstring for why the real dataset uses posterior, not frontal,
    channels here -- the JSON contract itself is unchanged)."""
    baseline_12 = subset_channels(baseline_data, native_ch_names, CH_NAMES)
    condition_12 = subset_channels(condition_data, native_ch_names, CH_NAMES)

    duration_s = condition_12.shape[1] / fs

    _, sdp_native = sdp.compute_sdp(baseline_12, condition_12, fs, CH_NAMES, SDP_CHANNELS)
    t_native, topo_native = sdp.compute_topo(baseline_12, condition_12, fs)

    t_target, sdp_target = resample_series(t_native, sdp_native, TARGET_FS, duration_s)
    _, topo_target = resample_series(t_native, topo_native, TARGET_FS, duration_s)

    payload = {
        "subject": subject,
        "condition": condition,
        "responsive": responsive,
        "drug_concentration_ug_ml": None,  # no dosage figure available for this dataset
        "fs": TARGET_FS,
        "electrodes": ELECTRODES,
        "frames": build_frames(t_target, sdp_target, topo_target),
    }
    out_path = OUT_DIR / f"{subject}_{condition}.json"
    out_path.write_text(json.dumps(payload, indent=2))
    return sdp_target


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    arrays, subject_rows, native_ch_names, fs = loader.build_condition_arrays()
    missing = [c for c in CH_NAMES if c not in native_ch_names]
    if missing:
        raise SystemExit(f"missing target channels in native recording: {missing}")

    responsive_by_subject = {
        row["subject_id"]: row["responsive"] for row in subject_rows
    }

    # arrays: {condition: (subject_ids, (n_subjects, n_channels, n_samples))}
    baseline_subject_ids, baseline_arr = arrays["baseline"]
    baseline_by_subject = {
        sid: baseline_arr[i] for i, sid in enumerate(baseline_subject_ids)
    }

    summary_rows = []
    for condition, (subject_ids, arr) in arrays.items():
        for i, subject_id in enumerate(subject_ids):
            baseline_data = baseline_by_subject[subject_id]
            condition_data = arr[i]
            responsive = responsive_by_subject[subject_id]

            sdp_target = emit(subject_id, condition, responsive, baseline_data, condition_data, native_ch_names, fs)
            summary_rows.append((subject_id, condition, responsive, float(sdp_target.mean())))
            print(f"wrote data/real/{subject_id}_{condition}.json  (SDP mean={sdp_target.mean():.1f})")

    with open(OUT_DIR / "subjects.csv", "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["subject_id", "condition", "responsive"])
        writer.writeheader()
        writer.writerows(subject_rows)
    print(f"\nWrote data/real/*.json + subjects.csv to {OUT_DIR}")

    # --- sanity check: baseline should read meaningfully higher (less
    # sedated) than moderate for most subjects (scripts/sdp.py's own
    # self-test logic, applied per-subject here). ---
    print("\nper-subject baseline vs moderate SDP mean:")
    by_subject_cond = {}
    for subject_id, condition, responsive, mean_sdp in summary_rows:
        by_subject_cond.setdefault(subject_id, {})[condition] = mean_sdp

    higher = 0
    for subject_id in sorted(by_subject_cond):
        vals = by_subject_cond[subject_id]
        b, m = vals.get("baseline"), vals.get("moderate")
        ok = b is not None and m is not None and b > m
        higher += int(ok)
        print(f"  {subject_id}: baseline={b:.1f}  moderate={m:.1f}  {'OK' if ok else 'FLAT/INVERTED'}")
    print(f"\n{higher}/{len(by_subject_cond)} subjects: baseline SDP > moderate SDP")


if __name__ == "__main__":
    main()
