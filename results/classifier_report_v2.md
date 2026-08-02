# Trained classifier vs. SDP — synthetic 2.0 data, moderate condition

**Caveat, load-bearing:** this run is against `data/synthetic 2.0/`, not the pitch dataset. Those `sdp`/`topo` values are computed by the real pipeline (`scripts/sdp.py`) from raw synthetic EEG that has a deliberate, tuned spectral gap between responders and non-responders (see `generate_synthetic_dataset_v2.py`, `RESPONDER_DEPTH_SCALE`). A clearly-above-chance result here demonstrates the classifier and pipeline work when a genuine signal exists — it is not evidence that such a signal exists in real EEG, and it is not the product's dataset or claim.

n = 20 subjects, moderate condition, 7 responsive / 13 non-responsive.

## Result

- Leave-one-subject-out accuracy: **75.0%**
- Majority-class baseline: 65.0%
- ROC-AUC: **0.868** (0.5 = chance)
- Confusion matrix (rows=true, cols=predicted, [non-responsive, responsive]):

```
[[11  2]
 [ 3  4]]
```

## Per-subject predictions

| subject | responsive | predicted | P(responsive) | correct |
|---|---|---|---|---|
| S00 | False | False | 0.32 | ✓ |
| S01 | True | True | 0.71 | ✓ |
| S02 | False | False | 0.03 | ✓ |
| S03 | False | False | 0.05 | ✓ |
| S04 | False | False | 0.05 | ✓ |
| S05 | False | False | 0.04 | ✓ |
| S06 | False | False | 0.00 | ✓ |
| S07 | True | True | 0.98 | ✓ |
| S08 | False | False | 0.49 | ✓ |
| S09 | False | False | 0.02 | ✓ |
| S10 | True | True | 0.99 | ✓ |
| S11 | True | False | 0.32 | ✗ |
| S12 | False | False | 0.09 | ✓ |
| S13 | False | True | 0.77 | ✗ |
| S14 | False | False | 0.22 | ✓ |
| S15 | False | False | 0.01 | ✓ |
| S16 | True | False | 0.33 | ✗ |
| S17 | True | True | 0.76 | ✓ |
| S18 | False | True | 0.68 | ✗ |
| S19 | True | False | 0.34 | ✗ |

## Reading this

This accuracy sitting clearly above the majority baseline is expected: `data/synthetic 2.0/` was built specifically to contain a genuine, tuned spectral gap between the two groups (`RESPONDER_DEPTH_SCALE` in `generate_synthetic_dataset_v2.py`), with deliberate per-subject noise so it isn't perfectly separable either. It shows the LOSO methodology and feature pipeline correctly pick up a real signal when one exists in the underlying EEG. It says nothing about whether a comparable signal exists in real patients — that's an open empirical question this dataset cannot answer, and it's why the product still bets on CI/anomaly-detection (PRD §2) rather than a population classifier for the real-world, label-scarce case.
