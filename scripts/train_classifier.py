#!/usr/bin/env python3
"""
Trained-classifier companion to SDP, on the synthetic dataset.

vigil-prd.md is explicit that a supervised responsive/drowsy classifier is
the WRONG tool for this problem in the real world: real-world awareness
prevalence is ~0.1%, far too sparse to assemble a labeled dataset, which is
the whole argument for CI as anomaly detection against a per-patient
baseline instead (PRD §2 "why label scarcity stops being a problem").

This script exists as a rhetorical companion, not a product feature: the
synthetic dataset DOES have per-subject labels (subjects.csv), so we can
actually run the classifier experiment here and report what happens.

Honesty caveat, load-bearing, repeated in the output: `sdp` and `topo` in
data/synthetic/*.json are generated independently of the responsive label
(see generate_synthetic_dataset.py's sdp_center_for / make_frames — no
`responsive` argument). Only `ci` is generated as a function of the label.
So this classifier is trained on features that were never given a signal
to find. A near-chance result is expected BY CONSTRUCTION, not a general
claim about EEG classifiers. The point is the LOSO methodology and a
concrete number to contrast against once real Chennu spectral features
replace the synthetic sdp/topo series.

data/synthetic 2.0/ (generate_synthetic_dataset_v2.py) is a second dataset
where sdp/topo ARE computed from raw synthetic EEG that has a deliberate,
tunable spectral gap between responders and non-responders — pass
--data-dir "data/synthetic 2.0" to run against it instead; the report
caveat text adjusts accordingly.

Usage: python3 scripts/train_classifier.py [--data-dir DIR] [--results-dir DIR]
"""
import argparse
import csv
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, confusion_matrix
from sklearn.model_selection import LeaveOneOut
from sklearn.preprocessing import StandardScaler

REPO_ROOT = Path(__file__).resolve().parent.parent
CONDITION = "moderate"

FEATURE_NAMES = ["sdp_mean", "sdp_std", "sdp_trend", "topo_mean", "topo_std"]


def load_labels(data_dir):
    labels = {}
    with (data_dir / "subjects.csv").open() as f:
        for row in csv.DictReader(f):
            if row["condition"] == CONDITION:
                labels[row["subject_id"]] = row["responsive"] == "True"
    return labels


def extract_features(doc):
    """doc: parsed S##_moderate.json. Returns a 5-vector; see FEATURE_NAMES.

    ci is deliberately excluded (see module docstring) -- it is generated
    directly from the responsive label and would make this a circularity,
    not a classifier.
    """
    frames = doc["frames"]
    t = np.array([f["t"] for f in frames])
    sdp = np.array([f["sdp"] for f in frames])
    topo = np.array([f["topo"] for f in frames])  # (n_frames, n_channels)

    sdp_mean = sdp.mean()
    sdp_std = sdp.std()
    sdp_trend = np.polyfit(t, sdp, 1)[0]  # slope, sdp units per second
    topo_mean = topo.mean()
    topo_std = topo.std(axis=1).mean()  # spatial spread, averaged over time

    return np.array([sdp_mean, sdp_std, sdp_trend, topo_mean, topo_std])


def build_dataset(data_dir):
    labels = load_labels(data_dir)
    subjects = sorted(labels.keys())

    X, y = [], []
    for subject in subjects:
        doc = json.loads((data_dir / f"{subject}_{CONDITION}.json").read_text())
        X.append(extract_features(doc))
        y.append(labels[subject])

    return subjects, np.array(X), np.array(y, dtype=bool)


def run_loso(X, y):
    """Leave-one-subject-out CV. With one row per subject this is plain
    LOO, but named for what it guarantees: never train and test on the
    same subject."""
    loo = LeaveOneOut()
    y_pred = np.zeros(len(y), dtype=bool)
    y_prob = np.zeros(len(y))

    for train_idx, test_idx in loo.split(X):
        scaler = StandardScaler().fit(X[train_idx])
        X_train = scaler.transform(X[train_idx])
        X_test = scaler.transform(X[test_idx])

        clf = LogisticRegression(C=1.0, max_iter=1000)
        clf.fit(X_train, y[train_idx])

        y_pred[test_idx] = clf.predict(X_test)
        y_prob[test_idx] = clf.predict_proba(X_test)[:, 1]

    return y_pred, y_prob


