# frontend

Owner: Teammate A.

Topomap, slider, dual SDP/CI readout, two-patient view, deploy. Builds against
`../data/*.json` (see root README and `vigil-prd.md` §6/§8 for the contract
and layout spec). Never touches Python, never blocked on the data pipeline —
fake fixtures already exist in `../data/`.

Deploy target: static (Vercel or GitHub Pages). No live inference behind the
public link.
