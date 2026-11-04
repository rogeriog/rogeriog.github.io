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
let showCutoff = false;
let showSlices = true;
let sliceAngle = 0;
let sliceTilt = 0;
let autoRotate = false;
let pair = "all";
let lChan = "0";
let selCell = null;
let heatLayout = null;

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
let sliceMesh = null;

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

  // one rotating cross-section plane, re-textured in world space
  sliceGroup = null;
  sliceMesh = null;
  if (showSlices) {
    sliceGroup = new THREE.Group();
    const geo = new THREE.PlaneGeometry(2 * cutoff, 2 * cutoff);
    sliceMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(makeSliceCanvas()),
      transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false,
    }));
    sliceGroup.add(sliceMesh);
    orientSlice();
    sliceGroup.visible = true;
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
  if (integ && integ._rebuild) integ._rebuild();
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
      // sync section-7 preset buttons
      document.querySelectorAll("#specPresetButtons button").forEach((x) => {
        x.setAttribute("aria-pressed", x.textContent === p.label);
      });
      buildScene();
      buildSpecAtoms();
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
    refreshSlices();
  };
  $("sliceTilt").oninput = (e) => {
    sliceTilt = Number(e.target.value);
    $("sliceTiltVal").textContent = sliceTilt + "°";
    refreshSlices();
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
  const allVals = cells.flatMap((c) => lvals.map((l) => c.values[l] || 0));
  const vmax = Math.max(...allVals, 1e-9);
  const vmin = Math.min(...allVals, 0);

  const canvas = $("heatmap");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const left = 90, top = 30, cellW = (W - left - 20) / lvals.length;
  const cellH = (H - top - 44) / Math.max(rows.length, 1);
  heatLayout = { left, top, cellW, cellH, rows };

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
      const t = Math.max(0, Math.min(1, (v - vmin) / (vmax - vmin || 1)));
      ctx.fillStyle = rainbow(Math.pow(t, 0.75));
      ctx.fillRect(left + cellW * j + 1, top + cellH * i + 1, cellW - 2, cellH - 2);
      ctx.fillStyle = t > 0.55 ? "#14060a" : "#eee9ee";
      ctx.font = "9px ui-monospace, monospace";
      ctx.fillText(v.toFixed(2), left + cellW * (j + 0.5), top + cellH * (i + 0.5) + 3);
      ctx.font = "11px Inter, sans-serif";
      if (selCell === r + "|" + l) {
        ctx.strokeStyle = "#45d6ff"; ctx.lineWidth = 1.5;
        ctx.strokeRect(left + cellW * j + 1.5, top + cellH * i + 1.5, cellW - 3, cellH - 3);
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

  $("heatMax").textContent = `${vmin.toFixed(2)} … ${vmax.toFixed(2)}`;
  const sel = selCell ? findSelectedCell(cells) : null;
  if (sel) {
    $("cellInfo").innerHTML = `Selected channel: <strong>n=${sel.n}, n′=${sel.n2}, l=${sel.l}</strong>
      → <strong>p = ${sel.v.toFixed(3)}</strong>. This box is one number in the descriptor;
      the colour is only a visual aid.`;
  } else {
    $("cellInfo").innerHTML = "Click any box to inspect its n, n′, l and value.";
  }
  renderSpectrumTable(cells);
  renderSpectrum(values, labels);
}

function findSelectedCell(cells) {
  if (!selCell) return null;
  const [row, l] = selCell.split("|");
  const [n, n2] = row.split("-").map(Number);
  const c = cells.find((x) => x.n === n && x.n2 === n2);
  if (!c) return null;
  return { n, n2, l: Number(l), v: c.values[Number(l)] || 0 };
}

function renderSpectrumTable(cells) {
  const box = $("spectrumTable");
  if (!box) return;
  const rows = cells.sort((a, b) => a.n - b.n || a.n2 - b.n2);
  box.innerHTML = `<table><thead><tr><th>n, n′</th>${[0,1,2,3,4].map(l=>`<th>l=${l}</th>`).join("")}</tr></thead><tbody>` +
    rows.map((c) => `<tr><td>${c.n}, ${c.n2}</td>${[0,1,2,3,4].map(l=>`<td>${(c.values[l]||0).toFixed(2)}</td>`).join("")}</tr>`).join("") +
    `</tbody></table>`;
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
  $("pcaVar").textContent = (ev * 100).toFixed(1) + "%";
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
  $("heatmap").onclick = (e) => {
    if (!heatLayout) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) * (e.currentTarget.width / r.width);
    const y = (e.clientY - r.top) * (e.currentTarget.height / r.height);
    const col = Math.floor((x - heatLayout.left) / heatLayout.cellW);
    const row = Math.floor((y - heatLayout.top) / heatLayout.cellH);
    if (row < 0 || row >= heatLayout.rows.length || col < 0 || col > 4) return;
    selCell = heatLayout.rows[row] + "|" + col;
    renderHeatmap();
  };
  renderHeatmap();
  renderPCA();
  initDimension();
  initSH();
  initRotation();
  initSpectrumScene();
  initSpectrumPresets();
  initCompressionExplorer();
  initIntegration();
  initIntegControls();
  initRadialBasis();
  initSpeciesResolution();
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

function sliceBasis() {
  const yaw = sliceAngle * Math.PI / 180;
  const tilt = sliceTilt * Math.PI / 180;
  const n = new THREE.Vector3(Math.sin(tilt) * Math.cos(yaw), Math.sin(tilt) * Math.sin(yaw), Math.cos(tilt)).normalize();
  let up = new THREE.Vector3(0, 0, 1);
  if (Math.abs(n.dot(up)) > 0.95) up = new THREE.Vector3(0, 1, 0);
  const e1 = new THREE.Vector3().crossVectors(up, n).normalize();
  const e2 = new THREE.Vector3().crossVectors(n, e1).normalize();
  return { n, e1, e2 };
}

function sliceDensityAt(u, v) {
  const { n, e1, e2 } = sliceBasis();
  let best = 0;
  const steps = 11;
  for (let k = 0; k < steps; k++) {
    const t = -0.9 + 1.8 * k / (steps - 1);
    const x = e1.x * u + e2.x * v + n.x * t;
    const y = e1.y * u + e2.y * v + n.y * t;
    const z = e1.z * u + e2.z * v + n.z * t;
    best = Math.max(best, densityAt(x, y, z));
  }
  return best;
}

function makeSliceCanvas() {
  const N = 180;
  const R = cutoff;
  const cv = document.createElement("canvas");
  cv.width = cv.height = N;
  const ctx = cv.getContext("2d");
  const img = ctx.createImageData(N, N);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const u = (i / (N - 1)) * 2 * R - R;
      const v = (R - j / (N - 1) * 2 * R);
      const rho = Math.min(1, sliceDensityAt(u, v));
      const m = rainbow(Math.pow(rho, 0.55)).match(/\d+/g).map(Number);
      const k = (j * N + i) * 4;
      img.data[k] = m[0]; img.data[k + 1] = m[1]; img.data[k + 2] = m[2]; img.data[k + 3] = 225;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

function orientSlice() {
  if (!sliceMesh) return;
  const { n, e1, e2 } = sliceBasis();
  const m = new THREE.Matrix4().makeBasis(e1, e2, n);
  sliceMesh.quaternion.setFromRotationMatrix(m);
}

function refreshSlices() {
  if (!sliceMesh) return;
  sliceMesh.material.map.dispose();
  sliceMesh.material.map = new THREE.CanvasTexture(makeSliceCanvas());
  sliceMesh.material.map.needsUpdate = true;
  orientSlice();
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
  const max = Math.max(...cells.map((c) => Math.abs(spectrumAt(c))), 1e-9);
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
    const h = (Math.abs(val) / max) * (ch - 26);
    ctx.fillStyle = "rgba(214,160,180,.06)";
    ctx.fillRect(x + 2, y + 2, cw - 4, ch - 4);
    ctx.fillStyle = val >= 0 ? rainbow(Math.pow(val / max, 0.5)) : `rgba(69,150,255,${0.35 + 0.6 * Math.abs(val) / max})`;
    ctx.fillRect(x + 6, y + ch - 8 - h, cw - 12, h);
    ctx.fillStyle = "#6e5f6e";
    ctx.textAlign = "center";
    ctx.fillText(`n=${n},n′=${n2}`, x + cw / 2, y + ch - 1);
    if (val > 0) {
      ctx.fillStyle = "#eee9ee";
      ctx.font = "8px ui-monospace, monospace";
      ctx.fillText(val.toFixed(2), x + cw / 2, y + ch - 12 - h);
      ctx.font = "11px Inter, sans-serif";
    }
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
/* ---------------- spherical harmonics gallery ---------------- */
function realSH(l, m, x, y, z) {
  const r2 = x * x + y * y + z * z;
  const r = Math.sqrt(r2) || 1e-12;
  const X = x / r, Y = y / r, Z = z / r;
  if (l === 0) return 0.282095;
  if (l === 1) {
    if (m === -1) return 0.488603 * Y;
    if (m === 0) return 0.488603 * Z;
    return 0.488603 * X;
  }
  if (l === 2) {
    if (m === -2) return 1.092548 * X * Y;
    if (m === -1) return 1.092548 * Y * Z;
    if (m === 0) return 0.315392 * (3 * Z * Z - 1);
    if (m === 1) return 1.092548 * X * Z;
    return 0.546274 * (X * X - Y * Y);
  }
  if (l === 3) {
    if (m === -3) return 0.590044 * Y * (3 * X * X - Y * Y);
    if (m === -2) return 2.890611 * X * Y * Z;
    if (m === -1) return 0.457046 * Y * (5 * Z * Z - 1);
    if (m === 0) return 0.373176 * Z * (5 * Z * Z - 3);
    if (m === 1) return 0.457046 * X * (5 * Z * Z - 1);
    if (m === 2) return 1.445306 * Z * (X * X - Y * Y);
    return 0.590044 * X * (X * X - 3 * Y * Y);
  }
  return 0;
}

const SH_FORMULAS = {
  "0,0": "Y₀₀ = 0.2821",
  "1,-1": "Y₁,₋₁ = 0.4886 · y/r",
  "1,0": "Y₁,₀ = 0.4886 · z/r",
  "1,1": "Y₁,₁ = 0.4886 · x/r",
  "2,-2": "Y₂,₋₂ = 1.0925 · xy/r²",
  "2,-1": "Y₂,₋₁ = 1.0925 · yz/r²",
  "2,0": "Y₂,₀ = 0.3154 · (3z²−r²)/r²",
  "2,1": "Y₂,₁ = 1.0925 · xz/r²",
  "2,2": "Y₂,₂ = 0.5463 · (x²−y²)/r²",
  "3,-3": "Y₃,₋₃ = 0.5900 · y(3x²−y²)/r³",
  "3,-2": "Y₃,₋₂ = 2.8906 · xyz/r³",
  "3,-1": "Y₃,₋₁ = 0.4570 · y(5z²−r²)/r³",
  "3,0": "Y₃,₀ = 0.3732 · z(5z²−3r²)/r³",
  "3,1": "Y₃,₁ = 0.4570 · x(5z²−r²)/r³",
  "3,2": "Y₃,₂ = 1.4453 · z(x²−y²)/r³",
  "3,3": "Y₃,₃ = 0.5900 · x(x²−3y²)/r³",
};

let selL = 2, selM = 0;

function shColor(v, max) {
  const t = Math.max(-1, Math.min(1, v / (max || 1)));
  const a = Math.abs(t);
  return t >= 0
    ? `rgba(255,61,90,${0.15 + 0.85 * a})`
    : `rgba(69,150,255,${0.15 + 0.85 * a})`;
}

function drawSHCanvas(canvas, l, m, showAxes) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  let max = 0;
  const vals = [];
  for (let j = 0; j < H; j++) {
    const theta = (j / (H - 1)) * Math.PI;
    for (let i = 0; i < W; i++) {
      const phi = (i / (W - 1)) * 2 * Math.PI;
      const x = Math.sin(theta) * Math.cos(phi);
      const y = Math.sin(theta) * Math.sin(phi);
      const z = Math.cos(theta);
      const v = realSH(l, m, x, y, z);
      vals.push(v);
      max = Math.max(max, Math.abs(v));
    }
  }
  const img = ctx.createImageData(W, H);
  let k = 0;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const v = vals[k];
    const c = shColor(v, max).match(/[\d.]+/g).map(Number);
    const p = (j * W + i) * 4;
    img.data[p] = c[0]; img.data[p + 1] = c[1]; img.data[p + 2] = c[2];
    img.data[p + 3] = Math.abs(v) > 1e-6 ? 235 : 25;
    k++;
  }
  ctx.putImageData(img, 0, 0);
  if (showAxes) {
    ctx.strokeStyle = "rgba(238,233,238,.25)";
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    ctx.fillStyle = "#6e5f6e"; ctx.font = "10px Inter, sans-serif";
    ctx.fillText("φ = 0", 6, H - 8); ctx.fillText("φ = 2π", W - 44, H - 8);
    ctx.fillText("θ = 0", 6, 14); ctx.fillText("θ = π", 6, H - 4);
  }
}

function buildSHGallery() {
  const g = $("shGallery");
  g.innerHTML = "";
  for (let l = 0; l <= 3; l++) {
    for (let m = -l; m <= l; m++) {
      const tile = document.createElement("button");
      tile.className = "sh-tile";
      tile.setAttribute("aria-pressed", l === selL && m === selM);
      const cv = document.createElement("canvas");
      cv.width = 70; cv.height = 70;
      drawSHCanvas(cv, l, m, false);
      const label = document.createElement("span");
      label.textContent = `l=${l}, m=${m}`;
      tile.appendChild(cv); tile.appendChild(label);
      tile.onclick = () => {
        selL = l; selM = m;
        [...g.children].forEach((c) => c.setAttribute("aria-pressed", c === tile));
        drawSHDetail();
      };
      g.appendChild(tile);
    }
  }
}

function drawSHDetail() {
  drawSHCanvas($("shDetail"), selL, selM, true);
  updateSH3D(selL, selM);
  $("shLm").textContent = `l=${selL}, m=${selM}`;
  $("shFormula").textContent = SH_FORMULAS[`${selL},${selM}`] || "";
  const lobes = selL === 0 ? 1 : 2 * selL;
  $("shExplain").innerHTML = `This harmonic has <strong>${lobes}</strong> angular lobe${lobes === 1 ? "" : "s"}.
    For a fixed <code>l</code> there are <strong>2l+1</strong> values of <code>m</code>
    (here ${2 * selL + 1}); they span the orientations that the power spectrum sums over.`;
}

function initSH() {
  initSH3D();
  buildSHGallery();
  drawSHDetail();
}

/* ---------------- 3D spherical harmonic lobe viewer ---------------- */
let shRenderer, shScene, shCamera, shMesh, shControls;
function initSH3D() {
  const canvas = $("sh3d");
  if (!canvas) return;
  shRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  shRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  shRenderer.setSize(canvas.clientWidth || 360, canvas.clientHeight || 300, false);
  shScene = new THREE.Scene();
  shCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 20);
  shCamera.position.set(2.2, 1.6, 2.8);
  shControls = new OrbitControls(shCamera, canvas);
  shControls.enableDamping = true;
  shControls.autoRotate = true;
  shControls.autoRotateSpeed = 1.4;
  shScene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const l1 = new THREE.PointLight(0xff6a7f, 40, 20); l1.position.set(4, 5, 4); shScene.add(l1);
  const l2 = new THREE.PointLight(0x5a6cff, 30, 20); l2.position.set(-4, -3, -4); shScene.add(l2);
  (function loop() {
    requestAnimationFrame(loop);
    shControls.update();
    shRenderer.render(shScene, shCamera);
  })();
}

