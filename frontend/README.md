# frontend

Owner: Teammate A.

Topomap, slider, dual SDP/CI readout, two-patient view, deploy. See root
README and `vigil-prd.md` §6/§8 for the full contract and layout spec. Never
touches Python, never blocked on the data pipeline.

## Which data to build against

**Use `../data/synthetic/`, not `../data/`.** Two fixture sets exist:
- `../data/` — the original 2-subject (S00/S01) hour-0 bootstrap set.
- `../data/synthetic/` — 20 subjects, all 4 conditions each, plus
  `subjects.csv`. This is the fuller, more current set — build against this
  one. Both are contract-identical and both correctly emit `ci: null` (see
  `../scripts/null_ci.py` if that regresses).

This will get swapped for real Chennu-derived data later with the exact same
file layout and schema — no frontend code changes needed when that happens.

## Main single-patient slider demo

Any subject with all 4 conditions works, e.g. `S00_{baseline,mild,moderate,recovery}.json`.

## Two-patient closing view (PRD §3/§8's "money plot")

Use **S02 (responded to command) vs S04 (did not respond)** at `moderate` —
found via `../scripts/find_money_plot.py`, which ranks candidate pairs by SDP
gap. This pair has a ~0-point SDP gap, i.e. SDP genuinely cannot distinguish
them despite the different behavioral outcome. Label by outcome, not subject
ID, per §8: `PATIENT A — did not respond` / `PATIENT B — responded to
command` — the `responsive` field in each subject's JSON tells you which is
which. If real Chennu data replaces this, rerun `find_money_plot.py` against
the new data and this pairing may change.

## ci handling

`ci` is `null` in every fixture right now (Tier 1 is confirmed dead on the
public Chennu release). Render the greyed `NOT MEASURED` panel per §6 — this
is not a placeholder to fix later, it's the intended, honest state.

Deploy target: static (Vercel or GitHub Pages). No live inference behind the
public link.
