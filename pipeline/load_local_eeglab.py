#!/usr/bin/env python3
"""
Load the local EEGLAB-format copy of the Chennu-style sedation study
(data/new data/Sedation-RestingState/, gitignored, not the public BIDS
release that pipeline/load.py targets).

Layout, established by inspection (see scripts/emit_real_json.py's sibling
investigation and this repo's README):

- One `datainfo.mat` (MATLAB v7.3 / HDF5, needs h5py + pymatreader — plain
  scipy.io.loadmat can't read it) with an (80, 5) object array. Each row:
  [filename_stem, condition_index(1-4), col3(uint), col4(uint),
  correct_responses_out_of_40]. filename_stem matches a `<stem>.set` file
  in the same directory (MNE finds the paired .fdt automatically).
- Subject id = the leading numeric prefix of filename_stem, before the
  first "-", e.g. "02-2010-anest 20100210 135.003" -> "02". 20 subjects,
  4 rows (conditions) each = 80 rows, matching the 80 .set files.
- condition_index 1=baseline, 2=mild, 3=moderate, 4=recovery. Verified by
  grouping correct_responses by condition_index across all 20 subjects:
  means are baseline=37.9, mild=34.3, moderate=26.85, recovery=37.6 --
  moderate shows the systematic drop the Chennu paradigm predicts, and
  recovery bounces back, so the ordering matches CONDITION_LABELS in
  pipeline/load.py and CONDITIONS in scripts/generate_synthetic_dataset.py.
- Each .set file is EPOCHED (not continuous raw) -- e.g. 39 epochs x 2500
  samples x 91 channels at 250 Hz for one file inspected directly. Loaded
  with mne.io.read_epochs_eeglab and concatenated epoch-to-epoch along time
  to reconstruct one continuous-ish recording per condition (same spirit as
  concatenating a resting-state run from consecutive clean segments).
- Channel names: all 12 target 10-20 labels (Fp1, Fp2, F3, F4, Fz, C3, C4,
  Cz, P3, P4, O1, O2) are present verbatim (case-sensitive) among the 91
  channels (mix of 10-20 names and E-numbered EGI labels). No remapping
  needed.

Responsive/drowsy labeling: identical convention to pipeline/load.py --
hit_rate = correct_responses / 40 on the subject's condition_index==3
(moderate) row, responsive = hit_rate >= 0.6. One label per subject,
applied to all 4 of that subject's condition rows.

Output (mirrors pipeline/load.py's arrays/ contract, written to a
separate, gitignored directory so nothing existing is touched):
    pipeline/arrays_real/{condition}.npy   (n_subjects, n_channels, n_samples)
    pipeline/arrays_real/channel_names.txt
    pipeline/arrays_real/subjects.csv      subject_id,condition,responsive

Usage: python3 pipeline/load_local_eeglab.py
"""
import csv
import warnings
from pathlib import Path

import numpy as np
import scipy.io as sio

RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "new data" / "Sedation-RestingState"
OUT_DIR = Path(__file__).resolve().parent / "arrays_real"

CONDITION_INDEX_TO_LABEL = {1: "baseline", 2: "mild", 3: "moderate", 4: "recovery"}
N_TRIALS = 40
RESPONSIVE_THRESHOLD = 0.6


def read_datainfo(raw_dir=RAW_DIR):
    """Returns {subject_id: {condition: {"stem": str, "correct": int}}}"""
    mat = sio.loadmat(raw_dir / "datainfo.mat")
    rows = mat["datainfo"]

    by_subject = {}
    for row in rows:
        stem = str(row[0][0])
        condition_index = int(row[1][0][0])
        correct = int(row[4][0][0])
        subject_id = stem.split("-")[0]
        condition = CONDITION_INDEX_TO_LABEL[condition_index]
        by_subject.setdefault(subject_id, {})[condition] = {
            "stem": stem,
            "correct": correct,
        }
    return by_subject


