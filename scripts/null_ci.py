#!/usr/bin/env python3
"""
Strip fabricated `ci` values from JSON fixtures and replace with null.

PRD §6 is explicit: ci is null unless Tier 1 is actually computed, and the
frontend renders NOT MEASURED in that case -- which is itself part of the
pitch (§6: "pointedly, exactly what happens in every real OR today").
Tier 1 is confirmed dead on Chennu (see pipeline/README.md), so any ci
value in these fixtures is fabricated, not measured, and needs to go
before anything gets built against it.

Usage: python3 scripts/null_ci.py data/synthetic/*.json
"""
import json
import sys
from pathlib import Path


def null_ci(path):
    doc = json.loads(path.read_text())
    changed = 0
    for frame in doc.get("frames", []):
        if frame.get("ci") is not None:
            frame["ci"] = None
            changed += 1
    if changed:
        path.write_text(json.dumps(doc, indent=2))
    return changed


def main():
    paths = [Path(p) for p in sys.argv[1:]]
    if not paths:
        print("usage: python3 scripts/null_ci.py <file.json> [...]")
        sys.exit(1)

    total_files, total_frames = 0, 0
    for path in paths:
        changed = null_ci(path)
        if changed:
            total_files += 1
            total_frames += changed
            print(f"{path}: nulled {changed} frames")

    print(f"\n{total_files} files updated, {total_frames} frames nulled.")


if __name__ == "__main__":
    main()
