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
let autoRotate = false;

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
    new THREE.MeshBasicMaterial({ color: 0x45d6ff, wireframe: true, transparent: true, opacity: 0.07 })
  );
  cutoffMesh.visible = showCutoff;
  root.add(cutoffMesh);

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
  const map = new Map();
  values.forEach((v, i) => {
    const L = labels[i];
    let key, rowLabel;
    if (mode === "off") {
      const a = L.a_n, b = L.b_n;
      if (a > b) return;
      key = `${a}-${b}-${L.l}`;
      rowLabel = `n=${a}, n′=${b}`;
    } else {
      key = `${L.n}-${L.n2}-${L.l}`;
      rowLabel = `n=${L.n}, n′=${L.n2}`;
    }
    const cur = map.get(key) || { v: 0, row: rowLabel, l: L.l, n: L.n, n2: L.n2 };
    cur.v += v;
    map.set(key, cur);
  });

  const rows = [...new Set([...map.values()].map((d) => d.row))];
  const cols = DATA.meta.cutoffs ? [0, 1, 2, 3, 4] : [0, 1, 2, 3, 4];
  const max = Math.max(...[...map.values()].map((d) => d.v));
  const canvas = $("heatmap");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const left = 100, top = 34, cellW = (W - left - 24) / cols.length, cellH = (H - top - 42) / rows.length;

  ctx.font = "12px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#6e5f6e";
  cols.forEach((l, j) => ctx.fillText("l=" + l, left + cellW * (j + 0.5), top - 12));
  ctx.textAlign = "right";
  rows.forEach((r, i) => ctx.fillText(r, left - 10, top + cellH * (i + 0.5) + 4));

  rows.forEach((r, i) => {
    cols.forEach((l, j) => {
      const d = [...map.values()].find((x) => x.row === r && x.l === l);
      const v = d ? d.v : 0;
      const t = max > 0 ? Math.pow(v / max, 0.45) : 0;
      const red = Math.round(20 + 235 * t);
      const green = Math.round(10 + 150 * t);
      const blue = Math.round(24 + 80 * t);
      ctx.fillStyle = `rgb(${red},${green},${blue})`;
      ctx.fillRect(left + cellW * j + 1, top + cellH * i + 1, cellW - 2, cellH - 2);
      if (t > 0.55) {
        ctx.fillStyle = "#14060a";
        ctx.font = "10px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText(v.toFixed(2), left + cellW * (j + 0.5), top + cellH * (i + 0.5) + 3);
        ctx.font = "12px Inter, sans-serif";
      }
    });
  });

  $("descLen").textContent = values.length;
  $("descMode").textContent = mode === "off" ? "uncompressed" : "mu1nu1";
  $("descCut").textContent = cutoff.toFixed(1);
  const species = DATA.meta.species.length;
  $("heatNote").innerHTML = mode === "off"
    ? `Rows are radial channel pairs <code>(n, n′)</code>, columns angular <code>l</code>; values summed over the ${species} species pairs. Uncompressed length: ${DATA.meta.descriptor_lengths.off}.`
    : `mu1nu1 rows are <code>(n, n′)</code>, columns <code>l</code>; values summed over species. Length drops to ${DATA.meta.descriptor_lengths.mu1nu1} for ${species} species.`;
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

/* ---------------- boot ---------------- */
async function init() {
  DATA = await (await fetch("data/soap_data.json")).json();
  resize();
  buildScene();
  initSceneControls();
  renderHeatmap();
  renderPCA();
  window.addEventListener("resize", resize);
  animate();

  document.querySelectorAll("[data-mode]").forEach((b) => {
    b.onclick = () => {
      mode = b.dataset.mode;
      document.querySelectorAll("[data-mode]").forEach((x) => x.setAttribute("aria-pressed", x === b));
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
