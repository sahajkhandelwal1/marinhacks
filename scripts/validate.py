#!/usr/bin/env python3
"""
Validate SDP against real, expert-labeled, graded-arousal EEG -- without
waiting on B or Chennu at all.

Sleep-EDF (via MNE's sleep_physionet dataset, ~50MB, no auth) gives
Wake -> N1 -> N2 -> N3 sleep stages with expert scoring. If SDP falls
roughly monotonically across those stages, the band-power math is doing
something real and it's worth trusting on anesthesia data. If it's flat or
inverted, that's a bug worth finding now rather than at hour 5.

Uses the canonical functions in sdp.py (same MIDPOINT/SCALE formula that
scripts/emit_json.py ships) -- not a separate reimplementation.

Requires mne (not yet installed in .venv -- see requirements.txt) and
downloads Sleep-EDF data on first run.

    python3 scripts/validate.py
"""
import numpy as np

import sdp

STAGES = {
    "Sleep stage W": "Wake",
    "Sleep stage 1": "N1",
    "Sleep stage 2": "N2",
    "Sleep stage 3": "N3",
    "Sleep stage 4": "N3",
}
ORDER = ["Wake", "N1", "N2", "N3"]


def load(subject=0):
    import mne
    from mne.datasets.sleep_physionet.age import fetch_data

    mne.set_log_level("ERROR")
    psg, hyp = fetch_data(subjects=[subject], recording=[1])[0]
    raw = mne.io.read_raw_edf(psg, preload=True, verbose=False)
    raw.set_annotations(mne.read_annotations(hyp))
    return raw


def segments_by_stage(raw):
    """Returns ({stage: (n_channels, n_samples)}, fs) of concatenated epochs."""
    fs = int(raw.info["sfreq"])
    data = raw.get_data()
    out = {s: [] for s in ORDER}
    for ann in raw.annotations:
        stage = STAGES.get(ann["description"])
        if stage is None:
            continue
        a = int(ann["onset"] * fs)
        b = a + int(ann["duration"] * fs)
        if b <= data.shape[1]:
            out[stage].append(data[:, a:b])
    return {s: np.concatenate(v, axis=1) for s, v in out.items() if v}, fs


def main():
    raw = load(subject=0)
    # Sleep-EDF frontal channel is typically "EEG Fpz-Cz" -- not the PRD's
    # multi-channel frontal set, just whatever frontal derivation exists here.
    ch = [c for c in raw.ch_names if "Fpz" in c] or [raw.ch_names[0]]
    raw.pick(ch)
    ch_names = raw.ch_names

    segs, fs = segments_by_stage(raw)
    print(f"channel: {ch_names[0]}   fs: {fs} Hz\n")

    mu = sdp.fit_baseline_stats(sdp.windowed_alpha_delta_ratio(segs["Wake"], fs, ch_names, ch_names)[1])

    print(f"{'stage':<8} {'minutes':>8} {'SDP':>8}")
    prev = None
    for stage in ORDER:
        if stage not in segs:
            continue
        _, r = sdp.windowed_alpha_delta_ratio(segs[stage], fs, ch_names, ch_names)
        val = float(np.median(sdp.sdp_from_r(r, mu)))
        mins = segs[stage].shape[1] / fs / 60
        flag = "" if prev is None or val <= prev + 2 else "  <-- NOT MONOTONIC"
        print(f"{stage:<8} {mins:>8.1f} {val:>8.1f}{flag}")
        prev = val

    print(f"\nMIDPOINT={sdp.MIDPOINT} SCALE={sdp.SCALE}")
    print("Expect SDP to fall Wake -> N3. If it's flat, widen SCALE (sdp.py).")
    print("If it's inverted, alpha/delta bands are swapped.")


if __name__ == "__main__":
    main()