def classify_responsive(conditions, threshold=RESPONSIVE_THRESHOLD, n_trials=N_TRIALS):
    hit_rate = conditions["moderate"]["correct"] / n_trials
    return hit_rate >= threshold


def load_condition_data(stem, raw_dir=RAW_DIR):
    """Loads one .set (epoched EEGLAB file), concatenates epochs end-to-end
    into a single (n_channels, n_samples) continuous array in volts, plus
    the native sampling rate and channel names."""
    import mne  # deferred: keep this importable without mne for the parts that don't

    set_path = raw_dir / f"{stem}.set"
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        epochs = mne.io.read_epochs_eeglab(str(set_path), verbose="ERROR")

    data = epochs.get_data()  # (n_epochs, n_channels, n_times), volts
    n_epochs, n_channels, n_times = data.shape
    continuous = np.transpose(data, (1, 0, 2)).reshape(n_channels, n_epochs * n_times)
    return continuous, float(epochs.info["sfreq"]), list(epochs.ch_names)


def build_condition_arrays(raw_dir=RAW_DIR):
    """Returns (arrays, subject_rows, ch_names, fs) where:
    - arrays: {condition: (subject_ids, np.ndarray (n_subjects, n_channels, n_samples))}
    - subject_rows: list of dicts for subjects.csv
    Trims each condition's array to the shortest subject's sample count for
    that condition, same approach as pipeline/load.py."""
    by_subject = read_datainfo(raw_dir)
    subjects = sorted(by_subject)

    per_condition_data = {c: [] for c in CONDITION_INDEX_TO_LABEL.values()}
    per_condition_subjects = {c: [] for c in CONDITION_INDEX_TO_LABEL.values()}
    subject_rows = []
    ch_names = None
    fs = None

    for subject_id in subjects:
        conditions = by_subject[subject_id]
        if set(conditions) != set(CONDITION_INDEX_TO_LABEL.values()):
            raise ValueError(f"subject {subject_id}: expected 4 conditions, got {sorted(conditions)}")

        responsive = classify_responsive(conditions)

        for condition, meta in conditions.items():
            data, this_fs, this_ch_names = load_condition_data(meta["stem"], raw_dir)
            if ch_names is None:
                ch_names, fs = this_ch_names, this_fs
            elif set(this_ch_names) != set(ch_names):
                raise ValueError(f"{subject_id} {condition} channel set differs from first subject loaded")
            elif this_fs != fs:
                raise ValueError(f"{subject_id} {condition} sfreq {this_fs} != {fs}")
            elif this_ch_names != ch_names:
                # Same 91 channels, different column order between recordings
                # (observed even within one subject, across conditions) --
                # reindex by name onto the canonical order fixed by the
                # first file loaded, rather than trusting column position.
                order = [this_ch_names.index(name) for name in ch_names]
                data = data[order, :]

            per_condition_data[condition].append(data)
            per_condition_subjects[condition].append(subject_id)

            subject_rows.append({
                "subject_id": subject_id,
                "condition": condition,
                "responsive": responsive,
            })

    arrays = {}
    for condition, data_list in per_condition_data.items():
        min_len = min(d.shape[1] for d in data_list)
        stacked = np.stack([d[:, :min_len] for d in data_list])
        arrays[condition] = (per_condition_subjects[condition], stacked)

    return arrays, subject_rows, ch_names, fs


def write_subjects_csv(subject_rows, out_path):
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["subject_id", "condition", "responsive"])
        writer.writeheader()
        writer.writerows(subject_rows)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    arrays, subject_rows, ch_names, fs = build_condition_arrays()

    for condition, (subject_ids, arr) in arrays.items():
        np.save(OUT_DIR / f"{condition}.npy", arr)
        print(f"{condition}: {arr.shape}  ({len(subject_ids)} subjects)  fs={fs}")

    (OUT_DIR / "channel_names.txt").write_text("\n".join(ch_names))
    write_subjects_csv(subject_rows, OUT_DIR / "subjects.csv")
    print(f"\nWrote arrays + subjects.csv to {OUT_DIR}")


if __name__ == "__main__":
    main()
