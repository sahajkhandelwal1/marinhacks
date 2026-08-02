#!/usr/bin/env python3
"""
Download the Chennu et al. propofol sedation dataset (BIDS-converted,
FieldTrip workshop mirror). Verified reachable and public, no auth --
directory-listed at the URL below as of this check.

    https://download.fieldtriptoolbox.org/workshop/madrid2019/extra/complete_resting_data/

20 subjects, confirmed by directory listing: sub-02,03,05,06,07,08,09,10,
13,14,18,20,22,23,24,25,26,27,28,29 -- matches the PRD's "20 healthy
participants."

Per subject: sub-XX_scans.tsv (sedation level, drug concentration, hit-rate
inputs) + 4 runs of BrainVision EEG (.vhdr/.vmrk/.eeg), run-1..4 =
baseline/mild/moderate/recovery per that subject's scans.tsv (order is
fixed as 1=baseline,2=mild,3=moderate,4=recovery -- confirmed via
sub-02's scans.tsv, but this script does not assume it: load.py reads the
actual per-run label from each subject's scans.tsv rather than hardcoding
run-number -> condition).

~35MB per run x 4 runs x 20 subjects =~ 2.8GB total. Idempotent -- rerun
to resume/fill gaps, already-downloaded files are skipped.

Usage: python3 pipeline/download.py [--subjects sub-02,sub-03] [--limit N]
"""
import argparse
import urllib.request
from pathlib import Path

BASE_URL = "https://download.fieldtriptoolbox.org/workshop/madrid2019/extra/complete_resting_data"
OUT_DIR = Path(__file__).resolve().parent / "raw_data"

SUBJECTS = [
    "sub-02", "sub-03", "sub-05", "sub-06", "sub-07", "sub-08", "sub-09", "sub-10",
    "sub-13", "sub-14", "sub-18", "sub-20", "sub-22", "sub-23", "sub-24", "sub-25",
    "sub-26", "sub-27", "sub-28", "sub-29",
]

EEG_EXTENSIONS = ["vhdr", "vmrk", "eeg"]
N_RUNS = 4


def fetch(url, dest):
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        return "skip (exists)"
    urllib.request.urlretrieve(url, dest)
    return f"downloaded ({dest.stat().st_size:,} bytes)"


def download_subject(subject, out_dir):
    scans_url = f"{BASE_URL}/{subject}/{subject}_scans.tsv"
    scans_dest = out_dir / subject / f"{subject}_scans.tsv"
    print(f"{subject}/{subject}_scans.tsv: {fetch(scans_url, scans_dest)}")

    for run in range(1, N_RUNS + 1):
        for ext in EEG_EXTENSIONS:
            fname = f"{subject}_task-rest_run-{run}_eeg.{ext}"
            url = f"{BASE_URL}/{subject}/eeg/{fname}"
            dest = out_dir / subject / "eeg" / fname
            print(f"{subject}/eeg/{fname}: {fetch(url, dest)}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--subjects", type=str, default=None,
                         help="comma-separated subject IDs, e.g. sub-02,sub-03. Default: all 20.")
    parser.add_argument("--limit", type=int, default=None,
                         help="only download the first N subjects (useful for a quick smoke test)")
    args = parser.parse_args()

    subjects = args.subjects.split(",") if args.subjects else SUBJECTS
    if args.limit:
        subjects = subjects[:args.limit]

    OUT_DIR.mkdir(exist_ok=True)
    for subject in subjects:
        download_subject(subject, OUT_DIR)

    print(f"\nDone. Data in {OUT_DIR}")


if __name__ == "__main__":
    main()
