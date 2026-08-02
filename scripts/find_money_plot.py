#!/usr/bin/env python3
"""
Money-plot finder — PRD §3/§8's closing move: two patients, same drug
concentration, near-identical SDP, different behavioral outcome. §8 calls
this "the closing move," and the refinement plan flagged it as unverified
-- nobody had checked whether such a pair actually exists.

Works against any dataset directory laid out per the §6 contract with a
subjects.csv per the §4 B -> You interface (subject_id, condition,
responsive). Ranks all responsive/non-responsive cross-pairs at a given
condition by |median SDP difference| and prints the best candidates, so a
bad top pick (e.g. wildly different drug concentration, corrupt file) is
visible rather than silently taken on faith.

Usage:
    python3 scripts/find_money_plot.py data/synthetic --condition moderate --top 5
    python3 scripts/find_money_plot.py pipeline/arrays_json --condition moderate  # once real data lands
"""
import argparse
import csv
import json
from pathlib import Path

import numpy as np


def load_subjects_csv(data_dir):
    path = data_dir / "subjects.csv"
    with open(path) as f:
        return list(csv.DictReader(f))


def load_condition_summary(data_dir, subject_id, condition):
    path = data_dir / f"{subject_id}_{condition}.json"
    if not path.exists():
        return None
    doc = json.loads(path.read_text())
    sdp_values = [f["sdp"] for f in doc["frames"]]
    return {
        "subject": subject_id,
        "median_sdp": float(np.median(sdp_values)),
        "drug_concentration_ug_ml": doc["drug_concentration_ug_ml"],
        "responsive": doc["responsive"],
    }


def find_pairs(data_dir, condition, top_n=5):
    rows = load_subjects_csv(data_dir)
    subject_ids = sorted({r["subject_id"] for r in rows if r["condition"] == condition})

    summaries = []
    for sid in subject_ids:
        s = load_condition_summary(data_dir, sid, condition)
        if s is not None:
            summaries.append(s)

    responsive = [s for s in summaries if s["responsive"] in (True, "True")]
    non_responsive = [s for s in summaries if s["responsive"] in (False, "False")]

    if not responsive or not non_responsive:
        print(f"Can't pair: {len(responsive)} responsive, {len(non_responsive)} non-responsive at '{condition}'.")
        return []

    pairs = []
    for r in responsive:
        for nr in non_responsive:
            conc_gap = abs(r["drug_concentration_ug_ml"] - nr["drug_concentration_ug_ml"])
            sdp_gap = abs(r["median_sdp"] - nr["median_sdp"])
            pairs.append({
                "responsive_subject": r["subject"],
                "non_responsive_subject": nr["subject"],
                "sdp_gap": sdp_gap,
                "responsive_sdp": r["median_sdp"],
                "non_responsive_sdp": nr["median_sdp"],
                "concentration_gap_ug_ml": conc_gap,
            })

    pairs.sort(key=lambda p: p["sdp_gap"])
    return pairs[:top_n]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("data_dir", type=str)
    parser.add_argument("--condition", type=str, default="moderate")
    parser.add_argument("--top", type=int, default=5)
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    pairs = find_pairs(data_dir, args.condition, args.top)

    if not pairs:
        return

    print(f"Top {len(pairs)} candidate pairs at condition='{args.condition}' (ranked by SDP gap, smaller = better):\n")
    print(f"{'responsive':<12} {'sdp':>6}   {'non-responsive':<16} {'sdp':>6}   {'gap':>6}   {'conc_gap':>9}")
    for p in pairs:
        flag = "  <-- CHECK: concentration differs" if p["concentration_gap_ug_ml"] > 0.05 else ""
        print(
            f"{p['responsive_subject']:<12} {p['responsive_sdp']:>6.1f}   "
            f"{p['non_responsive_subject']:<16} {p['non_responsive_sdp']:>6.1f}   "
            f"{p['sdp_gap']:>6.1f}   {p['concentration_gap_ug_ml']:>9.2f}{flag}"
        )

    best = pairs[0]
    print(f"\nBest pair: {best['responsive_subject']} (responded) vs {best['non_responsive_subject']} (did not respond)")
    print(f"SDP gap: {best['sdp_gap']:.1f} points on the 0-100 scale")


if __name__ == "__main__":
    main()
