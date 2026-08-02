# Trained classifier vs. SDP — synthetic data, moderate condition

**Caveat, load-bearing:** `sdp` and `topo` in `data/synthetic/*.json` are generated independently of the `responsive` label (see `generate_synthetic_dataset.py`). Only `ci` is a function of the label, and `ci` is excluded from these features. A near-chance result below is expected **by construction**, not a general finding about EEG classifiers — this reports the LOSO methodology and a concrete number to replace once real Chennu spectral features are available.

n = 20 subjects, moderate condition, 7 responsive / 13 non-responsive.

## Result

- Leave-one-subject-out accuracy: **55.0%**
- Majority-class baseline: 65.0%
- ROC-AUC: **0.484** (0.5 = chance)
- Confusion matrix (rows=true, cols=predicted, [non-responsive, responsive]):

```
[[9 4]
 [5 2]]
```

## Per-subject predictions

| subject | responsive | predicted | P(responsive) | correct |
|---|---|---|---|---|
| S00 | True | True | 0.63 | ✓ |
| S01 | False | False | 0.16 | ✓ |
| S02 | True | False | 0.23 | ✗ |
| S03 | True | False | 0.21 | ✗ |
| S04 | False | False | 0.18 | ✓ |
| S05 | False | True | 0.88 | ✗ |
| S06 | False | False | 0.31 | ✓ |
| S07 | True | True | 0.65 | ✓ |
| S08 | True | False | 0.13 | ✗ |
| S09 | False | False | 0.14 | ✓ |
| S10 | False | False | 0.18 | ✓ |
| S11 | True | False | 0.37 | ✗ |
| S12 | False | True | 0.71 | ✗ |
| S13 | False | True | 0.72 | ✗ |
| S14 | False | True | 0.85 | ✗ |
| S15 | False | False | 0.35 | ✓ |
| S16 | True | False | 0.20 | ✗ |
| S17 | False | False | 0.13 | ✓ |
| S18 | False | False | 0.41 | ✓ |
| S19 | False | False | 0.20 | ✓ |

## Reading this

If accuracy sits near the majority baseline, that's consistent with the PRD's core argument: SDP-shaped features (single-ratio depth proxy + coarse topomap) don't carry population-level responsiveness signal, mirroring Gaskell et al. 2017's finding that frontal alpha-delta is present in patients who respond to command. It does not mean no signal exists in real EEG — it means this signal, on this feature set, wasn't there to begin with. That's exactly why the product bets on CI (anomaly detection vs. a per-patient baseline) instead of a population classifier.