function updateSH3D(l, m) {
  if (!shScene) return;
  if (shMesh) { shScene.remove(shMesh); shMesh.geometry.dispose(); shMesh.material.dispose(); }
  const geo = new THREE.SphereGeometry(1, 96, 64);
  const pos = geo.attributes.position;
  const colors = [];
  let max = 0;
  const vals = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const v = realSH(l, m, x, y, z);
    vals.push(v); max = Math.max(max, Math.abs(v));
  }
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const v = vals[i] / (max || 1);
    const r = 0.35 + 0.65 * Math.abs(v);
    pos.setXYZ(i, x * r, y * r, z * r);
    if (v >= 0) colors.push(1.0, 0.24, 0.35); else colors.push(0.27, 0.55, 1.0);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.15, side: THREE.DoubleSide });
  shMesh = new THREE.Mesh(geo, mat);
  shScene.add(shMesh);
}

/* ---------------- integration animation (geometry-aware) ---------------- */
let integ = null;
let sampleMode = "grid";
let integGeom = "perovskite";
let integCutoff = 4;
let integRot = 0;
let rebuildIntegral = () => {};

function integAtoms(includeCenter) {
  const all = DATA.presets[integGeom].atoms;
  const base = (includeCenter ? all : all.slice(1)).map((a) => ({
    x: a.position[0], y: a.position[1], z: a.position[2],
  }));
  const t = integRot * Math.PI / 180;
  return base.map((a) => ({
    x: a.x * Math.cos(t) - a.y * Math.sin(t),
    y: a.x * Math.sin(t) + a.y * Math.cos(t),
    z: a.z,
  }));
}
const COEFF_ORDER = (() => {
  const out = [];
  for (let n = 0; n < 4; n++)
    for (let l = 0; l <= 3; l++)
      for (let m = -l; m <= l; m++) out.push({ n, l, m });
  return out;
})();

