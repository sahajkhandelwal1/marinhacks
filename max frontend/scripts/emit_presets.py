#!/usr/bin/env python3
"""
Emit frontend-facing preset JSON from the synthetic dataset.

The raw dataset (../../data/synthetic) carries SDP + per-electrode topo only;
CI and classifier_prob are null (the data team deliberately nulled fabricated CI).

For the demo we produce two kinds of preset:

  * "vigil"  - enriched with a synthetic Coupling Index (CI) and a synthetic
               spectral-only classifier probability so the SDP-vs-CI
               disagreement is demonstrable. Everything is clearly labelled
               SYNTHETIC in the UI's source badge; nothing here claims to be
               real-data-backed.

  * "raw"    - the untouched sensor feed: CI and classifier left null so the
               UI's NOT MEASURED state is real and demonstrable.

CI model (synthetic, thesis-expressing):
  Coupling Index = how much the brain still tracks the room, relative to the
  patient's own awake baseline. For a *responsive* patient it stays high even
  as sedation deepens and SDP falls; for a genuinely unconscious patient it
  falls with depth. This is the whole point: SDP (intrinsic rhythm) and CI
  (relational tracking) can disagree.

Classifier model (synthetic): a trained model that reads the *same* spectral
  features SDP uses, so it shares SDP's blind spot. classifier_prob is the
  model's P(responsive) and is a smooth function of SDP alone -> it agrees with
  SDP and is wrong in exactly the cases CI catches.
"""
import json
import math
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.normpath(os.path.join(HERE, "..", "..", "data", "synthetic"))
OUT = os.path.normpath(os.path.join(HERE, "..", "public", "data"))
CONDITIONS = ["baseline", "mild", "moderate", "recovery"]

# Curated cast. Kept small so the bundle stays light and the picker stays fast.
# feed="vigil" -> enriched; feed="raw" -> NOT MEASURED for CI + classifier.
CAST = [
    # (subject, responsive, display name, one-line clinical note, feed)
    ("S00", True, "Patient A", "Responded to command under moderate sedation (IFT+)", "vigil"),
    ("S07", True, "Patient B", "Responded to command under moderate sedation (IFT+)", "vigil"),
    ("S01", False, "Patient C", "No response to command at any level (IFT-)", "vigil"),
    ("S09", False, "Patient D", "No response to command at any level (IFT-)", "vigil"),
    ("S16", True, "Patient E", "Coupling channel offline - SDP only", "raw"),
]

DOWNSAMPLE = 2  # 10 Hz -> 5 Hz; smooth enough, half the payload.


def sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def build_ci_series(frames, responsive: bool, rng: random.Random):
    """Synthetic CI per frame. Slow drift + small frame noise around a target
    set by true responsiveness and, for the unconscious case, by depth (SDP)."""
    ci = []
    drift = 0.0
    for fr in frames:
        sdp = fr["sdp"]
        depth = clamp01((100.0 - sdp) / 100.0)  # 0 awake-ish -> 1 deep
        if responsive:
            # Brain keeps tracking the room regardless of intrinsic rhythm.
            target = 0.74 - 0.06 * depth
        else:
            # Coupling collapses as the patient goes under.
            target = 0.30 - 0.22 * depth
        drift += rng.uniform(-0.008, 0.008)
        drift = max(-0.05, min(0.05, drift))
        val = clamp01(target + drift + rng.uniform(-0.02, 0.02))
        ci.append(round(val, 3))
    return ci


def classifier_prob(sdp: float) -> float:
    """Spectral-only model: P(responsive) from SDP alone -> shares SDP's blind
    spot. Low SDP -> confidently predicts drowsy, regardless of true state."""
    return round(sigmoid((sdp - 50.0) / 11.0), 3)


def emit():
    os.makedirs(OUT, exist_ok=True)
    manifest = {"generated_note": "SYNTHETIC demo presets - not real patient data", "patients": []}

    for subject, responsive, name, note, feed in CAST:
        patient = {
            "id": subject,
            "name": name,
            "responsive": responsive,
            "note": note,
            "feed": feed,
            "conditions": [],
        }
        for cond in CONDITIONS:
            src_path = os.path.join(SRC, f"{subject}_{cond}.json")
            if not os.path.exists(src_path):
                continue
            with open(src_path) as f:
                d = json.load(f)
            frames_in = d["frames"][::DOWNSAMPLE]
            rng = random.Random(hash((subject, cond)) & 0xFFFFFFFF)
            ci_series = build_ci_series(frames_in, responsive, rng) if feed == "vigil" else None

            frames_out = []
            for i, fr in enumerate(frames_in):
                sdp = round(fr["sdp"], 1)
                out = {
                    "t": round(fr["t"], 2),
                    "topo": [round(v, 3) for v in fr["topo"]],
                    "sdp": sdp,
                }
                if feed == "vigil":
                    out["ci"] = ci_series[i]
                    out["classifier_prob"] = classifier_prob(sdp)
                else:
                    out["ci"] = None
                    out["classifier_prob"] = None
                frames_out.append(out)

            out_name = f"{subject}_{cond}.json"
            with open(os.path.join(OUT, out_name), "w") as f:
                json.dump({
                    "subject": subject,
                    "display_name": name,
                    "condition": cond,
                    "responsive": d.get("responsive", responsive),
                    "drug_concentration_ug_ml": d.get("drug_concentration_ug_ml"),
                    "fs": d.get("fs", 10) / DOWNSAMPLE,
                    "feed": feed,
                    "source_label": "SYNTHETIC · Chennu-style propofol sedation · replay",
                    "electrodes": d["electrodes"],
                    "frames": frames_out,
                }, f, separators=(",", ":"))

            patient["conditions"].append({"condition": cond, "file": out_name})
        manifest["patients"].append(patient)

    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)

    total = sum(len(p["conditions"]) for p in manifest["patients"])
    print(f"Wrote {total} presets for {len(manifest['patients'])} patients -> {OUT}")


if __name__ == "__main__":
    emit()
