// VIGIL dev preview — minimal vanilla-JS viewer for the data/*.json contract.
// Not the real frontend. Just enough to see SDP/CI/topomap moving.

const CONDITIONS = ["baseline", "mild", "moderate", "recovery"];
const DATA_DIR = "../data";

const state = {
  bySubjectCondition: {}, // "S00_baseline" -> parsed json
  electrodes: null,
  conditionIndex: 0,
  frameIndex: 0,
  playing: false,
  lastTick: 0,
};

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`failed to load ${path}: ${res.status}`);
  return res.json();
}

async function loadAll() {
  const files = CONDITIONS.map((c) => `S00_${c}`).concat(["S01_moderate"]);
  const entries = await Promise.all(
    files.map(async (key) => [key, await loadJSON(`${DATA_DIR}/${key}.json`)])
  );
  for (const [key, data] of entries) {
    state.bySubjectCondition[key] = data;
  }
  state.electrodes = state.bySubjectCondition["S00_baseline"].electrodes;
}

// --- topomap rendering: inverse-distance-weighted interpolation over a disc ---

function drawTopomap(canvas, electrodes, topoValues) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  const cx = w / 2, cy = h / 2;
  const r = Math.min(w, h) / 2 - 4;

  const img = ctx.createImageData(w, h);
  const power = 2;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const nx = (px - cx) / r;
      const ny = -(py - cy) / r; // flip so +y is up (nose direction)
      const dist2 = nx * nx + ny * ny;
      const idx = (py * w + px) * 4;
      if (dist2 > 1) {
        img.data[idx + 3] = 0; // outside head, transparent
        continue;
      }
      let wsum = 0, vsum = 0;
      for (let i = 0; i < electrodes.length; i++) {
        const dx = nx - electrodes[i].x;
        const dy = ny - electrodes[i].y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 1e-6) { wsum = 1; vsum = topoValues[i]; break; }
        const wt = 1 / Math.pow(d2, power / 2);
        wsum += wt;
        vsum += wt * topoValues[i];
      }
      const v = Math.max(0, Math.min(1, vsum / wsum));
      const [r8, g8, b8] = colorFor(v);
      img.data[idx] = r8;
      img.data[idx + 1] = g8;
      img.data[idx + 2] = b8;
      img.data[idx + 3] = 255;
    }
  }
  ctx.clearRect(0, 0, w, h);
  ctx.putImageData(img, 0, 0);

  // head outline
  ctx.strokeStyle = "#2A3533";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // electrode dots
  ctx.fillStyle = "#0A0E0F";
  ctx.strokeStyle = "#5A6664";
  for (const e of electrodes) {
    const ex = cx + e.x * r;
    const ey = cy - e.y * r;
    ctx.beginPath();
    ctx.arc(ex, ey, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

// low value -> dark, high value -> clinical green (matches the aesthetic direction in the PRD)
function colorFor(v) {
  const r = Math.round(10 + v * 20);
  const g = Math.round(20 + v * 190);
  const b = Math.round(15 + v * 90);
  return [r, g, b];
}

// --- main render loop ---

function currentFrameData() {
  const condition = CONDITIONS[state.conditionIndex];
  const data = state.bySubjectCondition[`S00_${condition}`];
  const frame = data.frames[state.frameIndex % data.frames.length];
  return { data, frame };
}

function renderMain() {
  const { data, frame } = currentFrameData();
  drawTopomap(document.getElementById("topo"), state.electrodes, frame.topo);

  document.getElementById("sdpValue").textContent = Math.round(frame.sdp);
  document.getElementById("sdpLabel").textContent =
    (frame.sdp < 50 ? '"unconscious"' : '"awake"') + " · spectral proxy, not BIS";

  const ciPanel = document.getElementById("ciPanel");
  const ciValue = document.getElementById("ciValue");
  const ciLabel = document.getElementById("ciLabel");
  if (frame.ci === null || frame.ci === undefined) {
    ciPanel.classList.add("not-measured");
    ciValue.textContent = "—";
    ciLabel.textContent = "NOT MEASURED";
  } else {
    ciPanel.classList.remove("not-measured");
    ciValue.textContent = frame.ci.toFixed(2);
    ciLabel.textContent = (frame.ci > 0.5 ? '"awake"' : '"not coupled"') + " · coupling index";
  }

  document.getElementById("statusText").textContent =
    `S00 · ${data.condition.toUpperCase()} · ${data.drug_concentration_ug_ml.toFixed(1)} µg/mL · t=${frame.t.toFixed(1)}s`;
}

function renderTwoPatient() {
  const a = state.bySubjectCondition["S00_moderate"];
  const b = state.bySubjectCondition["S01_moderate"];
  const fa = a.frames[state.frameIndex % a.frames.length];
  const fb = b.frames[state.frameIndex % b.frames.length];

  drawTopomap(document.getElementById("topoA"), state.electrodes, fa.topo);
  drawTopomap(document.getElementById("topoB"), state.electrodes, fb.topo);

  document.getElementById("sdpA").textContent = Math.round(fa.sdp);
  document.getElementById("sdpB").textContent = Math.round(fb.sdp);
  document.getElementById("ciA").textContent = fa.ci == null ? "—" : fa.ci.toFixed(2);
  document.getElementById("ciB").textContent = fb.ci == null ? "—" : fb.ci.toFixed(2);

  document.getElementById("patientALabel").textContent =
    `PATIENT A — ${a.responsive ? "responded to command" : "did not respond"}`;
  document.getElementById("patientBLabel").textContent =
    `PATIENT B — ${b.responsive ? "responded to command" : "did not respond"}`;
}

function tick(ts) {
  const { data } = currentFrameData();
  const frameIntervalMs = 1000 / data.fs;
  if (state.playing && ts - state.lastTick >= frameIntervalMs) {
    state.frameIndex += 1;
    state.lastTick = ts;
  }
  renderMain();
  if (document.getElementById("twoPatient").classList.contains("active")) {
    renderTwoPatient();
  }
  requestAnimationFrame(tick);
}

function wireControls() {
  const slider = document.getElementById("conditionSlider");
  slider.addEventListener("input", () => {
    state.conditionIndex = Number(slider.value);
    state.frameIndex = 0;
  });

  const playBtn = document.getElementById("playBtn");
  playBtn.addEventListener("click", () => {
    state.playing = !state.playing;
    playBtn.textContent = state.playing ? "⏸ pause" : "▶ play";
  });

  const twoPatientBtn = document.getElementById("twoPatientBtn");
  const twoPatientPanel = document.getElementById("twoPatient");
  twoPatientBtn.addEventListener("click", () => {
    twoPatientPanel.classList.toggle("active");
  });
}

async function main() {
  document.getElementById("statusText").textContent = "loading fixtures…";
  await loadAll();
  wireControls();
  state.playing = true;
  document.getElementById("playBtn").textContent = "⏸ pause";
  requestAnimationFrame(tick);
}

main().catch((err) => {
  document.getElementById("statusText").textContent = `error: ${err.message}`;
  console.error(err);
});