function integKey(n, l, m) { return `${n},${l},${m}`; }

/* ---------------- integration animation (geometry-aware) ---------------- */
function buildIntegPoints() {
  const R = integCutoff;
  const atoms = integAtoms();
  const pts = [];
  const SCALE = 1e6;
  if (sampleMode === "grid") {
    const N = 18;
    const dV = Math.pow(2 * R / (N - 1), 3);
    for (let i = 0; i < N; i++) {
      const x = -R + 2 * R * i / (N - 1);
      for (let j = 0; j < N; j++) {
        const y = -R + 2 * R * j / (N - 1);
        for (let k = 0; k < N; k++) {
          const z = -R + 2 * R * k / (N - 1);
          const rho = densityAtoms(atoms, x, y, z);
          if (rho > 1e-6) pts.push({ x, y, z, rho, w: dV * SCALE });
        }
      }
    }
    return { pts };
  }
  if (sampleMode === "sites") {
    // include ALL atoms (central + neighbors) as sample points
    const allAtoms = integAtoms(true);
    const w = 1 / allAtoms.length * SCALE;
    allAtoms.forEach((a) => pts.push({
      x: a.x, y: a.y, z: a.z,
      rho: densityAtoms(atoms, a.x, a.y, a.z), w,
    }));
    return { pts };
  }
  const N = 3500;
  if (sampleMode === "random") {
    const w = (4 / 3 * Math.PI * R * R * R) / N * SCALE;
    for (let i = 0; i < N; i++) {
      let x, y, z, d;
      do {
        x = (Math.random() * 2 - 1) * R; y = (Math.random() * 2 - 1) * R; z = (Math.random() * 2 - 1) * R;
        d = Math.hypot(x, y, z);
      } while (d > R);
      pts.push({ x, y, z, rho: densityAtoms(atoms, x, y, z), w });
    }
    return { pts };
  }
  // atom cloud: sample a neighbour, then a Gaussian around it; correct by the mixture density
  const sig = 0.55;
  const norm = Math.pow(2 * Math.PI * sig * sig, 1.5);
  for (let i = 0; i < N; i++) {
    const a = atoms[Math.floor(Math.random() * atoms.length)];
    const x = a.x + (Math.random() + Math.random() + Math.random() - 1.5) * sig * 2;
    const y = a.y + (Math.random() + Math.random() + Math.random() - 1.5) * sig * 2;
    const z = a.z + (Math.random() + Math.random() + Math.random() - 1.5) * sig * 2;
    let q = 0;
    atoms.forEach((b) => {
      const d2 = (x - b.x) ** 2 + (y - b.y) ** 2 + (z - b.z) ** 2;
      q += Math.exp(-d2 / (2 * sig * sig)) / norm;
    });
    q /= atoms.length;
    q = Math.max(q, 1e-8);
    pts.push({ x, y, z, rho: densityAtoms(atoms, x, y, z), w: (1 / (N * q)) * SCALE });
  }
  return { pts };
}

function integradial(n, r) {
  const rn = 0.8 + 0.55 * n;
  return Math.exp(-Math.pow(r - rn, 2) / (2 * 0.45 * 0.45));
}

function makeLobeMesh(l, m, R) {
  const geo = new THREE.SphereGeometry(1, 64, 44);
  const pos = geo.attributes.position;
  const colors = [];
  let max = 0;
  const vals = [];
  for (let i = 0; i < pos.count; i++) {
    const v = realSH(l, m, pos.getX(i), pos.getY(i), pos.getZ(i));
    vals.push(v); max = Math.max(max, Math.abs(v));
  }
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const v = vals[i] / (max || 1);
    const r = 0.22 + 0.78 * Math.abs(v);
    pos.setXYZ(i, x * r * R * 0.9, y * r * R * 0.9, z * r * R * 0.9);
    if (v >= 0) colors.push(1.0, 0.28, 0.38); else colors.push(0.32, 0.58, 1.0);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    vertexColors: true, transparent: true, opacity: 0.32,
    roughness: 0.4, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false,
  }));
}

function removeLobe() {
  if (integ && integ.lobe) {
    integ.scene.remove(integ.lobe);
    integ.lobe.geometry.dispose();
    integ.lobe.material.dispose();
    integ.lobe = null;
  }
}

