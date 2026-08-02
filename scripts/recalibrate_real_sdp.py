#!/usr/bin/env python3
"""
Recalibrate the committed data/real/*.json SDP values in place.

Why this exists rather than just re-running scripts/emit_real_json.py: the
source EEGLAB recordings live in `data/new data/`, which is gitignored and
local to whoever ran the loader. The emitted JSON is committed; the source is
not. So on a machine without the recordings the emitter cannot be re-run, but
the calibration still needs fixing.

This is exact, not an approximation. SDP is a pure, strictly monotonic function
of (r - mu):

    sdp = 100 * sigmoid((r - mu + midpoint) / scale)

so the old value can be inverted back to (r - mu) and re-mapped through the new
constants, giving precisely what the emitter would have written. The median
filter applied upstream commutes with any monotonic transform -- median(f(x))
== f(median(x)) -- so it survives the round trip untouched. The only loss is
the 1-decimal rounding in the stored values.

Anyone who does have the source recordings should just re-run
scripts/emit_real_json.py, which now carries the same constants.

Usage: python3 scripts/recalibrate_real_sdp.py [--dry-run]
"""
import json
import math
import sys
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "real"

# What data/real was originally emitted with (sdp.py module defaults).
OLD_MIDPOINT, OLD_SCALE = 1.5, 0.8
# Calibrated to this dataset's actual effect size -- see the writeup in
# scripts/emit_real_json.py. Keep the two in step.
NEW_MIDPOINT, NEW_SCALE = 0.420, 0.249

EPS = 1e-6


def remap(sdp_old: float) -> float:
    p = min(max(sdp_old / 100.0, EPS), 1.0 - EPS)
    r_minus_mu = math.log(p / (1 - p)) * OLD_SCALE - OLD_MIDPOINT
    z = (r_minus_mu + NEW_MIDPOINT) / NEW_SCALE
    return 100.0 / (1.0 + math.exp(-z))


def main():
    dry = "--dry-run" in sys.argv
    files = sorted(DATA_DIR.glob("*.json"))
    if not files:
        print(f"no JSON found in {DATA_DIR}")
        sys.exit(1)

    touched = 0
    for path in files:
        doc = json.loads(path.read_text())
        frames = doc.get("frames")
        if not frames:
            continue
        before = [f["sdp"] for f in frames]
        for f in frames:
            f["sdp"] = round(remap(f["sdp"]), 1)
        after = [f["sdp"] for f in frames]
        if not dry:
            path.write_text(json.dumps(doc, indent=2))
        touched += 1
        print(f"{path.name}: {min(before):.0f}-{max(before):.0f} -> {min(after):.0f}-{max(after):.0f}")

    print(f"\n{touched} files {'checked (dry run)' if dry else 'rewritten'}")


if __name__ == "__main__":
    main()
