#!/usr/bin/env python3
"""
Load the downloaded Chennu BIDS data (see download.py), extract per-subject
responsive/drowsy labels, and hand off arrays matching the PRD §4 B -> You
contract:

    (n_subjects, n_channels, n_samples) float array per condition
    + subjects.csv with subject_id, condition, responsive

Classification: hit rate = correctresponses / 40 on the moderate-sedation
run, threshold 0.6 (PRD §5, matches the original Chennu methodology). This
is a single per-subject label, not per-condition -- the same value is
written for all four of a subject's rows in subjects.csv.

Requires mne (pip install mne, or `pip install -r requirements.txt` from
repo root once uncommented there).
"""
import csv
import warnings
from pathlib import Path

import numpy as np

RAW_DATA_DIR = Path(__file__).resolve().parent / "raw_data"
OUT_DIR = Path(__file__).resolve().parent.parent / "pipeline" / "arrays"

CONDITION_LABELS = {
    "baseline": "baseline",
    "mild sedation": "mild",
    "moderate sedation": "moderate",
    "recovery": "recovery",
}
N_TRIALS = 40
RESPONSIVE_THRESHOLD = 0.6


def read_scans_tsv(subject, raw_data_dir):
    """Returns {run_number: {"condition": str, "concentration": float,
    "reactiontime": float, "correctresponses": int}}"""
    path = raw_data_dir / subject / f"{subject}_scans.tsv"
    rows = {}
    with open(path) as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            # filename like "eeg/sub-02_task-rest_run-3_eeg.vhdr"
            run = int(row["filename"].split("run-")[1].split("_")[0])
            condition = CONDITION_LABELS[row["sedation"]]
            rows[run] = {
                "condition": condition,
                "concentration": float(row["concentration"]),
                "reactiontime": float(row["reactiontime"]),
                "correctresponses": int(row["correctresponses"]),
            }
    return rows


def classify_responsive(scans, threshold=RESPONSIVE_THRESHOLD, n_trials=N_TRIALS):
    """Hit rate at moderate sedation, thresholded. Returns bool."""
    moderate = next(r for r in scans.values() if r["condition"] == "moderate")
    hit_rate = moderate["correctresponses"] / n_trials
    return hit_rate >= threshold


def load_raw(subject, run, raw_data_dir):
    import mne  # deferred: keep this importable without mne for the parts that don't need it
    vhdr = raw_data_dir / subject / "eeg" / f"{subject}_task-rest_run-{run}_eeg.vhdr"
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        raw = mne.io.read_raw_brainvision(vhdr, preload=True, verbose=False)
    return raw


def build_condition_arrays(subjects, raw_data_dir=RAW_DATA_DIR):
    """Returns (arrays, subject_rows) where:
    - arrays: {condition: (subject_ids, np.ndarray (n_subjects, n_channels, n_samples))}
    - subject_rows: list of dicts for subjects.csv
    Trims each condition's array to the shortest subject's sample count for
    that condition -- run durations vary by a few seconds across subjects."""
    per_condition_data = {c: [] for c in CONDITION_LABELS.values()}
    per_condition_subjects = {c: [] for c in CONDITION_LABELS.values()}
    subject_rows = []
    ch_names = None

    for subject in subjects:
        scans = read_scans_tsv(subject, raw_data_dir)
        responsive = classify_responsive(scans)

        for run, meta in sorted(scans.items()):
            raw = load_raw(subject, run, raw_data_dir)
            if ch_names is None:
                ch_names = raw.ch_names
            elif raw.ch_names != ch_names:
                raise ValueError(f"{subject} run-{run} channel layout differs from first subject loaded")

            data = raw.get_data()  # (n_channels, n_samples), volts
            condition = meta["condition"]
            per_condition_data[condition].append(data)
            per_condition_subjects[condition].append(subject)

            subject_rows.append({
                "subject_id": subject,
                "condition": condition,
                "responsive": responsive,
            })

    arrays = {}
    for condition, data_list in per_condition_data.items():
        min_len = min(d.shape[1] for d in data_list)
        stacked = np.stack([d[:, :min_len] for d in data_list])
        arrays[condition] = (per_condition_subjects[condition], stacked)

    return arrays, subject_rows, ch_names


def write_subjects_csv(subject_rows, out_path):
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["subject_id", "condition", "responsive"])
        writer.writeheader()
        writer.writerows(subject_rows)


def main():
    from download import SUBJECTS  # reuse the verified subject list

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    arrays, subject_rows, ch_names = build_condition_arrays(SUBJECTS)

    for condition, (subject_ids, arr) in arrays.items():
        np.save(OUT_DIR / f"{condition}.npy", arr)
        print(f"{condition}: {arr.shape}  ({len(subject_ids)} subjects)")

    (OUT_DIR / "channel_names.txt").write_text("\n".join(ch_names))
    write_subjects_csv(subject_rows, OUT_DIR / "subjects.csv")
    print(f"\nWrote arrays + subjects.csv to {OUT_DIR}")


if __name__ == "__main__":
    main()
