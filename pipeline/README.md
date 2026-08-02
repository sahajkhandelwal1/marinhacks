# pipeline

Owner: Teammate B.

Download Chennu, load in MNE, extract condition labels and the
responsive/drowsy classification, epoch, hand clean arrays to the SDP/emitter
scripts in `../scripts/`.

Output contract (→ `../scripts/`): `(n_subjects, n_channels, n_samples)`
float array per condition, plus a `subjects.csv` with
`subject_id, condition, responsive`. See `vigil-prd.md` §4/§5/§9.

**Known finding (pre-event, see the planning notes):** the public Chennu
release is resting-state only — no stimulus-locked event markers survive the
BIDS conversion, only summary behavioral metrics per sedation level. Tier 1
(CI) is not computable on this dataset. Don't spend time re-checking this at
hour 1; go straight to responsive/drowsy label extraction for Tier 0.

**First checkpoint:** pair with the integration owner early (hour 0.5–2) to
load raw EEG before working solo — this is the highest-variance part of the
day.