function initIntegration() {
  const canvas = $("integrand3d");
  if (!canvas) return;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvas.clientWidth || 540, canvas.clientHeight || 400, false);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 30);
  camera.position.set(4.2, 3.2, 5.2);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.0;
  scene.add(new THREE.AmbientLight(0xffffff, 1));
  let points = null;

  // Explicit rebuild: disposes the previous Points geometry, so switching
  // geometry / cutoff / sampling mode repeatedly always replaces the cloud.
  const rebuild = () => {
    if (integ) { clearTimeout(integ.timer); integ.playing = false; removeLobe(); }
    const { pts } = buildIntegPoints();
    const pos = new Float32Array(pts.length * 3);
    const col = new Float32Array(pts.length * 3);
    pts.forEach((p, i) => {
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
    });
    if (points) { scene.remove(points); points.geometry.dispose(); points.material.dispose(); }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const colors = new THREE.BufferAttribute(col, 3);
    geometry.setAttribute("color", colors);
    points = new THREE.Points(geometry, new THREE.PointsMaterial({
      size: 0.11, vertexColors: true, transparent: true, opacity: 0.95,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    scene.add(points);
    integ = { renderer, scene, camera, controls, points, colors, pts,
      idx: 0, batch: 0, sum: 0, current: COEFF_ORDER[0], coeffs: {},
      playing: false, timer: null, lobe: null };
    resetIntegration();
  };
  rebuildIntegral = rebuild;

  (function loop() {
    requestAnimationFrame(loop);
    if (integ) { integ.controls.update(); integ.renderer.render(integ.scene, integ.camera); }
  })();

  rebuild();
  window.addEventListener("resize", () => {
    const w = canvas.clientWidth || 540, h = canvas.clientHeight || 400;
    if (!integ) return;
    integ.renderer.setSize(w, h, false);
    integ.camera.aspect = w / h; integ.camera.updateProjectionMatrix();
  });
}

function buildCGrid() {
  const g = $("cGrid");
  if (!g) return;
  g.innerHTML = "";
  const pairs = [];
  for (let l = 0; l <= 3; l++) for (let m = -l; m <= l; m++) pairs.push([l, m]);
  g.appendChild(document.createElement("div"));
  pairs.forEach(([l, m]) => {
    const h = document.createElement("div");
    h.className = "h"; h.textContent = `${l},${m}`; g.appendChild(h);
  });
  for (let n = 0; n < 4; n++) {
    const rl = document.createElement("div");
    rl.className = "rowlabel"; rl.textContent = `n=${n}`; g.appendChild(rl);
    pairs.forEach(([l, m]) => {
      const c = document.createElement("div");
      c.className = "cell"; c.id = `cell-${n}-${l}-${m}`;
      c.textContent = "·";
      c.style.cursor = "pointer";
      c.title = `click to jump to n=${n}, l=${l}, m=${m}`;
      c.onclick = () => {
        if (!integ) return;
        pauseInteg();
        const target = COEFF_ORDER.findIndex(co => co.n === n && co.l === l && co.m === m);
        if (target >= 0) { integ.idx = target; startCoeff(); }
      };
      g.appendChild(c);
    });
  }
}

function resetIntegration() {
  if (!integ) return;
  clearTimeout(integ.timer); integ.playing = false;
  removeLobe();
  integ.idx = 0; integ.batch = 0; integ.sum = 0; integ.coeffs = {};
  integ.current = COEFF_ORDER[0];
  const col = integ.colors.array;
  for (let i = 0; i < col.length; i++) col[i] = 0.09;
  integ.colors.needsUpdate = true;
  buildCGrid();
  startCoeff();
  updateIntegUI(0);
  $("intBar").style.width = "0%";
  updateIntegTotals();
}

function startCoeff() {
  const c = COEFF_ORDER[integ.idx];
  if (!c) { stopInteg(); return; }
  integ.current = c; integ.batch = 0; integ.sum = 0;
  const col = integ.colors.array;
  for (let i = 0; i < col.length; i++) col[i] = 0.09;
  integ.colors.needsUpdate = true;
  document.querySelectorAll(".cgrid .cell.cur").forEach((el) => el.classList.remove("cur"));
  const cell = $(`cell-${c.n}-${c.l}-${c.m}`);
  if (cell) cell.classList.add("cur");
  $("intCoeff").textContent = `n=${c.n}, l=${c.l}, m=${c.m}`;
  $("intSum").textContent = "0.000";
  $("intProgress").textContent = "0%";
  $("intBar").style.width = "0%";
  removeLobe();
  integ.lobe = makeLobeMesh(c.l, c.m, integCutoff);
  integ.scene.add(integ.lobe);
  integ.flashUntil = performance.now() + 650;
}

function stepIntegration() {
  if (!integ) return;
  const c = integ.current;
  const total = integ.pts.length;
  const batches = 24;
  const per = Math.ceil(total / batches);
  const start = integ.batch * per;
  const end = Math.min(total, start + per);
  const col = integ.colors.array;
  let scale = 0;
  for (let i = start; i < end; i++) {
    const p = integ.pts[i];
    const r = Math.hypot(p.x, p.y, p.z) || 1e-9;
    const ylm = realSH(c.l, c.m, p.x, p.y, p.z);
    const val = p.rho * integradial(c.n, r) * ylm;
    integ.sum += val * p.w;
    scale = Math.max(scale, Math.abs(val));
  }
  scale = scale || 1;
  for (let i = start; i < end; i++) {
    const p = integ.pts[i];
    const r = Math.hypot(p.x, p.y, p.z) || 1e-9;
    const val = p.rho * integradial(c.n, r) * realSH(c.l, c.m, p.x, p.y, p.z);
    const t = Math.min(1, Math.abs(val) / scale);
    if (val >= 0) { col[i * 3] = 1.0 * t; col[i * 3 + 1] = 0.22 * t; col[i * 3 + 2] = 0.35 * t; }
    else { col[i * 3] = 0.25 * t; col[i * 3 + 1] = 0.5 * t; col[i * 3 + 2] = 1.0 * t; }
  }
  integ.colors.needsUpdate = true;
  integ.batch++;
  const pct = Math.min(1, end / total);
  $("intBar").style.width = (pct * 100).toFixed(0) + "%";
  $("intProgress").textContent = (pct * 100).toFixed(0) + "%";
  $("intSum").textContent = Math.abs(integ.sum) < 0.01 ? integ.sum.toExponential(2) : integ.sum.toFixed(3);
  if (end >= total) {
    integ.coeffs[integKey(c.n, c.l, c.m)] = integ.sum;
    updateIntegTotals();
    const cell = $(`cell-${c.n}-${c.l}-${c.m}`);
    if (cell) {
      cell.textContent = Math.abs(integ.sum) < 0.01 ? integ.sum.toExponential(1) : integ.sum.toFixed(2);
      cell.classList.add("done");
      if (integ.sum < 0) cell.classList.add("neg");
      cell.classList.remove("cur");
    }
    integ.idx++;
    if (integ.idx < COEFF_ORDER.length) {
      if (integ.playing) integ.timer = setTimeout(() => { startCoeff(); integ.timer = setTimeout(playTick, 30); }, 60);
      else startCoeff();
    } else {
      stopInteg();
      $("intExplain").textContent = "All 64 coefficients filled. Each is one integral; the power spectrum is built from pairs of them.";
    }
  }
  updateIntegUI(pct);
}

function updateIntegTotals() {
  if (!integ) return;
  const vals = Object.values(integ.coeffs);
  const sumAbs = vals.reduce((a, v) => a + Math.abs(v), 0);
  const total = vals.reduce((a, v) => a + v, 0);
  const el = $("integTotals");
  if (el) el.innerHTML =
    `<span>coefficients: <b>${vals.length}/${COEFF_ORDER.length}</b></span>` +
    `<span>Σ c: <b>${total.toExponential(2)}</b></span>` +
    `<span>Σ |c|: <b>${sumAbs.toExponential(2)}</b></span>` +
    `<span>geometry: <b>${DATA.presets[integGeom].label}</b></span>` +
    `<span>cutoff: <b>${integCutoff.toFixed(1)} Å</b></span>` +
    `<span>rotation: <b>${integRot}°</b></span>`;
}

function updateIntegUI(pct) {
  const c = integ.current;
  $("intExplain").innerHTML = `Currently integrating <strong>n=${c.n}, l=${c.l}, m=${c.m}</strong>.
    Red samples add, blue samples subtract. The running sum is one <code>c<sub>nlm</sub></code> (arbitrary units).`;
}

function playTick() {
  if (!integ || !integ.playing) return;
  integ.timer = null;
  if (integ.lobe && performance.now() < integ.flashUntil) {
    integ.timer = setTimeout(playTick, 60);
    return;
  }
  removeLobe();
  stepIntegration();
  if (integ.playing && integ.idx < COEFF_ORDER.length && !integ.timer) {
    integ.timer = setTimeout(playTick, 45);
  }
}

function startInteg() {
  if (!integ) return;
  integ.playing = true; clearTimeout(integ.timer); integ.timer = setTimeout(playTick, 30);
}
function stopInteg() { if (integ) { integ.playing = false; clearTimeout(integ.timer); integ.timer = null; } }
function pauseInteg() { stopInteg(); }
function stepOneCoeff() {
  pauseInteg();
  if (!integ) return;
  removeLobe();
  const startIdx = integ.idx;
  while (integ && integ.idx === startIdx && integ.idx < COEFF_ORDER.length) {
    stepIntegration();
  }
}

function initIntegControls() {
  buildCGrid();

  // geometry selector for the integral widget
  const gbox = $("integGeomButtons");
  if (gbox) {
    gbox.innerHTML = "";
    Object.entries(DATA.presets).forEach(([key, pr]) => {
      const b = document.createElement("button");
      b.className = "pill";
      b.textContent = pr.label;
      b.setAttribute("aria-pressed", key === integGeom);
      b.onclick = () => {
        integGeom = key;
        [...gbox.children].forEach((x) => x.setAttribute("aria-pressed", x === b));
        pauseInteg();
        rebuildIntegral();
      };
      gbox.appendChild(b);
    });
  }
  const rot = $("integRot");
  if (rot) rot.oninput = () => {
    integRot = Number(rot.value);
    $("integRotVal").textContent = integRot + "°";
    pauseInteg();
    rebuildIntegral();
  };
  const cut = $("integCut");
  if (cut) cut.oninput = () => {
    integCutoff = Number(cut.value);
    $("integCutVal").textContent = integCutoff.toFixed(1) + " Å";
    pauseInteg();
    rebuildIntegral();
  };
  document.querySelectorAll("[data-sample]").forEach((b) => {
    b.onclick = () => {
      sampleMode = b.dataset.sample;
      document.querySelectorAll("[data-sample]").forEach((x) => x.setAttribute("aria-pressed", x === b));
      pauseInteg();
      rebuildIntegral();
    };
  });
  $("intPlay").onclick = () => { if (integ.idx >= COEFF_ORDER.length) resetIntegration(); startInteg(); };
  $("intPause").onclick = pauseInteg;
  $("intReset").onclick = () => { pauseInteg(); resetIntegration(); };
  $("intStep").onclick = stepOneCoeff;
}

/* ---------------- rotation invariance ---------------- */
// fallback asymmetric cluster used when DATA not yet loaded
const ROT_ATOMS_DEFAULT = [
  { x: 0, y: 0, z: 0 },
  { x: 1.35, y: 0.05, z: 0.0 },
  { x: -0.55, y: 1.15, z: 0.15 },
  { x: -0.55, y: -1.00, z: 0.35 },
  { x: 0.10, y: 0.15, z: 1.50 },
];
let rotPreset = "tetra"; // molecule used in the rotation demo

function getRotAtoms() {
  if (DATA && DATA.presets[rotPreset]) {
    return DATA.presets[rotPreset].atoms.map((a) => ({
      x: a.position[0], y: a.position[1], z: a.position[2],
    }));
  }
  return ROT_ATOMS_DEFAULT;
}

function densityAtoms(atoms, x, y, z, sig = sigma) {
  let rho = 0;
  const s2 = 2 * sig * sig;
  atoms.forEach((a) => {
    const dx = x - a.x, dy = y - a.y, dz = z - a.z;
    rho += Math.exp(-(dx * dx + dy * dy + dz * dz) / s2);
  });
  return rho;
}

function rotatedAtoms(deg) {
  const t = deg * Math.PI / 180;
  return getRotAtoms().map((a) => ({
    x: a.x * Math.cos(t) - a.y * Math.sin(t),
    y: a.x * Math.sin(t) + a.y * Math.cos(t),
    z: a.z,
  }));
}

function toyC(deg, n, l, m) {
  const atoms = rotatedAtoms(deg);
  const N = 14, R = cutoff;
  const dV = Math.pow(2 * R / (N - 1), 3);
  let sum = 0;
  for (let i = 0; i < N; i++) {
    const x = -R + 2 * R * i / (N - 1);
    for (let j = 0; j < N; j++) {
      const y = -R + 2 * R * j / (N - 1);
      for (let k = 0; k < N; k++) {
        const z = -R + 2 * R * k / (N - 1);
        const rho = densityAtoms(atoms, x, y, z);
        if (rho < 1e-6) continue;
        const r = Math.hypot(x, y, z) || 1e-9;
        sum += rho * integradial(n, r) * realSH(l, m, x, y, z) * dV;
      }
    }
  }
  return sum;
}

function pFromC(deg, l) {
  let p = 0;
  for (let m = -l; m <= l; m++) {
    const c = toyC(deg, 0, l, m);
    p += c * c;
  }
  return p;
}

function drawRotation() {
  const angle = Number($("rotAngle").value);
  $("rotAngleVal").textContent = angle + "°";
  const rows = [];
  for (let l = 1; l <= 2; l++) {
    for (let m = -l; m <= l; m++) {
      const c0 = toyC(0, 0, l, m);
      const c1 = toyC(angle, 0, l, m);
      rows.push({ label: `c(0,${l},${m})`, a: c0, b: c1, d: c1 - c0 });
    }
  }
  let dc = 0, dp = 0, c0sum = 0, p0sum = 0;
  const ps = [];
  for (let l = 0; l <= 2; l++) {
    const p0 = pFromC(0, l), p1 = pFromC(angle, l);
    ps.push({ label: `p(0,0,${l})`, a: p0, b: p1, d: p1 - p0 });
    dp += Math.abs(p1 - p0); p0sum += Math.abs(p0);
  }
  rows.forEach((r) => { dc += Math.abs(r.d); c0sum += Math.abs(r.a); });
  const tbody = $("rotTable").querySelector("tbody");
  tbody.innerHTML = rows.map((r) => `<tr><td>${r.label}</td><td>${r.a.toFixed(3)}</td><td>${r.b.toFixed(3)}</td><td>${r.d.toFixed(3)}</td></tr>`).join("") +
    ps.map((r) => `<tr><td><strong>${r.label}</strong></td><td>${r.a.toFixed(3)}</td><td>${r.b.toFixed(3)}</td><td>${r.d.toExponential(1)}</td></tr>`).join("");
  $("rotCChange").textContent = (100 * dc / (c0sum || 1)).toFixed(1) + "%";
  $("rotPChange").textContent = (100 * dp / (p0sum || 1)).toFixed(2) + "%";
}

let rotScene3d = null;

function initRotScene() {
  const canvas = $("rotScene");
  if (!canvas) return;
  const ren = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  ren.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  ren.setSize(canvas.clientWidth || 540, canvas.clientHeight || 340, false);
  const sc = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(38, (canvas.clientWidth||540)/(canvas.clientHeight||340), 0.1, 30);
  cam.position.set(3.0, 2.5, 4.0);
  const ctrl = new OrbitControls(cam, canvas);
  ctrl.enableDamping = true;
  sc.add(new THREE.AmbientLight(0xffffff, 0.8));
  sc.add(new THREE.DirectionalLight(0xffffff, 0.6));

  const grp = new THREE.Group();
  sc.add(grp);
  rotScene3d = { ren, sc, cam, ctrl, grp };

  buildRotAtoms(0);

  (function loop() {
    requestAnimationFrame(loop);
    if (rotScene3d) { rotScene3d.ctrl.update(); rotScene3d.ren.render(rotScene3d.sc, rotScene3d.cam); }
  })();
  window.addEventListener("resize", () => {
    if (!rotScene3d) return;
    const w = canvas.clientWidth || 540, h = canvas.clientHeight || 340;
    rotScene3d.ren.setSize(w, h, false);
    rotScene3d.cam.aspect = w / h; rotScene3d.cam.updateProjectionMatrix();
  });
}

function buildRotAtoms(deg) {
  if (!rotScene3d) return;
  const grp = rotScene3d.grp;
  clearGroup(grp);
  const atoms = rotatedAtoms(deg);
  const neighborColors = [0x5a6cff, 0x63e6a4, 0xe8a05a, 0xd45aff];

  // central atom
  grp.add(new THREE.Mesh(
    new THREE.SphereGeometry(0.38, 28, 20),
    new THREE.MeshStandardMaterial({ color: 0x1a1420, roughness: 0.35, metalness: 0.2, emissive: 0x2a0b12 })
  ));

  // neighbors + bonds
  const bondPts = [];
  atoms.slice(1).forEach((a, i) => {
    const col = neighborColors[i % neighborColors.length];
    const s = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 24, 16),
      new THREE.MeshStandardMaterial({ color: col, roughness: 0.4, metalness: 0.1 })
    );
    s.position.set(a.x, a.y, a.z);
    grp.add(s);
    bondPts.push(0, 0, 0, a.x, a.y, a.z);
  });
  const bondGeo = new THREE.BufferGeometry();
  bondGeo.setAttribute("position", new THREE.Float32BufferAttribute(bondPts, 3));
  grp.add(new THREE.LineSegments(bondGeo, new THREE.LineBasicMaterial({ color: 0x6e5f6e, transparent: true, opacity: 0.55 })));

  // z-axis indicator
  const zMat = new THREE.LineBasicMaterial({ color: 0x45d6ff, transparent: true, opacity: 0.3 });
  const zGeo = new THREE.BufferGeometry();
  zGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, -2.5, 0, 0, 2.5], 3));
  grp.add(new THREE.LineSegments(zGeo, zMat));
}

