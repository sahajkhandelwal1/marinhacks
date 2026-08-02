#!/usr/bin/env node
/**
 * Packs ../data/<DATA_SOURCE> (80 files, 62 MB for synthetic) into static
 * per-subject bundles the browser can actually load:
 * public/data/<DATA_SOURCE>/<subject>.json + manifest.json.
 *
 * DATA_SOURCE selects which data/ subdirectory to pack — "synthetic"
 * (default, unchanged behavior) or "real" (scripts/emit_real_json.py's
 * output). Both bundles ship side by side under public/data/, toggled at
 * runtime by the frontend (frontend/src/state/monitor.tsx) — this script
 * only ever packs one at a time, so `npm run bundle:data` runs it twice
 * (see package.json).
 *
 * The wire format is columnar, not the per-frame contract of probe-prd.md §6.
 * Nothing is invented here — every value is carried through from the source
 * JSON. Two size decisions, both lossless in practice:
 *
 *   sdp  stays at the full 10 Hz (3000 numbers/condition, ~15 KB).
 *   topo drops to 2 Hz. The source frames were computed on 2-second windows
 *        at 50% overlap — 1 Hz native — then interpolated up to 10 Hz by
 *        scripts/emit_json.py. Sampling every 5th frame therefore discards
 *        interpolation, not measurement; the UI re-interpolates for playback.
 *
 * Run: npm run bundle:data   (also runs as part of `npm run build`)
 */
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(HERE, "../../data");
const SOURCE = process.env.DATA_SOURCE || "synthetic";
const SRC = join(DATA, SOURCE);
const OUT = resolve(HERE, "../public/data", SOURCE);

// Assets the app fetches verbatim: the fsaverage5 cortical surface
// (scripts/export_brain_mesh.py) and the precomputed Brian2 network buckets
// (scripts/simulate_network.py). Copied rather than committed under public/,
// so data/ stays the single source of truth for everything the UI loads.
const COPY_DIRS = ["brain", "simulated"];
// Home-screen cases, chosen by scripts/pick_exemplars.py.
const COPY_FILES = ["exemplars.json"];

const CONDITIONS = ["baseline", "mild", "moderate", "recovery"];
const TOPO_STRIDE = 5; // 10 Hz -> 2 Hz

const round = (v, p) => Number(v.toFixed(p));

function quantiles(sorted, q) {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

async function readCondition(subject, condition) {
  const raw = await readFile(join(SRC, `${subject}_${condition}.json`), "utf8");
  const doc = JSON.parse(raw);
  const frames = doc.frames;

  const sdp = frames.map((f) => f.sdp);
  const topo = [];
  for (let i = 0; i < frames.length; i += TOPO_STRIDE) {
    topo.push(frames[i].topo.map((v) => round(v, 3)));
  }

  // ci is null in every fixture (PRD §6 / Tier 1 confirmed dead). Carry the
  // real state through rather than defaulting it — if CI ever ships, this
  // starts emitting numbers with no frontend change.
  const ci = frames.map((f) => f.ci);
  const ciMeasured = ci.some((v) => v !== null && v !== undefined);

  const sorted = [...sdp].sort((a, b) => a - b);

  return {
    doc,
    condition: {
      condition,
      drugConcentration: doc.drug_concentration_ug_ml,
      responsive: doc.responsive,
      sdp,
      topo,
      ci: ciMeasured ? ci : null,
      stats: {
        median: round(quantiles(sorted, 0.5), 1),
        p25: round(quantiles(sorted, 0.25), 1),
        p75: round(quantiles(sorted, 0.75), 1),
        min: round(sorted[0], 1),
        max: round(sorted[sorted.length - 1], 1),
      },
    },
  };
}

async function main() {
  const files = await readdir(SRC);
  // Match <subject>_<condition>.json specifically. A bare filter on ".json"
  // also swallows exemplars.json, which now lives alongside the recordings
  // (each dataset owns its own), and yields a phantom "exemplars.json" subject.
  const subjects = [
    ...new Set(
      files
        .filter((f) => CONDITIONS.some((c) => f.endsWith(`_${c}.json`)))
        .map((f) => f.split("_")[0]),
    ),
  ].sort();

  await mkdir(OUT, { recursive: true });

  const manifestSubjects = [];
  let electrodes = null;
  let bytes = 0;

  for (const subject of subjects) {
    const conditions = {};
    let head = null;

    for (const condition of CONDITIONS) {
      const { doc, condition: packed } = await readCondition(subject, condition);
      head ??= doc;
      conditions[condition] = packed;
    }

    const bundle = {
      subject,
      responsive: head.responsive,
      sdpFs: head.fs,
      topoFs: head.fs / TOPO_STRIDE,
      durationSec: head.frames.length / head.fs,
      electrodes: head.electrodes,
      conditions,
    };

    electrodes ??= head.electrodes;

    const json = JSON.stringify(bundle);
    bytes += json.length;
    await writeFile(join(OUT, `${subject}.json`), json);

    manifestSubjects.push({
      subject,
      responsive: head.responsive,
      conditions: Object.fromEntries(
        CONDITIONS.map((c) => [
          c,
          { drugConcentration: conditions[c].drugConcentration, ...conditions[c].stats },
        ]),
      ),
    });
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: `data/${SOURCE}`,
    conditions: CONDITIONS,
    electrodes,
    subjects: manifestSubjects,
    ciMeasured: false,
  };

  await writeFile(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));

  // Shared across both data sources — not part of the A/B comparison, so
  // these live at public/data/ top-level, not per-source.
  const PUBLIC_DATA = resolve(HERE, "../public/data");
  for (const dir of COPY_DIRS) {
    await cp(join(DATA, dir), join(PUBLIC_DATA, dir), { recursive: true });
  }
  // Per-source: the two datasets have different subjects, so each ships its
  // own exemplars beside its bundles rather than one shared copy.
  for (const file of COPY_FILES) {
    await cp(join(SRC, file), join(OUT, file));
  }

  const kb = (bytes / subjects.length / 1024).toFixed(0);
  console.log(
    `bundled ${subjects.length} subjects x ${CONDITIONS.length} conditions -> public/data/${SOURCE} (~${kb} KB per subject)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
