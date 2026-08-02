#!/usr/bin/env python3
"""
Pick the clearest exemplar recordings for the home screen.

Two different jobs, and it matters that they stay distinct:

  1. CLEAR cases -- baseline (awake) vs moderate (sedated). SDP separates
     these well, so they make an honest "here is the obvious difference"
     gallery.
  2. The AMBIGUOUS pair -- two subjects at the SAME drug concentration with
     near-identical SDP but opposite behavioral outcomes. SDP cannot tell
     these apart. That is the product thesis (PRD §3/§8), and it is what the
     clear cases exist to set up.

Ranks candidates by median SDP plus stability (low IQR), so the picks are
representative of the whole recording rather than a lucky frame.

Usage: python3 scripts/pick_exemplars.py [data_dir]
"""
import csv
import json
import statistics as st
import sys
from pathlib import Path

DEFAULT_DIR = Path(__file__).resolve().parent.parent / "data" / "synthetic"


def load_summaries(data_dir):
    rows = list(csv.DictReader(open(data_dir / "subjects.csv")))
    out = []
    for r in rows:
        path = data_dir / f"{r['subject_id']}_{r['condition']}.json"
        if not path.exists():
            continue
        doc = json.loads(path.read_text())
        sdp = [f["sdp"] for f in doc["frames"]]
        sdp_sorted = sorted(sdp)
        n = len(sdp_sorted)
        iqr = sdp_sorted[int(n * 0.75)] - sdp_sorted[int(n * 0.25)]
        out.append({
            "subject": r["subject_id"],
            "condition": r["condition"],
            "responsive": r["responsive"] == "True",
            "median_sdp": st.median(sdp),
            "iqr": iqr,
            "drug": doc["drug_concentration_ug_ml"],
        })
    return out


def main():
    data_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DIR
    s = load_summaries(data_dir)

    # Clearly awake: high, stable SDP at baseline.
    awake = sorted(
        [x for x in s if x["condition"] == "baseline"],
        key=lambda x: (-x["median_sdp"] + x["iqr"] * 0.25),
    )
    # Clearly sedated: low, stable SDP at moderate.
    sedated = sorted(
        [x for x in s if x["condition"] == "moderate"],
        key=lambda x: (x["median_sdp"] + x["iqr"] * 0.25),
    )

    print("=== CLEAREST AWAKE (baseline) ===")
    for x in awake[:4]:
        print(f"  {x['subject']}_{x['condition']:<9} SDP={x['median_sdp']:5.1f}  IQR={x['iqr']:5.1f}")

    print("\n=== CLEAREST SEDATED (moderate) ===")
    for x in sedated[:4]:
        print(f"  {x['subject']}_{x['condition']:<9} SDP={x['median_sdp']:5.1f}  IQR={x['iqr']:5.1f}  responsive={x['responsive']}")

    # The ambiguous pair: same drug level, minimal SDP gap, opposite outcome.
    mod = [x for x in s if x["condition"] == "moderate"]
    resp = [x for x in mod if x["responsive"]]
    non = [x for x in mod if not x["responsive"]]
    pairs = sorted(
        ((r, nr, abs(r["median_sdp"] - nr["median_sdp"])) for r in resp for nr in non),
        key=lambda p: p[2],
    )
    print("\n=== AMBIGUOUS PAIR (same drug, SDP cannot separate) ===")
    for r, nr, gap in pairs[:3]:
        print(
            f"  {r['subject']} (responded, SDP={r['median_sdp']:.1f})  vs  "
            f"{nr['subject']} (no response, SDP={nr['median_sdp']:.1f})   gap={gap:.1f}"
        )

    write_exemplars(data_dir, awake, sedated, pairs)


def representative_frame(data_dir, subject, condition):
    """The frame whose SDP is closest to the recording's median -- typical of
    the recording rather than a lucky extreme."""
    doc = json.loads((data_dir / f"{subject}_{condition}.json").read_text())
    frames = doc["frames"]
    med = st.median([f["sdp"] for f in frames])
    best = min(frames, key=lambda f: abs(f["sdp"] - med))
    return doc, best, med


def write_exemplars(data_dir, awake, sedated, pairs):
    """Emit a small home-screen payload: one representative frame per card.
    The full recordings are ~3MB each, far too heavy to load five of."""
    # Clearly sedated cards must be genuinely non-responsive subjects. Note
    # that several of the LOWEST-SDP subjects were in fact responsive -- which
    # is exactly the point, and is what the final card exists to show.
    sedated_clear = [x for x in sedated if not x["responsive"]][:2]
    ambiguous = pairs[0][0]  # responsive subject of the tightest pair

    picks = [
        (awake[0], "AWAKE", "Eyes closed, no sedation"),
        (awake[1], "AWAKE", "Eyes closed, no sedation"),
        (sedated_clear[0], "SEDATED", "Did not respond to command"),
        (sedated_clear[1], "SEDATED", "Did not respond to command"),
        (ambiguous, "AMBIGUOUS", "Responded to command"),
    ]

    cards = []
    for meta, kind, caption in picks:
        doc, frame, med = representative_frame(data_dir, meta["subject"], meta["condition"])
        cards.append({
            "subject": meta["subject"],
            "condition": meta["condition"],
            "kind": kind,
            "caption": caption,
            "responsive": meta["responsive"],
            "median_sdp": round(med, 1),
            "drug_concentration_ug_ml": doc["drug_concentration_ug_ml"],
            "topo": frame["topo"],
            "electrodes": doc["electrodes"],
        })

    out = {
        "note": (
            "Home-screen exemplars. The AWAKE/SEDATED cards are cases SDP "
            "separates correctly. The AMBIGUOUS card is at the same drug "
            "concentration and near-identical SDP as the SEDATED cards, but "
            "the patient responded to command -- SDP cannot tell them apart."
        ),
        "cards": cards,
    }
    path = data_dir.parent / "exemplars.json"
    path.write_text(json.dumps(out, indent=2))
    kb = path.stat().st_size / 1024
    print(f"\nWrote {len(cards)} exemplar cards -> {path} ({kb:.0f} KB)")


if __name__ == "__main__":
    main()