function initRotation() {
  initRotScene();

  // build preset buttons for the rotation demo
  const rotPB = $("rotPresetButtons");
  if (rotPB && DATA) {
    Object.entries(DATA.presets).forEach(([key, p]) => {
      const b = document.createElement("button");
      b.className = "pill";
      b.textContent = p.label;
      b.setAttribute("aria-pressed", key === rotPreset);
      b.onclick = () => {
        rotPreset = key;
        [...rotPB.children].forEach((x) => x.setAttribute("aria-pressed", x === b));
        buildRotAtoms(Number($("rotAngle").value));
        drawRotation();
      };
      rotPB.appendChild(b);
    });
  }

  $("rotAngle").oninput = () => {
    buildRotAtoms(Number($("rotAngle").value));
    drawRotation();
  };
  drawRotation();
}

/* ---------------- spectrum 3D scene (shows current preset geometry) ---- */
let specScene3d = null;

function initSpectrumPresets() {
  const spPB = $("specPresetButtons");
  if (!spPB || !DATA) return;
  spPB.innerHTML = "";
  Object.entries(DATA.presets).forEach(([key, p]) => {
    const b = document.createElement("button");
    b.className = "pill";
    b.textContent = p.label;
    b.setAttribute("aria-pressed", key === preset);
    b.onclick = () => {
      preset = key;
      // sync global section-1 preset buttons too
      document.querySelectorAll("#presetControls button").forEach((x) => {
        x.setAttribute("aria-pressed", x.textContent === p.label);
      });
      [...spPB.children].forEach((x) => x.setAttribute("aria-pressed", x === b));
      buildScene();
      buildSpecAtoms();
      renderHeatmap();
    };
    spPB.appendChild(b);
  });
}

function initSpectrumScene() {
  const canvas = $("spectrumScene");
  if (!canvas) return;
  const ren = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  ren.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  ren.setSize(canvas.clientWidth || 540, canvas.clientHeight || 260, false);
  const sc = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(38, (canvas.clientWidth||540)/(canvas.clientHeight||260), 0.1, 30);
  cam.position.set(3.0, 2.0, 4.0);
  const ctrl = new OrbitControls(cam, canvas);
  ctrl.enableDamping = true;
  ctrl.autoRotate = true;
  ctrl.autoRotateSpeed = 0.8;
  sc.add(new THREE.AmbientLight(0xffffff, 0.8));
  sc.add(new THREE.DirectionalLight(0xffffff, 0.6));

  const grp = new THREE.Group();
  sc.add(grp);
  specScene3d = { ren, sc, cam, ctrl, grp };

  buildSpecAtoms();

  (function loop() {
    requestAnimationFrame(loop);
    if (specScene3d) { specScene3d.ctrl.update(); specScene3d.ren.render(specScene3d.sc, specScene3d.cam); }
  })();
  window.addEventListener("resize", () => {
    if (!specScene3d) return;
    const w = canvas.clientWidth || 540, h = canvas.clientHeight || 260;
    specScene3d.ren.setSize(w, h, false);
    specScene3d.cam.aspect = w / h; specScene3d.cam.updateProjectionMatrix();
  });
}