def make_scatter(subjects, X, y, y_pred, out_path):
    fig, ax = plt.subplots(figsize=(6, 5))
    colors = np.where(y, "#2ca02c", "#7f7f7f")
    markers_correct = y == y_pred

    ax.scatter(X[markers_correct, 0], X[markers_correct, 3],
               c=colors[markers_correct], marker="o", s=90,
               edgecolors="black", linewidths=0.5, label="_nolegend_")
    ax.scatter(X[~markers_correct, 0], X[~markers_correct, 3],
               c=colors[~markers_correct], marker="x", s=110,
               linewidths=2.5, label="_nolegend_")

    for i, subject in enumerate(subjects):
        ax.annotate(subject, (X[i, 0], X[i, 3]), fontsize=7,
                    xytext=(4, 4), textcoords="offset points")

    ax.set_xlabel("sdp_mean")
    ax.set_ylabel("topo_mean")
    ax.set_title("Moderate sedation: responsive (green) vs. not (grey)\n"
                  "o = LOSO-correct, x = LOSO-misclassified")
    fig.tight_layout()
    fig.savefig(out_path, dpi=150)
    plt.close(fig)


DEFAULT_CAVEAT = (
    "**Caveat, load-bearing:** `sdp` and `topo` in `data/synthetic/*.json` "
    "are generated independently of the `responsive` label "
    "(see `generate_synthetic_dataset.py`). Only `ci` is a function of "
    "the label, and `ci` is excluded from these features. A near-chance "
    "result below is expected **by construction**, not a general finding "
    "about EEG classifiers — this reports the LOSO methodology and a "
    "concrete number to replace once real Chennu spectral features are "
    "available."
)

V2_CAVEAT = (
    "**Caveat, load-bearing:** this run is against `data/synthetic 2.0/`, "
    "not the pitch dataset. Those `sdp`/`topo` values are computed by the "
    "real pipeline (`scripts/sdp.py`) from raw synthetic EEG that has a "
    "deliberate, tuned spectral gap between responders and non-responders "
    "(see `generate_synthetic_dataset_v2.py`, `RESPONDER_DEPTH_SCALE`). A "
    "clearly-above-chance result here demonstrates the classifier and "
    "pipeline work when a genuine signal exists — it is not evidence that "
    "such a signal exists in real EEG, and it is not the product's dataset "
    "or claim."
)


DEFAULT_READING = (
    "If accuracy sits near the majority baseline, that's consistent "
    "with the PRD's core argument: SDP-shaped features (single-ratio "
    "depth proxy + coarse topomap) don't carry population-level "
    "responsiveness signal, mirroring Gaskell et al. 2017's finding "
    "that frontal alpha-delta is present in patients who respond to "
    "command. It does not mean no signal exists in real EEG — it means "
    "this signal, on this feature set, wasn't there to begin with. "
    "That's exactly why the product bets on CI (anomaly detection vs. "
    "a per-patient baseline) instead of a population classifier."
)

V2_READING = (
    "This accuracy sitting clearly above the majority baseline is expected: "
    "`data/synthetic 2.0/` was built specifically to contain a genuine, "
    "tuned spectral gap between the two groups (`RESPONDER_DEPTH_SCALE` in "
    "`generate_synthetic_dataset_v2.py`), with deliberate per-subject noise "
    "so it isn't perfectly separable either. It shows the LOSO methodology "
    "and feature pipeline correctly pick up a real signal when one exists "
    "in the underlying EEG. It says nothing about whether a comparable "
    "signal exists in real patients — that's an open empirical question "
    "this dataset cannot answer, and it's why the product still bets on "
    "CI/anomaly-detection (PRD §2) rather than a population classifier for "
    "the real-world, label-scarce case."
)


