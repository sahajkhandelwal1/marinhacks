#!/usr/bin/env python3
"""
SDP — Spectral Depth Proxy. vigil-prd.md §7.1.

A documented proxy, not BIS: log(alpha/delta) power ratio, normalized to
the subject's own baseline condition, per-window, median-filtered.

Frontal channel names are a parameter, not hardcoded — the PRD's example
names (Fp1, Fp2, F3, F4, Fz) assume a 10-20 montage. Chennu's 128-channel
HydroCel Geodesic Sensor Net uses E-numbered channels, so the real caller
must pass whatever names B's montage mapping produces.
"""
import numpy as np
from scipy.signal import welch, medfilt

BANDS = {"delta": (0.5, 4), "theta": (4, 8), "alpha": (8, 13), "beta": (13, 30)}
PSD_FMIN, PSD_FMAX = 0.5, 45
WINDOW_SEC = 2.0
OVERLAP = 0.5
MEDIAN_FILTER_WINDOWS = 5


def band_power(freqs, psd, band):
    lo, hi = band
    mask = (freqs >= lo) & (freqs <= hi)
    return np.trapezoid(psd[mask], freqs[mask])


def windowed_alpha_delta_ratio(data, fs, ch_names, frontal_channels):
    """data: (n_channels, n_samples). Returns (t, r) arrays, one r per window."""
    idx = [i for i, name in enumerate(ch_names) if name in frontal_channels]
    if not idx:
        raise ValueError(
            f"none of {frontal_channels} found in ch_names; "
            f"got {len(ch_names)} channels starting with {ch_names[:5]}"
        )
    frontal = data[idx, :]

    win = int(WINDOW_SEC * fs)
    step = int(win * (1 - OVERLAP))
    n_samples = frontal.shape[1]

    t_out, r_out = [], []
    for start in range(0, n_samples - win + 1, step):
        segment = frontal[:, start:start + win]
        freqs, psd = welch(segment, fs=fs, nperseg=win, axis=1)
        psd_avg = psd.mean(axis=0)
        freq_mask = (freqs >= PSD_FMIN) & (freqs <= PSD_FMAX)
        freqs, psd_avg = freqs[freq_mask], psd_avg[freq_mask]

        alpha = band_power(freqs, psd_avg, BANDS["alpha"])
        delta = band_power(freqs, psd_avg, BANDS["delta"])
        r = np.log10(max(alpha, 1e-12) / max(delta, 1e-12))

        t_out.append((start + win / 2) / fs)
        r_out.append(r)

    return np.array(t_out), np.array(r_out)


def fit_baseline_stats(r_baseline):
    mu = float(np.mean(r_baseline))
    sigma = float(np.std(r_baseline)) or 1e-6
    return mu, sigma


def sdp_from_r(r_values, mu, sigma):
    z = (r_values - mu) / sigma
    sdp = 100 / (1 + np.exp(-z))
    k = min(MEDIAN_FILTER_WINDOWS, len(sdp) - (1 - len(sdp) % 2))
    if k >= 3 and k % 2 == 1:
        sdp = medfilt(sdp, kernel_size=k)
    return sdp


def compute_sdp(baseline_data, condition_data, fs, ch_names, frontal_channels):
    """Fit r_mu/r_sigma on baseline_data, apply to condition_data. Returns (t, sdp)."""
    _, r_baseline = windowed_alpha_delta_ratio(baseline_data, fs, ch_names, frontal_channels)
    mu, sigma = fit_baseline_stats(r_baseline)
    t, r_cond = windowed_alpha_delta_ratio(condition_data, fs, ch_names, frontal_channels)
    return t, sdp_from_r(r_cond, mu, sigma)


# --- self-test on synthetic EEG (timeline §9: "SDP on any EEG, synthetic if needed") ---

def _synthetic_eeg(fs, duration_s, n_channels, dominant_hz, dominant_amp, seed):
    rng = np.random.default_rng(seed)
    n_samples = int(fs * duration_s)
    t = np.arange(n_samples) / fs
    data = np.zeros((n_channels, n_samples))
    for ch in range(n_channels):
        signal = dominant_amp * np.sin(2 * np.pi * dominant_hz * t + rng.uniform(0, 2 * np.pi))
        noise = rng.normal(0, 1.0, n_samples)
        data[ch] = signal + noise
    return data


if __name__ == "__main__":
    fs = 250
    ch_names = ["Fp1", "Fp2", "F3", "F4", "Fz", "Cz", "O1", "O2"]
    frontal = ["Fp1", "Fp2", "F3", "F4", "Fz"]

    baseline = _synthetic_eeg(fs, duration_s=60, n_channels=len(ch_names),
                               dominant_hz=10, dominant_amp=3.0, seed=1)   # alpha-dominant, "awake"
    sedated = _synthetic_eeg(fs, duration_s=60, n_channels=len(ch_names),
                              dominant_hz=2, dominant_amp=3.0, seed=2)     # delta-dominant, "sedated"

    t_base, sdp_base = compute_sdp(baseline, baseline, fs, ch_names, frontal)
    t_sed, sdp_sed = compute_sdp(baseline, sedated, fs, ch_names, frontal)

    print(f"baseline SDP: mean={sdp_base.mean():.1f}  (should be ~50, it's normalized to itself)")
    print(f"sedated  SDP: mean={sdp_sed.mean():.1f}  (should be much lower — less alpha, more delta)")

    assert sdp_base.mean() > sdp_sed.mean() + 20, "sedated signal should score meaningfully lower"
    print("\nself-test passed: SDP separates alpha-dominant from delta-dominant synthetic EEG.")