function buildSpecAtoms() {
  if (!specScene3d || !DATA) return;
  const grp = specScene3d.grp;
  clearGroup(grp);
  const p = DATA.presets[preset];
  if (!p) return;
  const atoms = p.atoms;

  // populate atom list for section 7
  const listEl = document.getElementById("specAtomList");
  if (listEl) {
    listEl.innerHTML = atoms.map((a, i) => {
      const role = i === 0 ? " (central)" : "";
      const col = COLORS[a.symbol] || "#ffffff";
      return `<span><b style="color:${col}">${a.symbol}${role}</b> [${a.position.map(v => v.toFixed(2)).join(", ")}]</span>`;
    }).join("");
  }

  // central atom
  grp.add(new THREE.Mesh(
    new THREE.SphereGeometry(0.38, 28, 20),
    new THREE.MeshStandardMaterial({ color: 0x1a1420, roughness: 0.35, metalness: 0.2, emissive: 0x2a0b12 })
  ));

  // neighbors + bonds
  const bondPts = [];
  atoms.slice(1).forEach((a) => {
    const [x, y, z] = a.position;
    const col = new THREE.Color(COLORS[a.symbol] || "#ffffff");
    const s = new THREE.Mesh(
      new THREE.SphereGeometry(a.symbol === "H" ? 0.24 : 0.32, 24, 16),
      new THREE.MeshStandardMaterial({ color: col, roughness: 0.4, metalness: 0.1 })
    );
    s.position.set(x, y, z);
    grp.add(s);
    bondPts.push(0, 0, 0, x, y, z);
  });
  const bondGeo = new THREE.BufferGeometry();
  bondGeo.setAttribute("position", new THREE.Float32BufferAttribute(bondPts, 3));
  grp.add(new THREE.LineSegments(bondGeo, new THREE.LineBasicMaterial({ color: 0x6e5f6e, transparent: true, opacity: 0.55 })));

  // cutoff sphere wireframe
  grp.add(new THREE.Mesh(
    new THREE.SphereGeometry(cutoff, 32, 20),
    new THREE.MeshBasicMaterial({ color: 0x45d6ff, wireframe: true, transparent: true, opacity: 0.03 })
  ));
}

/* ---------------- mu1nu1 compression explorer ---------------- */
const COMP_SCHEMES = {
  off:      { label: "uncompressed", len: (S) => (S*4)*(S*4+1)/2*5, blocks: (S) => S*(S+1)/2*16,
              note: (S,n) => `The upper triangle of a ${S*4}×${S*4} channel grid — every species pair (Z₁,Z₂) with Z₂ ≥ Z₁ is its own block. Length grows like S².` },
  mu1nu1:   { label: "mu1nu1 (Darby)", len: (S) => 16*S*5, blocks: (S) => S*16,
              note: (S,n) => `One full n×n′ block per species Z₁; the second factor sums over all species (Σ_z). Species identity survives on one side only — between "off" and "mu2". Length grows like S.` },
  crossover:{ label: "crossover", len: (S) => S*10*5, blocks: (S) => S*10,
              note: (S,n) => `Each species keeps its own upper-triangle block, but cross-species (Z₁≠Z₂) information is dropped entirely. Linear in S.` },
  mu2:      { label: "mu2", len: () => 10*5, blocks: () => 10,
              note: (S,n) => `Species labels removed completely: one element-agnostic upper triangle. Constant length regardless of S — the most compressed, least element-specific.` },
};
let compMode = "off";

function compCounts(S) {
  return {
    off: (S*4)*(S*4+1)/2*5,
    mu1nu1: 16*S*5,
    crossover: S*10*5,
    mu2: 10*5,
  };
}