def write_report(subjects, y, y_pred, y_prob, acc, auc, cm, out_path, caveat=DEFAULT_CAVEAT,
                  title="# Trained classifier vs. SDP — synthetic data, moderate condition",
                  reading=DEFAULT_READING):
    majority_baseline = max((~y).mean(), y.mean())

    lines = [
        title,
        "",
        caveat,
        "",
        f"n = {len(y)} subjects, moderate condition, "
        f"{int(y.sum())} responsive / {int((~y).sum())} non-responsive.",
        "",
        "## Result",
        "",
        f"- Leave-one-subject-out accuracy: **{acc:.1%}**",
        f"- Majority-class baseline: {majority_baseline:.1%}",
        f"- ROC-AUC: **{auc:.3f}** (0.5 = chance)",
        f"- Confusion matrix (rows=true, cols=predicted, "
        f"[non-responsive, responsive]):",
        "",
        "```",
        str(cm),
        "```",
        "",
        "## Per-subject predictions",
        "",
        "| subject | responsive | predicted | P(responsive) | correct |",
        "|---|---|---|---|---|",
    ]
    for subject, yi, pi, prob in zip(subjects, y, y_pred, y_prob):
        lines.append(
            f"| {subject} | {yi} | {pi} | {prob:.2f} | {'✓' if yi == pi else '✗'} |"
        )
    lines += [
        "",
        "## Reading this",
        "",
        reading,
        "",
    ]
    out_path.write_text("\n".join(lines))


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", default="data/synthetic",
                         help='Dataset directory, relative to repo root (default: "data/synthetic")')
    parser.add_argument("--results-dir", default="results",
                         help='Where to write the report/plot (default: "results")')
    return parser.parse_args()


def main():
    args = parse_args()
    data_dir = (REPO_ROOT / args.data_dir).resolve()
    results_dir = (REPO_ROOT / args.results_dir).resolve()
    is_v2 = data_dir.name == "synthetic 2.0"

    results_dir.mkdir(parents=True, exist_ok=True)

    subjects, X, y = build_dataset(data_dir)
    y_pred, y_prob = run_loso(X, y)

    acc = (y_pred == y).mean()
    auc = roc_auc_score(y, y_prob)
    cm = confusion_matrix(y, y_pred)

    print(f"data dir: {data_dir.relative_to(REPO_ROOT)}")
    print(f"subjects: {len(subjects)}  "
          f"({int(y.sum())} responsive / {int((~y).sum())} non-responsive)")
    print(f"features: {FEATURE_NAMES}")
    print(f"LOSO accuracy: {acc:.1%}  (majority baseline: "
          f"{max((~y).mean(), y.mean()):.1%})")
    print(f"LOSO ROC-AUC:  {auc:.3f}")
    print(f"confusion matrix [rows=true, cols=predicted, "
          f"order=non-responsive/responsive]:\n{cm}")

    scatter_name = "classifier_scatter_v2.png" if is_v2 else "classifier_scatter.png"
    report_name = "classifier_report_v2.md" if is_v2 else "classifier_report.md"
    scatter_path = results_dir / scatter_name
    report_path = results_dir / report_name
    make_scatter(subjects, X, y, y_pred, scatter_path)
    write_report(
        subjects, y, y_pred, y_prob, acc, auc, cm, report_path,
        caveat=V2_CAVEAT if is_v2 else DEFAULT_CAVEAT,
        title="# Trained classifier vs. SDP — synthetic 2.0 data, moderate condition"
        if is_v2 else "# Trained classifier vs. SDP — synthetic data, moderate condition",
        reading=V2_READING if is_v2 else DEFAULT_READING,
    )

    print(f"\nwrote {report_path.relative_to(REPO_ROOT)}")
    print(f"wrote {scatter_path.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
