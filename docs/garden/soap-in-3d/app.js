import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const $ = (id) => document.getElementById(id);
const COLORS = { C: "#8f9bb3", H: "#f2f2f2", O: "#ff5a5a" };

let DATA = null;
let preset = "tetra";
let cutoff = 4;
let mode = "off";
let pcaMode = "off";
let sigma = 0.45;
let showDensity = true;
let showCutoff = true;
let showSlices = true;
let sliceAngle = 0;
let autoRotate = false;
let pair = "all";
let lChan = "all";

/* ---------------- three.js scene ---------------- */
const canvas = $("three");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(3.6, 2.8, 4.6);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 2.5;
controls.maxDistance = 16;
controls.target.set(0, 0, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const key = new THREE.PointLight(0xff6a7f, 90, 30);
key.position.set(6, 8, 6);
scene.add(key);
const fill = new THREE.PointLight(0x5a6cff, 60, 30);
fill.position.set(-7, -3, -5);
scene.add(fill);

const root = new THREE.Group();
scene.add(root);
let densityPts = null;
let cutoffMesh = null;
let sliceGroup = null;

function clearGroup(g) {
  while (g.children.length) {
    const c = g.children.pop();
    if (c.geometry) c.geometry.dispose();
    if (c.material) {
      if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
      else c.material.dispose();
    }
  }
}

function randomNormal() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function buildScene() {
  clearGroup(root);
  const p = DATA.presets[preset];
  const atoms = p.atoms;

  // central atom
  const center = new THREE.Mesh(
    new THREE.SphereGeometry(0.46, 32, 24),
    new THREE.MeshStandardMaterial({ color: 0x1a1420, roughness: 0.35, metalness: 0.2, emissive: 0x2a0b12 })
  );
  root.add(center);

  const bondPts = [];
  atoms.slice(1).forEach((a) => {
    const [x, y, z] = a.position;
    const col = new THREE.Color(COLORS[a.symbol] || "#ffffff");
    const s = new THREE.Mesh(
      new THREE.SphereGeometry(a.symbol === "H" ? 0.30 : 0.40, 28, 20),
      new THREE.MeshStandardMaterial({ color: col, roughness: 0.38, metalness: 0.1 })
    );
    s.position.set(x, y, z);
    root.add(s);
    bondPts.push(0, 0, 0, x, y, z);
  });
  const bondGeo = new THREE.BufferGeometry();
  bondGeo.setAttribute("position", new THREE.Float32BufferAttribute(bondPts, 3));
  root.add(new THREE.LineSegments(bondGeo, new THREE.LineBasicMaterial({ color: 0x6e5f6e, transparent: true, opacity: 0.55 })));

  // cutoff sphere
  cutoffMesh = new THREE.Mesh(
    new THREE.SphereGeometry(cutoff, 40, 28),
    new THREE.MeshBasicMaterial({ color: 0x45d6ff, wireframe: true, transparent: true, opacity: 0.045 })
  );
  cutoffMesh.visible = showCutoff;
  root.add(cutoffMesh);

  // cross-section planes with rainbow density
  if (!showSlices) { sliceGroup = null; } else {
  sliceGroup = new THREE.Group();
  sliceGroup.rotation.y = sliceAngle * Math.PI / 180;
  const R = cutoff;
  const axes = [
    { name: "xy", rot: [0, 0, 0] },
    { name: "xz", rot: [-Math.PI / 2, 0, 0] },
    { name: "yz", rot: [0, Math.PI / 2, 0] },
  ];
  axes.forEach((a) => {
    const tex = new THREE.CanvasTexture(makeSliceCanvas(a.name));
    tex.needsUpdate = true;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(2 * R, 2 * R),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })
    );
    m.rotation.set(...a.rot);
    sliceGroup.add(m);
  });
  sliceGroup.visible = showSlices;
  root.add(sliceGroup);
  }

  // density cloud: Gaussian samples around each neighbor
  if (showDensity) {
    const per = 1400;
    const positions = [];
    const colors = [];
    atoms.slice(1).forEach((a) => {
      const col = new THREE.Color(COLORS[a.symbol] || "#ffffff");
      for (let i = 0; i < per; i++) {
        const r = sigma * 1.15;
        positions.push(
          a.position[0] + randomNormal() * r,
          a.position[1] + randomNormal() * r,
          a.position[2] + randomNormal() * r
        );
        colors.push(col.r * 0.9, col.g * 0.9, col.b * 0.9);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const m = new THREE.PointsMaterial({
      size: 0.045, vertexColors: true, transparent: true, opacity: 0.14,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    densityPts = new THREE.Points(g, m);
    root.add(densityPts);
  }

  $("presetNote").textContent = p.description;
}

function resize() {
  const wrap = $("threeWrap");
  const w = wrap.clientWidth, h = wrap.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function animate() {
  requestAnimationFrame(animate);
  controls.autoRotate = autoRotate;
  controls.autoRotateSpeed = 1.2;
  controls.update();
  renderer.render(scene, camera);
}

/* ---------------- controls ---------------- */
function initSceneControls() {
  const pc = $("presetControls");
  Object.entries(DATA.presets).forEach(([key, p]) => {
    const b = document.createElement("button");
    b.className = "pill";
    b.textContent = p.label;
    b.setAttribute("aria-pressed", key === preset);
    b.onclick = () => {
      preset = key;
      [...pc.children].forEach((c) => c.setAttribute("aria-pressed", c === b));
      buildScene();
      renderHeatmap();
    };
    pc.appendChild(b);
  });

  const cc = $("cutoffControls");
  DATA.meta.cutoffs.forEach((c) => {
    const b = document.createElement("button");
    b.className = "pill";
    b.textContent = c.toFixed(1) + " Å";
    b.setAttribute("aria-pressed", c === cutoff);
    b.onclick = () => {
      cutoff = c;
      [...cc.children].forEach((x) => x.setAttribute("aria-pressed", x === b));
      buildScene();
      renderHeatmap();
    };
    cc.appendChild(b);
  });

  $("sigma").oninput = (e) => {
    sigma = Number(e.target.value);
    $("sigmaVal").textContent = sigma.toFixed(2);
    buildScene();
  };
  $("toggleDensity").onclick = (e) => {
    showDensity = !showDensity;
    e.currentTarget.setAttribute("aria-pressed", showDensity);
    buildScene();
  };
  $("toggleCutoff").onclick = (e) => {
    showCutoff = !showCutoff;
    e.currentTarget.setAttribute("aria-pressed", showCutoff);
    if (cutoffMesh) cutoffMesh.visible = showCutoff;
  };
  $("toggleSlices").onclick = (e) => {
    showSlices = !showSlices;
    e.currentTarget.setAttribute("aria-pressed", showSlices);
    buildScene();
  };
  $("sliceAngle").oninput = (e) => {
    sliceAngle = Number(e.target.value);
    $("sliceAngleVal").textContent = sliceAngle + "°";
    if (sliceGroup) sliceGroup.rotation.y = sliceAngle * Math.PI / 180;
  };
  $("toggleSpin").onclick = (e) => {
    autoRotate = !autoRotate;
    e.currentTarget.setAttribute("aria-pressed", autoRotate);
  };

  const legend = $("atomLegend");
  legend.innerHTML = ["C", "H", "O"].map((s) =>
    `<span><i class="atom-dot" style="background:${COLORS[s]}"></i>${s}</span>`).join("") +
    `<span><i class="atom-dot" style="background:#45d6ff;opacity:.5"></i>cutoff</span>`;
}

/* ---------------- heatmap ---------------- */
function descriptorFor() {
  const key = `${preset}|${cutoff.toFixed(1)}`;
  return DATA.descriptors[mode][key];
}

function renderHeatmap() {
  const values = descriptorFor();
  const labels = DATA.labels[mode];
  const cells = spectrumCells(values, labels);
  const rows = [...new Set(cells.map((c) => c.n + "-" + c.n2))];
  const lvals = [0, 1, 2, 3, 4];
  const max = Math.max(...cells.flatMap((c) => lvals.map((l) => c.values[l] || 0)), 1e-9);

  const canvas = $("heatmap");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const left = 90, top = 30, cellW = (W - left - 20) / lvals.length;
  const cellH = (H - top - 44) / Math.max(rows.length, 1);

  ctx.font = "11px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#6e5f6e";
  lvals.forEach((l, j) => ctx.fillText("l=" + l, left + cellW * (j + 0.5), top - 10));
  ctx.textAlign = "right";
  rows.forEach((r, i) => ctx.fillText("n=" + r.split("-")[0] + ",n′=" + r.split("-")[1],
    left - 8, top + cellH * (i + 0.5) + 4));

  rows.forEach((r, i) => {
    const cell = cells.find((c) => c.n + "-" + c.n2 === r);
    lvals.forEach((l, j) => {
      const v = cell ? (cell.values[l] || 0) : 0;
      const t = Math.pow(v / max, 0.45);
      ctx.fillStyle = rainbow(t);
      ctx.fillRect(left + cellW * j + 1, top + cellH * i + 1, cellW - 2, cellH - 2);
      if (t > 0.62) {
        ctx.fillStyle = "#14060a";
        ctx.font = "10px ui-monospace, monospace";
        ctx.fillText(v.toFixed(2), left + cellW * (j + 0.5), top + cellH * (i + 0.5) + 3);
        ctx.font = "11px Inter, sans-serif";
      }
    });
  });

  $("descLen").textContent = values.length;
  $("descMode").textContent = mode === "off" ? "uncompressed" : "mu1nu1";
  $("descCut").textContent = cutoff.toFixed(1);
  const species = DATA.meta.species.length;
  $("heatNote").innerHTML = mode === "off"
    ? `Rows are radial channel pairs <code>(n, n′)</code>, columns <code>l</code>. Pair filter: <strong>${pair}</strong>. Uncompressed length: ${DATA.meta.descriptor_lengths.off}.`
    : `mu1nu1 rows are <code>(n, n′)</code>, columns <code>l</code>, summed over species. Length drops to ${DATA.meta.descriptor_lengths.mu1nu1} for ${species} species.`;

  renderSpectrum(values, labels);
}

/* ---------------- PCA ---------------- */
function renderPCA() {
  const c = $("pca");
  const ctx = c.getContext("2d");
  const W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);
  const pts = DATA.compression.points[pcaMode];
  const pad = 40;
  const sx = (x) => pad + (x + 1) / 2 * (W - 2 * pad);
  const sy = (y) => H - pad - (y + 1) / 2 * (H - 2 * pad);
  ctx.strokeStyle = "rgba(214,160,180,.18)";
  ctx.beginPath(); ctx.moveTo(sx(0), pad); ctx.lineTo(sx(0), H - pad);
  ctx.moveTo(pad, sy(0)); ctx.lineTo(W - pad, sy(0)); ctx.stroke();
  const colors = { tetra: "#ff3d5a", octa: "#5a6cff", dimer: "#63e6a4" };
  pts.forEach((p) => {
    ctx.beginPath();
    ctx.arc(sx(p.x), sy(p.y), 3.6, 0, Math.PI * 2);
    ctx.fillStyle = colors[p.base] || "#a79ba6";
    ctx.globalAlpha = 0.8;
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  ctx.font = "11px Inter, sans-serif";
  ctx.fillStyle = "#6e5f6e";
  ctx.fillText("PC1", W - 46, sy(0) - 8);
  ctx.fillText("PC2", sx(0) + 8, pad + 12);
  const ev = DATA.compression.explained_variance[pcaMode];
  $("pcaVar").textContent = ((ev[0] + ev[1]) * 100).toFixed(1) + "%";
}

function initSpectrumControls() {
  const ps = $("pairButtons");
  ps.innerHTML = "";
  pairList().forEach((p) => {
    const b = document.createElement("button");
    b.className = "pill";
    b.textContent = p === "all" ? "all pairs" : p;
    b.setAttribute("aria-pressed", pair === p);
    b.onclick = () => { pair = p; [...ps.children].forEach((x) => x.setAttribute("aria-pressed", x === b)); renderHeatmap(); };
    ps.appendChild(b);
  });
  if (!pairList().includes(pair)) pair = "all";

  const ls = $("lButtons");
  ls.innerHTML = "";
  [["all", "all l"], ...Array.from({ length: 5 }, (_, i) => [String(i), "l=" + i])].forEach(([v, t]) => {
    const b = document.createElement("button");
    b.className = "pill";
    b.textContent = t;
    b.setAttribute("aria-pressed", lChan === v);
    b.onclick = () => { lChan = v; [...ls.children].forEach((x) => x.setAttribute("aria-pressed", x === b)); renderHeatmap(); };
    ls.appendChild(b);
  });
}

/* ---------------- boot ---------------- */
async function init() {
  DATA = await (await fetch("data/soap_data.json")).json();
  resize();
  buildScene();
  initSceneControls();
  initSpectrumControls();
  renderHeatmap();
  renderPCA();
  initDimension();
  window.addEventListener("resize", resize);
  animate();

  document.querySelectorAll("[data-mode]").forEach((b) => {
    b.onclick = () => {
      mode = b.dataset.mode;
      document.querySelectorAll("[data-mode]").forEach((x) => x.setAttribute("aria-pressed", x === b));
      initSpectrumControls();
      renderHeatmap();
    };
  });
  document.querySelectorAll("[data-pca]").forEach((b) => {
    b.onclick = () => {
      pcaMode = b.dataset.pca;
      document.querySelectorAll("[data-pca]").forEach((x) => x.setAttribute("aria-pressed", x === b));
      renderPCA();
    };
  });
}

init().catch((e) => {
  console.error(e);
  $("presetNote").textContent = "Could not load SOAP data: " + e.message;
});

/* ---------------- cross-section density slices ---------------- */
function densityAt(x, y, z) {
  const p = DATA.presets[preset];
  let rho = 0;
  const s2 = 2 * sigma * sigma;
  p.atoms.slice(1).forEach((a) => {
    const dx = x - a.position[0], dy = y - a.position[1], dz = z - a.position[2];
    rho += Math.exp(-(dx * dx + dy * dy + dz * dz) / s2);
  });
  return rho;
}

function rainbow(t) {
  t = Math.max(0, Math.min(1, t));
  const stops = [
    [0.00, [43, 26, 107]],
    [0.18, [36, 86, 216]],
    [0.38, [24, 198, 198]],
    [0.58, [139, 214, 70]],
    [0.74, [255, 217, 59]],
    [0.88, [255, 122, 26]],
    [1.00, [216, 27, 60]],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t <= stops[i + 1][0]) {
      const [a, ca] = stops[i], [b, cb] = stops[i + 1];
      const k = (t - a) / (b - a);
      return `rgb(${Math.round(ca[0] + (cb[0] - ca[0]) * k)},${Math.round(ca[1] + (cb[1] - ca[1]) * k)},${Math.round(ca[2] + (cb[2] - ca[2]) * k)})`;
    }
  }
  return "rgb(216,27,60)";
}

function sliceDensity(u, v, axis) {
  // maximum-intensity projection through the slice normal: makes the
  // cross-section readable even when no atom lies exactly in the plane.
  let best = 0;
  const steps = 17;
  for (let k = 0; k < steps; k++) {
    const t = -cutoff + (2 * cutoff) * k / (steps - 1);
    let x = 0, y = 0, z = 0;
    if (axis === "xy") { x = u; y = v; z = t; }
    else if (axis === "xz") { x = u; z = v; y = t; }
    else { y = u; z = v; x = t; }
    best = Math.max(best, densityAt(x, y, z));
  }
  return best;
}

function makeSliceCanvas(axis) {
  const N = 180;
  const R = cutoff;
  const cv = document.createElement("canvas");
  cv.width = cv.height = N;
  const ctx = cv.getContext("2d");
  const img = ctx.createImageData(N, N);
  const max = 1.0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const u = (i / (N - 1)) * 2 * R - R;
      const v = (R - j / (N - 1) * 2 * R);
      const rho = sliceDensity(u, v, axis) / max;
      const m = rainbow(Math.pow(rho, 0.5)).match(/\d+/g).map(Number);
      const k = (j * N + i) * 4;
      img.data[k] = m[0]; img.data[k + 1] = m[1]; img.data[k + 2] = m[2]; img.data[k + 3] = 220;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

function refreshSlices() {
  if (!sliceGroup) return;
  sliceGroup.children.forEach((m, idx) => {
    const axis = ["xy", "xz", "yz"][idx];
    m.material.map.dispose();
    m.material.map = new THREE.CanvasTexture(makeSliceCanvas(axis));
    m.material.map.needsUpdate = true;
  });
}

/* ---------------- better power-spectrum views ---------------- */
function pairKey(L) {
  if (mode === "mu1nu1") return "all";
  return `${L.a_species}-${L.b_species}`;
}

function pairList() {
  if (mode === "mu1nu1") return ["all"];
  const set = new Set();
  DATA.labels.off.forEach((L) => set.add(`${L.a_species}-${L.b_species}`));
  return ["all", ...[...set].sort()];
}

function spectrumCells(values, labels) {
  const cells = new Map();
  values.forEach((v, i) => {
    const L = labels[i];
    if (mode === "off" && pair !== "all" && pairKey(L) !== pair) return;
    const a = mode === "off" ? L.a_n : L.n;
    const b = mode === "off" ? L.b_n : L.n2;
    if (a > b) return;
    const key = `${a}-${b}`;
    const cell = cells.get(key) || { n: a, n2: b, values: {} };
    cell.values[L.l] = (cell.values[L.l] || 0) + v;
    cells.set(key, cell);
  });
  return [...cells.values()].sort((x, y) => x.n - y.n || x.n2 - y.n2);
}

function spectrumAt(cell) {
  if (lChan === "all") return Object.values(cell.values).reduce((a, b) => a + b, 0);
  return cell.values[Number(lChan)] || 0;
}

function renderSpectrum(values, labels) {
  const cells = spectrumCells(values, labels);
  const max = Math.max(...cells.map(spectrumAt), 1e-9);
  const cv = $("spectrumBars");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  const pad = 34, cols = 4, rows = 4;
  const cw = (W - 2 * pad) / cols, ch = (H - 2 * pad) / rows;
  ctx.font = "11px Inter, sans-serif";
  for (let n = 0; n < 4; n++) for (let n2 = 0; n2 < 4; n2++) {
    const cell = cells.find((c) => c.n === n && c.n2 === n2);
    const x = pad + n2 * cw, y = pad + n * ch;
    const val = cell ? spectrumAt(cell) : 0;
    const h = (val / max) * (ch - 26);
    ctx.fillStyle = "rgba(214,160,180,.06)";
    ctx.fillRect(x + 2, y + 2, cw - 4, ch - 4);
    ctx.fillStyle = rainbow(Math.pow(val / max, 0.5));
    ctx.fillRect(x + 6, y + ch - 8 - h, cw - 12, h);
    ctx.fillStyle = "#6e5f6e";
    ctx.textAlign = "center";
    ctx.fillText(`n=${n},n′=${n2}`, x + cw / 2, y + ch - 1);
  }
  ctx.fillStyle = "#a79ba6";
  ctx.textAlign = "left";
  ctx.fillText(mode === "off" ? "uncompressed · cells n ≤ n′" : "mu1nu1 · all n,n′ cells", pad, 18);
  ctx.fillText((lChan === "all" ? "sum over l" : "l = " + lChan) + " · height = power", pad, H - 8);

  const top = [...cells].map((c) => ({ ...c, v: spectrumAt(c) })).sort((a, b) => b.v - a.v).slice(0, 6);
  $("topComponents").innerHTML = top.map((c) =>
    `<span>(n=${c.n}, n′=${c.n2}) <b>${c.v.toFixed(2)}</b></span>`).join("");
}

/* ---------------- dimension chart ---------------- */
function dimCounts(S) {
  const off = (S * 4) * (S * 4 + 1) / 2 * 5;
  const mu1 = 16 * S * 5;
  const mu2 = 4 * 5 / 2 * 5;
  return { off, mu1, mu2 };
}

function drawDim() {
  const cv = $("dimChart");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  const S = Number($("speciesSlider").value);
  const pad = { l: 70, r: 24, t: 24, b: 40 };
  const xmin = 1, xmax = 90;
  const maxV = dimCounts(90).off;
  const ly = (v) => Math.log10(Math.max(1, v));
  const sy = (v) => H - pad.b - (ly(v) / ly(maxV)) * (H - pad.t - pad.b);
  const sx = (s) => pad.l + (s - xmin) / (xmax - xmin) * (W - pad.l - pad.r);

  ctx.strokeStyle = "rgba(214,160,180,.18)";
  [0, 0.5, 1].forEach((t) => {
    const y = H - pad.b - t * (H - pad.t - pad.b);
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
  });
  const series = [
    { key: "off", color: "#ff3d5a", label: "uncompressed" },
    { key: "mu1", color: "#5a6cff", label: "mu1nu1" },
    { key: "mu2", color: "#45d6ff", label: "mu2" },
  ];
  series.forEach((s) => {
    ctx.beginPath();
    for (let i = 1; i <= 90; i++) {
      const v = dimCounts(i)[s.key];
      const x = sx(i), y = sy(v);
      i === 1 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = s.color; ctx.lineWidth = 2.2; ctx.stroke();
  });
  // current marker
  const cur = dimCounts(S);
  ctx.strokeStyle = "rgba(238,233,238,.35)";
  ctx.beginPath(); ctx.moveTo(sx(S), pad.t); ctx.lineTo(sx(S), H - pad.b); ctx.stroke();
  series.forEach((s) => {
    ctx.beginPath(); ctx.arc(sx(S), sy(cur[s.key]), 3.5, 0, Math.PI * 2);
    ctx.fillStyle = s.color; ctx.fill();
  });

  ctx.fillStyle = "#6e5f6e"; ctx.font = "11px Inter, sans-serif";
  for (let s = 1; s <= 90; s += 10) {
    ctx.fillText(s, sx(s) - 6, H - pad.b + 16);
  }
  ctx.fillText("species", W - 60, H - 8);
  ctx.fillText("descriptor length (log)", 4, 16);

  $("speciesVal").textContent = S;
  $("lenOff").textContent = cur.off.toLocaleString();
  $("lenMu1").textContent = cur.mu1.toLocaleString();
  $("lenMu2").textContent = cur.mu2.toLocaleString();
}

function initDimension() {
  $("speciesSlider").oninput = drawDim;
  document.querySelectorAll("[data-species]").forEach((b) => {
    b.onclick = () => {
      $("speciesSlider").value = b.dataset.species;
      drawDim();
    };
  });
  drawDim();
}