function drawCompBlocks() {
  const cv = $("compBlocksCanvas");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0d090d";
  ctx.fillRect(0, 0, W, H);
  const S = Number($("compSpecies").value);
  const scheme = COMP_SCHEMES[compMode];
  const nmax = 4;

  const SP_COLORS = ["#ff3d5a","#5a6cff","#45d6ff","#63e6a4","#e8a05a","#d45aff","#ffdd55","#a0e060","#ff8fb0","#80d8ff","#b0ff80","#ffb060"];
  const SP_LABELS = ["A","B","C","D","E","F","G","H","I","J","K","L"];

  /* ── LEFT: S×S species-pair matrix ── */
  const matPad = { l: 50, t: 50, r: 20 };
  const matW = Math.min(H - 80, (W * 0.42) - matPad.l - matPad.r);
  const cellSz = Math.floor(matW / Math.max(S, 1));
  const gridW = cellSz * S;
  const gx0 = matPad.l;
  const gy0 = matPad.t;

  // title
  ctx.fillStyle = "#6e5f6e";
  ctx.font = "11px Inter, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Species-pair blocks (Z₁, Z₂)", gx0, gy0 - 16);

  // axis labels
  ctx.fillStyle = "#a79ba6";
  ctx.font = "10px Inter, sans-serif";
  ctx.textAlign = "center";
  for (let i = 0; i < S; i++) {
    ctx.fillStyle = SP_COLORS[i % SP_COLORS.length];
    ctx.fillText(SP_LABELS[i], gx0 + i * cellSz + cellSz/2, gy0 - 4);
    ctx.save(); ctx.translate(gx0 - 8, gy0 + i * cellSz + cellSz/2);
    ctx.fillText(SP_LABELS[i], 0, 4);
    ctx.restore();
  }
  ctx.fillStyle = "#6e5f6e"; ctx.textAlign = "center";
  ctx.fillText("Z₂", gx0 + gridW/2, gy0 - 28);
  ctx.save(); ctx.translate(gx0 - 28, gy0 + gridW/2); ctx.rotate(-Math.PI/2);
  ctx.fillText("Z₁", 0, 0); ctx.restore();

  // draw cells
  for (let r = 0; r < S; r++) {
    for (let c = 0; c < S; c++) {
      const x = gx0 + c * cellSz;
      const y = gy0 + r * cellSz;

      // determine cell state for current compression mode
      let active = false, merged = false, dropped = false, label = "";
      if (compMode === "off") {
        // upper triangle: c >= r
        active = c >= r;
        dropped = c < r;
        label = SP_LABELS[r] + SP_LABELS[c];
      } else if (compMode === "mu1nu1") {
        // each row r is kept, but all columns merge into one "Σ_z" block per row
        active = true;
        merged = c !== r; // off-diagonal cells are merged INTO the diagonal
        label = c === r ? SP_LABELS[r] + "·Σ" : "";
      } else if (compMode === "crossover") {
        // only diagonal blocks survive
        active = c === r;
        dropped = c !== r;
        label = c === r ? SP_LABELS[r] + SP_LABELS[r] : "";
      } else { // mu2
        // everything collapses to one block
        active = true;
        merged = !(r === 0 && c === 0);
        label = (r === 0 && c === 0) ? "Σ·Σ" : "";
      }

      const gap = 2;
      if (dropped) {
        // dropped cell: dim outline with × pattern
        ctx.strokeStyle = "rgba(214,160,180,.08)";
        ctx.lineWidth = 1;
        roundRect(ctx, x+gap, y+gap, cellSz-2*gap, cellSz-2*gap, 3);
        ctx.stroke();
        // small × in center
        if (cellSz > 20) {
          ctx.strokeStyle = "rgba(255,61,90,.25)";
          ctx.lineWidth = 1;
          const cx = x + cellSz/2, cy = y + cellSz/2, d = Math.min(cellSz*0.15, 6);
          ctx.beginPath(); ctx.moveTo(cx-d, cy-d); ctx.lineTo(cx+d, cy+d); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cx+d, cy-d); ctx.lineTo(cx-d, cy+d); ctx.stroke();
        }
      } else if (merged) {
        // merged cell: dashed outline, arrow toward merge target
        const rowCol = SP_COLORS[r % SP_COLORS.length];
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = rowCol;
        roundRect(ctx, x+gap, y+gap, cellSz-2*gap, cellSz-2*gap, 3);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = rowCol;
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1;
        roundRect(ctx, x+gap, y+gap, cellSz-2*gap, cellSz-2*gap, 3);
        ctx.stroke();
        ctx.setLineDash([]);
        // arrow pointing toward diagonal
        if (cellSz > 22) {
          const cx = x + cellSz/2, cy = y + cellSz/2;
          let tx, ty;
          if (compMode === "mu1nu1") {
            tx = gx0 + r * cellSz + cellSz/2; ty = gy0 + r * cellSz + cellSz/2;
          } else {
            tx = gx0 + cellSz/2; ty = gy0 + cellSz/2; // mu2: merge to (0,0)
          }
          const dx = tx - cx, dy = ty - cy;
          const dist = Math.hypot(dx, dy) || 1;
          const ax = dx / dist * Math.min(cellSz*0.28, 10);
          const ay = dy / dist * Math.min(cellSz*0.28, 10);
          ctx.strokeStyle = rowCol;
          ctx.globalAlpha = 0.5;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + ax, cy + ay); ctx.stroke();
          // arrowhead
          const headLen = 4;
          const angle = Math.atan2(ay, ax);
          ctx.beginPath();
          ctx.moveTo(cx+ax, cy+ay);
          ctx.lineTo(cx+ax-headLen*Math.cos(angle-0.5), cy+ay-headLen*Math.sin(angle-0.5));
          ctx.moveTo(cx+ax, cy+ay);
          ctx.lineTo(cx+ax-headLen*Math.cos(angle+0.5), cy+ay-headLen*Math.sin(angle+0.5));
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      } else {
        // active cell: filled block
        const col = (compMode === "mu2") ? "#a79ba6" : SP_COLORS[r % SP_COLORS.length];
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = col;
        roundRect(ctx, x+gap, y+gap, cellSz-2*gap, cellSz-2*gap, 4);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5;
        roundRect(ctx, x+gap, y+gap, cellSz-2*gap, cellSz-2*gap, 4);
        ctx.stroke();
        // label
        if (cellSz > 28 && label) {
          ctx.fillStyle = "#eee9ee";
          ctx.font = cellSz > 40 ? "bold 11px 'Space Grotesk',sans-serif" : "bold 9px 'Space Grotesk',sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(label, x + cellSz/2, y + cellSz/2 + 4);
        }
      }
    }
  }

  /* ── RIGHT: comparison bars ── */
  const barX0 = gx0 + gridW + 60;
  const barW = W - barX0 - 30;
  const c2 = compCounts(S);
  const names = [["off","uncompressed"],["mu1nu1","mu1nu1"],["crossover","crossover"],["mu2","mu2"]];
  const maxLen = Math.max(...Object.values(c2));
  const barH = 22;
  const barGap = 10;
  const barTop = gy0 + 10;

  ctx.fillStyle = "#6e5f6e";
  ctx.font = "11px Inter, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Descriptor length at S = " + S, barX0, barTop - 14);

  names.forEach(([k, lbl], i) => {
    const y = barTop + i * (barH + barGap);
    const w = Math.max(2, (c2[k] / maxLen) * barW);
    const active = k === compMode;

    ctx.fillStyle = active ? "rgba(255,61,90,.75)" : "rgba(90,108,255,.35)";
    roundRect(ctx, barX0, y, w, barH, 4);
    ctx.fill();
    if (active) {
      ctx.strokeStyle = "#ff3d5a"; ctx.lineWidth = 1;
      roundRect(ctx, barX0, y, w, barH, 4);
      ctx.stroke();
    }

    // label left side
    ctx.fillStyle = active ? "#eee9ee" : "#a79ba6";
    ctx.font = active ? "bold 11px 'Space Grotesk',sans-serif" : "11px Inter,sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(lbl, barX0 + w + 8, y + barH/2 + 4);

    // value
    ctx.fillStyle = active ? "#ff3d5a" : "#6e5f6e";
    ctx.textAlign = "right";
    ctx.font = "bold 11px 'Space Grotesk',sans-serif";
    const valStr = c2[k].toLocaleString();
    ctx.fillText(valStr, barX0 + Math.max(w - 6, barW * 0.6), y + barH/2 + 4);
  });

  // scaling annotation
  const scaleY = barTop + names.length * (barH + barGap) + 14;
  ctx.fillStyle = "#6e5f6e";
  ctx.font = "10px Inter,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Scaling: off ~ S²  ·  mu1nu1 ~ S  ·  crossover ~ S  ·  mu2 ~ 1", barX0, scaleY);

  /* ── LEGEND at bottom ── */
  const legY = Math.max(gy0 + gridW + 26, scaleY + 30);
  const legItems = [];
  if (compMode === "off") {
    legItems.push(["rgba(255,61,90,.55)", "kept (upper triangle)"],
                   ["transparent", "redundant (lower triangle, same pair reversed)"]);
  } else if (compMode === "mu1nu1") {
    legItems.push(["rgba(255,61,90,.55)", "result block (Z₁·Σ_z)"],
                   ["rgba(255,61,90,.15)", "merged into row diagonal (dashed = summed over)"]);
  } else if (compMode === "crossover") {
    legItems.push(["rgba(255,61,90,.55)", "kept (diagonal only, Z₁=Z₂)"],
                   ["transparent", "dropped (cross-species, marked ×)"]);
  } else {
    legItems.push(["rgba(167,155,166,.55)", "single merged block (Σ·Σ)"],
                   ["rgba(167,155,166,.15)", "merged in (dashed = summed)"]);
  }
  legItems.forEach(([col, txt], i) => {
    const lx = gx0 + i * 320;
    ctx.fillStyle = col || "transparent";
    ctx.strokeStyle = col === "transparent" ? "rgba(214,160,180,.15)" : (col || "rgba(214,160,180,.15)");
    ctx.lineWidth = 1;
    if (col === "transparent") { ctx.setLineDash([]); }
    roundRect(ctx, lx, legY, 14, 14, 3);
    if (col !== "transparent") ctx.fill();
    ctx.stroke();
    if (col === "transparent") {
      // × inside
      ctx.strokeStyle = "rgba(255,61,90,.35)";
      ctx.beginPath(); ctx.moveTo(lx+4, legY+4); ctx.lineTo(lx+10, legY+10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(lx+10, legY+4); ctx.lineTo(lx+4, legY+10); ctx.stroke();
    }
    ctx.fillStyle = "#a79ba6";
    ctx.font = "10px Inter,sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(txt, lx + 20, legY + 11);
  });

  $("compLen").textContent = scheme.len(S).toLocaleString();
  $("compBlocks").textContent = compMode === "off" ? S*(S+1)/2 : (compMode === "mu2" ? 1 : S);
  $("compMode").textContent = scheme.label;
  $("compNote").innerHTML = "<strong>" + scheme.label + ":</strong> " + scheme.note(S, nmax)
    + ` <em>Real dscribe anchors at S=3:</em> off 390 · mu1nu1 240 · crossover 150 · mu2 50.`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const COMP_MODE_DESCRIPTIONS = {
  off: `<strong>Uncompressed (off):</strong> the full power spectrum stores every
    species-pair block p<sup>Z₁Z₂</sup><sub>nn′l</sub>. With S species and
    n<sub>max</sub> radial functions, there are S·n<sub>max</sub> species-resolved
    channels. The descriptor stores upper-triangle pairs of all of them:
    length = S·n<sub>max</sub>·(S·n<sub>max</sub>+1)/2 · (l<sub>max</sub>+1).
    This grows <strong>quadratically</strong> with S.
    For 3 species (C, H, O) this gives <strong>390 values</strong>.`,

  mu1nu1: `<strong>mu1nu1 (Darby et al.):</strong> replaces the second species
    factor with a sum over all species:
    p<sup>Z₁</sup><sub>nn′l</sub> = Σ<sub>m</sub> c<sup>Z₁</sup><sub>nlm</sub> ·
    (Σ<sub>z</sub> c<sup>z</sup><sub>n′lm</sub>).
    One species index survives, the pair structure collapses, and the length scales
    <strong>linearly</strong> with S: length = n<sub>max</sub>² · S · (l<sub>max</sub>+1).
    For 3 species this gives <strong>240 values</strong>. This is the default
    compression in dscribe (<code>compression={"mode":"mu1nu1"}</code>).`,

  crossover: `<strong>Crossover:</strong> keeps only same-species diagonal blocks
    p<sup>ZZ</sup><sub>nn′l</sub> and drops all cross-species terms (Z₁ ≠ Z₂).
    Loses inter-species correlations but stays <strong>linear</strong> in S:
    length = n<sub>max</sub>·(n<sub>max</sub>+1)/2 · S · (l<sub>max</sub>+1).
    For 3 species this gives <strong>150 values</strong>.`,

  mu2: `<strong>mu2:</strong> both species indices are summed away:
    p<sub>nn′l</sub> = Σ<sub>m</sub> (Σ<sub>z</sub> c<sup>z</sup><sub>nlm</sub>) ·
    (Σ<sub>z′</sub> c<sup>z′</sup><sub>n′lm</sub>).
    The result is completely species-agnostic: one upper-triangle block of
    length = n<sub>max</sub>·(n<sub>max</sub>+1)/2 · (l<sub>max</sub>+1),
    <strong>constant</strong> regardless of how many elements are present.
    For any number of species this gives just <strong>50 values</strong>.`,
};

function updateCompModeDesc() {
  const el = $("compModeDesc");
  if (!el) return;
  const html = COMP_MODE_DESCRIPTIONS[compMode] || "";
  el.innerHTML = html;
  // style amber for "when to use" note if mu2
  el.className = "callout";
}

function initCompressionExplorer() {
  const slider = $("compSpecies");
  if (!slider) return;
  const modes = $("compModes");
  Object.entries(COMP_SCHEMES).forEach(([k, v]) => {
    const b = document.createElement("button");
    b.className = "pill";
    b.textContent = v.label;
    b.setAttribute("aria-pressed", k === compMode);
    b.onclick = () => {
      compMode = k;
      [...modes.children].forEach((x) => x.setAttribute("aria-pressed", x === b));
      drawCompBlocks();
      updateCompModeDesc();
    };
    modes.appendChild(b);
  });
  slider.oninput = () => {
    $("compSpeciesVal").textContent = slider.value;
    drawCompBlocks();
  };
  drawCompBlocks();
  updateCompModeDesc();
}

/* ============================================================
   RADIAL BASIS VISUALISER
   ============================================================ */
function initRadialBasis() {
  const canvas = $("rbasisCanvas");
  if (!canvas) return;
  const sliderCut = $("rbCutoff");
  const sliderN   = $("rbNmax");
  if (!sliderCut || !sliderN) return;

  const PALETTE = ["#ff3d5a","#5a6cff","#45d6ff","#63e6a4","#e8a05a","#d45aff","#ffdd55","#a0e060"];

  function draw() {
    const rc   = parseFloat(sliderCut.value);
    const nmax = parseInt(sliderN.value);
    $("rbCutoffVal").textContent = rc.toFixed(1) + " Å";
    $("rbNmaxVal").textContent   = nmax;

    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const pad = { l: 48, r: 20, t: 20, b: 36 };
    const pW = W - pad.l - pad.r, pH = H - pad.t - pad.b;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0d090d";
    ctx.fillRect(0, 0, W, H);

    // axes
    ctx.strokeStyle = "rgba(214,160,180,.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, pad.t + pH);
    ctx.lineTo(pad.l + pW, pad.t + pH);
    ctx.stroke();

    ctx.fillStyle = "#6e5f6e";
    ctx.font = "11px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("r (Å)", pad.l + pW / 2, H - 4);
    ctx.save(); ctx.translate(12, pad.t + pH / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText("g_n(r)", 0, 0); ctx.restore();

    // tick marks on r axis
    for (let r = 0; r <= rc; r += (rc <= 4 ? 1 : 2)) {
      const x = pad.l + (r / rc) * pW;
      ctx.fillStyle = "#6e5f6e";
      ctx.textAlign = "center";
      ctx.fillText(r.toFixed(0), x, pad.t + pH + 14);
      ctx.strokeStyle = "rgba(214,160,180,.1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + pH);
      ctx.stroke();
    }

    // cutoff line
    ctx.strokeStyle = "rgba(255,61,90,.35)";
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.l + pW, pad.t); ctx.lineTo(pad.l + pW, pad.t + pH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#ff3d5a"; ctx.font = "10px Inter,sans-serif"; ctx.textAlign = "right";
    ctx.fillText("r_c = " + rc.toFixed(1) + " Å", pad.l + pW - 4, pad.t + 14);

    // draw basis functions
    const steps = 320;
    const sig = rc / (nmax + 1) * 0.75;

    for (let n = 0; n < nmax; n++) {
      const rn = rc * (n + 1) / (nmax + 1);
      const col = PALETTE[n % PALETTE.length];
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      let first = true;
      for (let s = 0; s <= steps; s++) {
        const r = (s / steps) * rc;
        const val = Math.exp(-Math.pow(r - rn, 2) / (2 * sig * sig));
        const x = pad.l + (r / rc) * pW;
        const y = pad.t + pH - val * pH * 0.88;
        if (first) { ctx.moveTo(x, y); first = false; }
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // label at peak
      const px = pad.l + (rn / rc) * pW;
      const py = pad.t + pH - 0.88 * pH - 10;
      ctx.fillStyle = col;
      ctx.font = "bold 11px 'Space Grotesk', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("g" + n, px, Math.max(py, pad.t + 14));
    }
  }

  sliderCut.oninput = draw;
  sliderN.oninput   = draw;
  draw();
}

/* ============================================================
   SPECIES RESOLUTION VISUALISER
   ============================================================ */
function initSpeciesResolution() {
  const canvas = $("speciesCanvas");
  if (!canvas) return;
  const slider = $("speciesDemo");
  if (!slider) return;

  const SP_COLORS = ["#ff3d5a","#5a6cff","#45d6ff","#63e6a4","#e8a05a"];
  const SP_LABELS = ["A","B","C","D","E"];

  function draw() {
    const S   = parseInt(slider.value);
    $("speciesDemoVal").textContent = S;
    const nblocks = S * (S + 1) / 2;
    if ($("spNdensity")) $("spNdensity").textContent = S;
    if ($("spNblocks"))  $("spNblocks").textContent  = nblocks;

    const ctx  = canvas.getContext("2d");
    const W    = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0d090d";
    ctx.fillRect(0, 0, W, H);

    // --- TOP HALF: density fields ---
    const topH = H * 0.42;
    const pad  = 20;
    const nmax = 4;

    // label
    ctx.fillStyle = "#6e5f6e";
    ctx.font = "10px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("ρ_Z(r) — one density field per species", pad, 16);

    const slotW = (W - 2 * pad) / S;
    for (let s = 0; s < S; s++) {
      const col  = SP_COLORS[s % SP_COLORS.length];
      const lbl  = SP_LABELS[s % SP_LABELS.length];
      const cx   = pad + slotW * s + slotW / 2;
      const cy   = topH / 2 + 10;

      // Gaussian blob
      const steps = 60, r0 = slotW * 0.28;
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const th = (i / steps) * Math.PI * 2;
        const rr = r0 * (0.7 + 0.3 * Math.abs(Math.sin(th * 2)));
        const x = cx + rr * Math.cos(th);
        const y = cy + rr * Math.sin(th) * 0.65;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = col.replace(")", ", 0.18)").replace("rgb", "rgba").replace("#", "");
      // simpler: just fill with low-alpha colour
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = col;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // atom dot
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();

      // label
      ctx.fillStyle = col;
      ctx.font = "bold 13px 'Space Grotesk', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("ρ_" + lbl, cx, topH - 10);

      // channel count
      ctx.fillStyle = "#6e5f6e";
      ctx.font = "10px Inter, sans-serif";
      ctx.fillText(nmax + " channels", cx, topH - 1);
    }

    // separator
    ctx.strokeStyle = "rgba(214,160,180,.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, topH + 6); ctx.lineTo(W - pad, topH + 6);
    ctx.stroke();

    // --- BOTTOM HALF: block grid ---
    const botY   = topH + 20;
    const botH   = H - botY - 24;

    ctx.fillStyle = "#6e5f6e";
    ctx.font = "10px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Power-spectrum blocks p^{Z1,Z2}_{nn'l} (" + nblocks + " blocks · " + nblocks + "×n_max²×(l_max+1) values)", pad, botY - 4);

    // block grid — upper triangle only
    const maxCells  = S;
    const cellPad   = 4;
    const availW    = W - 2 * pad;
    const cellSize  = Math.min(Math.floor((availW - cellPad * (S - 1)) / S), Math.floor((botH - cellPad * (S - 1)) / S));
    const gridW     = S * cellSize + (S - 1) * cellPad;
    const gridH     = S * cellSize + (S - 1) * cellPad;
    const gx0       = pad + (availW - gridW) / 2;
    const gy0       = botY + (botH - gridH) / 2;

    for (let r = 0; r < S; r++) {
      for (let c = 0; c < S; c++) {
        const x = gx0 + c * (cellSize + cellPad);
        const y = gy0 + r * (cellSize + cellPad);
        if (c < r) {
          // below diagonal — empty
          ctx.strokeStyle = "rgba(214,160,180,.07)";
          ctx.lineWidth = 1;
          roundRect(ctx, x, y, cellSize, cellSize, 4);
          ctx.stroke();
          continue;
        }
        // upper triangle — filled block
        const c1 = SP_COLORS[r % SP_COLORS.length];
        const c2 = SP_COLORS[c % SP_COLORS.length];
        ctx.globalAlpha = 0.22;
        ctx.fillStyle   = c === r ? c1 : "#a79ba6";
        roundRect(ctx, x, y, cellSize, cellSize, 5);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = c === r ? c1 : "rgba(167,155,166,.4)";
        ctx.lineWidth   = 1.5;
        roundRect(ctx, x, y, cellSize, cellSize, 5);
        ctx.stroke();

        // pair label
        const lA = SP_LABELS[r % SP_LABELS.length];
        const lB = SP_LABELS[c % SP_LABELS.length];
        ctx.fillStyle = "#a79ba6";
        ctx.font = cellSize > 36 ? "bold 11px 'Space Grotesk',sans-serif" : "bold 9px 'Space Grotesk',sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(lA + lB, x + cellSize / 2, y + cellSize / 2 + 4);
      }
    }

    // axis labels
    ctx.fillStyle = "#6e5f6e";
    ctx.font = "10px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Z₂ (second species)", gx0 + gridW / 2, gy0 + gridH + 16);
    ctx.save();
    ctx.translate(gx0 - 14, gy0 + gridH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Z₁ (first species)", 0, 0);
    ctx.restore();
  }

  slider.oninput = draw;
  draw();
}
