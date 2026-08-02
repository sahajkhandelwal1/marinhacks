#!/usr/bin/env python3
"""
Simulated cortical network panel — illustrative only, NOT patient data.

Precomputes a small spiking network's activity at several depth levels
using Brian2 (LIF neurons), so the frontend has an animated supplementary
visual. Ties into the actual product thesis at the population-scale level:
as "depth" increases, neurons shift from independent, noise-driven firing
toward a shared, slow (~1.5 Hz, delta-like) synchronized drive -- the same
desynchronization <-> synchronization story SDP measures at the scalp via
alpha/delta power, just illustrated one level down, in simulated spikes
rather than real EEG.

This is explicitly synthetic and must be labeled as such in the UI (same
honesty convention as NOT MEASURED for ci) -- it is not derived from any
patient, real or synthetic-EEG-based. Precomputed offline, no live
simulation behind the deployed link (PRD's static-deploy rule).

Usage: python3 scripts/simulate_network.py
"""
import json
from pathlib import Path

import numpy as np
from brian2 import (
    NeuronGroup, StateMonitor, SpikeMonitor, TimedArray, run,
    ms, second, Hz, defaultclock, start_scope,
)

OUT_DIR = Path(__file__).resolve().parent.parent / "data" / "simulated"
N_NEURONS = 60
DURATION_S = 6.0
DEPTHS = [0.0, 0.25, 0.5, 0.75, 1.0]
SLOW_FREQ_HZ = 1.5  # delta-band-like shared oscillation
RATE_BIN_MS = 50

def simulate_depth(depth, seed):
    start_scope()
    defaultclock.dt = 1 * ms

    t_steps = np.arange(0, DURATION_S * 1000, 1) * ms
    # Shared slow-wave drive, zero-mean: at high depth this produces
    # synchronized bursts on the rising phase and quiet gaps on the falling
    # phase (burst-suppression-like), rather than just raising overall
    # excitability -- real anesthesia reduces overall firing while
    # synchronizing it, it doesn't cause generalized hyperactivity.
    shared_amp = 0.7 * depth
    shared_wave = shared_amp * np.sin(2 * np.pi * SLOW_FREQ_HZ * (t_steps / second))
    I_shared_timed = TimedArray(shared_wave, dt=1 * ms)

    # Independent noisy drive dominates at low depth (irregular, desynced
    # firing); recedes as depth rises so the shared oscillation dominates.
    # Baseline excitability also drops slightly with depth.
    indep_amp = 0.9 - 0.55 * depth
    baseline = 0.55 - 0.15 * depth

    neurons = NeuronGroup(
        N_NEURONS,
        """
        dv/dt = (-v + I_indep + I_shared(t)) / tau : 1 (unless refractory)
        I_indep : 1
        tau : second
        """,
        threshold="v > 1", reset="v = 0", refractory=3 * ms,
        method="euler",
        namespace={"I_shared": I_shared_timed},
    )
    neurons.tau = 10 * ms
    neurons.run_regularly(f"I_indep = {indep_amp} * randn() + {baseline}", dt=1 * ms)

    spikes = SpikeMonitor(neurons)
    run(DURATION_S * second)

    spike_t = np.array(spikes.t / ms)  # ms
    spike_i = np.array(spikes.i)

    # Population rate in RATE_BIN_MS bins, normalized to Hz per neuron.
    n_bins = int(DURATION_S * 1000 / RATE_BIN_MS)
    bin_edges = np.arange(n_bins + 1) * RATE_BIN_MS
    counts, _ = np.histogram(spike_t, bins=bin_edges)
    rate_hz = counts / (N_NEURONS * (RATE_BIN_MS / 1000))

    return spike_t, spike_i, rate_hz


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for i, depth in enumerate(DEPTHS):
        spike_t, spike_i, rate_hz = simulate_depth(depth, seed=100 + i)

        payload = {
            "depth": depth,
            "n_neurons": N_NEURONS,
            "duration_s": DURATION_S,
            "rate_bin_ms": RATE_BIN_MS,
            "spikes": [
                {"t": round(float(t) / 1000, 4), "neuron": int(n)}
                for t, n in zip(spike_t, spike_i)
            ],
            "population_rate_hz": [round(float(r), 2) for r in rate_hz],
        }

        out_path = OUT_DIR / f"depth_{int(depth * 100):03d}.json"
        out_path.write_text(json.dumps(payload))

        mean_rate = rate_hz.mean()
        rate_cv = rate_hz.std() / (mean_rate + 1e-9)
        print(
            f"depth={depth:.2f}  spikes={len(spike_t):4d}  "
            f"mean_rate={mean_rate:5.2f} Hz  rate_CV={rate_cv:.2f} "
            f"(higher CV = more synchronized bursting)"
        )

    print(f"\nWrote {len(DEPTHS)} files to {OUT_DIR}")


if __name__ == "__main__":
    main()
