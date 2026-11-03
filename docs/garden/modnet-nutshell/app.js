/* MODNet in a nutshell — preview widgets */
const NS = "http://www.w3.org/2000/svg";
const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

/* ---------- 0. small-data crossover ---------- */
const CROSS = {
  formation_energy: { label: "Formation energy", unit: "eV/atom", series: {
    MODNet: { color: "#ff3d5a", points: [[504, 0.210], [60000, 0.044]] },
    MEGNet: { color: "#5a6cff", points: [[504, 0.342], [60000, 0.028]] },
    SISSO: { color: "#63e6a4", points: [[504, 0.312], [60000, 0.299]] },
  }},
  band_gap: { label: "Band gap", unit: "eV", series: {
    MODNet: { color: "#ff3d5a", points: [[504, 0.71], [60000, 0.34]] },
    MEGNet: { color: "#5a6cff", points: [[504, 0.94], [60000, 0.30]] },
    SISSO: { color: "#63e6a4", points: [[504, 0.80], [60000, 0.75]] },
  }},
};

let crossCurrent = "formation_energy";

function crossCurve(pts) {
  const [a, b] = pts;
  if (pts.length === 1) return [[100, a[1]], [100000, a[1]]];
  const bb = Math.log(a[1] / b[1]) / Math.log(b[0] / a[0]);
  const aa = a[1] * Math.pow(a[0], bb);
  const out = [];
  for (let i = 0; i <= 80; i++) {
    const n = Math.pow(10, Math.log10(100) + (Math.log10(100000) - Math.log10(100)) * i / 80);
    out.push([n, aa * Math.pow(n, -bb)]);
  }
  return out;
}

function drawCross() {
  const svg = $("crossChart");
  const d = CROSS[crossCurrent];
  const W = 900, H = 420, P = { t: 24, r: 24, b: 52, l: 68 };
  const x0 = P.l, x1 = W - P.r, y0 = H - P.b, y1 = P.t;
  const lx = (n) => Math.log10(n);
  const sx = (n) => x0 + (lx(n) - lx(100)) / (lx(100000) - lx(100)) * (x1 - x0);
  const vals = Object.values(d.series).flatMap((s) => s.points.map((p) => p[1]));
  const ymin = Math.max(0.01, Math.min(...vals) * 0.55);
  const ymax = Math.max(...vals) * 1.35;
  const sy = (v) => y0 - (Math.log10(v) - Math.log10(ymin)) / (Math.log10(ymax) - Math.log10(ymin)) * (y0 - y1);

  svg.innerHTML = "";
  const g = el("g");
  [100, 300, 1000, 3000, 10000, 30000, 100000].forEach((n) => {
    g.appendChild(el("line", { class: "gridline", x1: sx(n), x2: sx(n), y1: y0, y2: y1 }));
  });
  svg.appendChild(g);

  const ax = el("g", { class: "axis" });
  [100, 300, 1000, 3000, 10000, 30000, 100000].forEach((n) => {
    const t = el("text", { x: sx(n), y: H - 26, "text-anchor": "middle" });
    t.textContent = n >= 1000 ? n / 1000 + "k" : n;
    ax.appendChild(t);
  });
  for (let i = 0; i <= 5; i++) {
    const v = Math.pow(10, Math.log10(ymin) + (Math.log10(ymax) - Math.log10(ymin)) * i / 5);
    const t = el("text", { x: x0 - 10, y: sy(v) + 4, "text-anchor": "end" });
    t.textContent = v >= 1 ? v.toFixed(1) : v.toFixed(3);
    ax.appendChild(t);
    ax.appendChild(el("line", { x1: x0, x2: x1, y1: sy(v), y2: sy(v) }));
  }
  const xl = el("text", { x: (x0 + x1) / 2, y: H - 6, "text-anchor": "middle" });
  xl.textContent = "training samples";
  ax.appendChild(xl);
  const yl = el("text", { transform: `translate(16,${(y0 + y1) / 2}) rotate(-90)`, "text-anchor": "middle" });
  yl.textContent = `MAE (${d.unit})`;
  ax.appendChild(yl);
  svg.appendChild(ax);

  for (const [name, s] of Object.entries(d.series)) {
    const pts = crossCurve(s.points);
    const path = el("path", {
      class: "series", stroke: s.color,
      d: pts.map((p, i) => (i ? "L" : "M") + sx(p[0]) + " " + sy(p[1])).join(" "),
    });
    svg.appendChild(path);
    s.points.forEach(([n, v]) => {
      svg.appendChild(el("circle", { class: "dot", cx: sx(n), cy: sy(v), r: 4.5, fill: s.color }));
    });
  }

  const lg = $("crossLegend");
  lg.innerHTML = "";
  for (const [name, s] of Object.entries(d.series)) {
    const span = document.createElement("span");
    span.innerHTML = `<i class="swatch" style="background:${s.color}"></i>${name}`;
    lg.appendChild(span);
  }
}

function initCross() {
  const box = $("propControls");
  for (const [key, d] of Object.entries(CROSS)) {
    const b = document.createElement("button");
    b.className = "pill";
    b.textContent = d.label;
    b.setAttribute("aria-pressed", key === crossCurrent);
    b.onclick = () => {
      crossCurrent = key;
      drawCross();
      [...box.children].forEach((c) => c.setAttribute("aria-pressed", c === b));
    };
    box.appendChild(b);
  }
  drawCross();
}

/* ---------- 0b. real learning curves ---------- */
async function initLearningCurves() {
  const svg = $("lcChart");
  if (!svg) return;
  let d;
  try {
    d = await (await fetch("data/learning_curves.json")).json();
  } catch (e) {
    svg.parentNode.style.display = "none";
    return;
  }
  const colors = { modnet: "#ff3d5a", allnet: "#5a6cff", ridge: "#45d6ff", dummy: "#63e6a4" };
  const names = { modnet: "MODNet", allnet: "all features", ridge: "ridge", dummy: "mean baseline" };
  const sizes = d.sizes;
  const rows = {};
  for (const [m, obj] of Object.entries(d.models)) {
    rows[m] = sizes.map((n) => {
      const vals = obj.mae.filter((x) => x[0] === n).map((x) => x[2]);
      if (!vals.length) return null;
      return { mean: vals.reduce((a, v) => a + v, 0) / vals.length, lo: Math.min(...vals), hi: Math.max(...vals) };
    });
  }
  const all = Object.values(rows).flat().filter(Boolean).flatMap((r) => [r.lo, r.hi]);
  const ymax = Math.max(...all) * 1.1;
  const W = 900, H = 360, P = { t: 18, r: 18, b: 46, l: 60 };
  const x0 = P.l, x1 = W - P.r, y0 = H - P.b, y1 = P.t;
  const sx = (i) => x0 + (i / (sizes.length - 1)) * (x1 - x0);
  const sy = (v) => y0 - (v / ymax) * (y0 - y1);
  svg.innerHTML = "";
  const ax = el("g", { class: "axis" });
  sizes.forEach((n, i) => {
    const t = el("text", { x: sx(i), y: H - 20, "text-anchor": "middle" }); t.textContent = n; ax.appendChild(t);
  });
  for (let i = 0; i <= 4; i++) {
    const v = ymax * i / 4;
    const t = el("text", { x: x0 - 8, y: sy(v) + 4, "text-anchor": "end" }); t.textContent = v.toFixed(2); ax.appendChild(t);
    ax.appendChild(el("line", { x1: x0, x2: x1, y1: sy(v), y2: sy(v), class: "gridline" }));
  }
  const xl = el("text", { x: (x0 + x1) / 2, y: H - 4, "text-anchor": "middle" });
  xl.textContent = "training samples"; ax.appendChild(xl);
  svg.appendChild(ax);

  for (const [m, pts] of Object.entries(rows)) {
    pts.forEach((p, i) => {
      if (!p) return;
      svg.appendChild(el("line", { x1: sx(i), x2: sx(i), y1: sy(p.lo), y2: sy(p.hi), stroke: colors[m], opacity: 0.35 }));
    });
    const path = pts.map((p, i) => p ? `${i ? "L" : "M"}${sx(i)} ${sy(p.mean)}` : "").join(" ");
    svg.appendChild(el("path", { class: "series", stroke: colors[m], d: path }));
    pts.forEach((p, i) => p && svg.appendChild(el("circle", { cx: sx(i), cy: sy(p.mean), r: 4, fill: colors[m], class: "dot" })));
  }
  // highlight sizes where MODNet beats the all-features net
  const wins = sizes.map((_, i) => rows.modnet[i] && rows.allnet[i] && rows.modnet[i].mean < rows.allnet[i].mean - 0.001);
  wins.forEach((w, i) => {
    if (!w) return;
    const half = i === 0 ? (sx(1) - sx(0)) / 2 : (sx(i) - sx(i - 1)) / 2;
    svg.appendChild(el("rect", {
      x: sx(i) - half, y: y1, width: 2 * half, height: y0 - y1,
      fill: "rgba(255,61,90,.14)", stroke: "rgba(255,61,90,.35)", "stroke-width": 1,
    }));
    const t = el("text", { x: sx(i), y: y1 - 4, "text-anchor": "middle", fill: "#ff3d5a", "font-size": 10 });
    t.textContent = "MODNet wins";
    svg.appendChild(t);
  });
  $("lcLegend").innerHTML = Object.keys(rows).map((m) =>
    `<span><i class="swatch" style="background:${colors[m]}"></i>${names[m]}</span>`).join("") +
    '<span style="color:#ff3d5a">shaded: MODNet lower MAE than all-features</span>';
}

/* ---------- 1. featurizer explorer ---------- */
let featData = null;
let featCurrent = "NaCl";
let includeStructure = false;

async function initFeaturizer() {
  try {
    featData = await (await fetch("data/featurizer.json")).json();
  } catch (e) {
    $("groupBars").innerHTML = '<p class="note">Could not load featurizer data.</p>';
  }
  if (!featData || !featData.compounds) return;
  const box = $("compoundControls");
  featCurrent = featData.compounds[0].name;
  featData.compounds.forEach((c) => {
    const b = document.createElement("button");
    b.className = "pill";
    b.textContent = c.name;
    b.setAttribute("aria-pressed", c.name === featCurrent);
    b.onclick = () => {
      featCurrent = c.name;
      includeStructure = false;
      [...box.children].forEach((x) => x.setAttribute("aria-pressed", x === b));
      renderFeaturizer();
    };
    box.appendChild(b);
  });
  const filters = [["all", "all"], ["oxide", "oxides"], ["nonoxide", "non-oxides"], ["binary", "binary"], ["ternary", "ternary"], ["multi", "multi-element"]];
  const fbox = $("chemFilters");
  filters.forEach(([k, label]) => {
    const b = document.createElement("button");
    b.className = "pill";
    b.textContent = label;
    b.setAttribute("aria-pressed", k === featFilter);
    b.onclick = () => { featFilter = k; renderFeaturizer(); [...fbox.children].forEach((x) => x.setAttribute("aria-pressed", x === b)); };
    fbox.appendChild(b);
  });
  $("structToggle").onclick = () => {
    const c = featData.compounds.find((x) => x.name === featCurrent);
    const has = c.structure_features && Object.keys(c.structure_features).length > 0;
    if (!has) return;
    includeStructure = !includeStructure;
    renderFeaturizer();
  };
  renderFeaturizer();
}

let featFilter = "all";

function renderFeaturizer() {
  const c = featData.compounds.find((x) => x.name === featCurrent);
  const hasStruct = c.structure_features && Object.keys(c.structure_features).length > 0;
  const comp = featData.preset_summary.composition_only.n_features;
  const struct = hasStruct ? Object.keys(c.structure_features).length : 0;
  const total = includeStructure && hasStruct ? comp + struct : comp;
  $("featComp").textContent = comp;
  $("featStruct").textContent = hasStruct ? struct : "n/a";
  $("featTotal").textContent = total;
  const toggle = $("structToggle");
  toggle.disabled = !hasStruct;
  toggle.setAttribute("aria-pressed", includeStructure && hasStruct);
  $("structNote").textContent = hasStruct ? "" : "no structure featurization for this sample";

  const useStruct = includeStructure && hasStruct;
  const key = useStruct ? "structure_features" : "composition_features";
  const dicts = featData.compounds.map((x) => x[key] || {});
  const cols = Object.keys(dicts[0] || {});
  const varOf = (col) => {
    const vals = dicts.map((dd) => Number(dd[col])).filter((v) => Number.isFinite(v));
    if (vals.length < 2) return -1;
    const m = vals.reduce((a, v) => a + v, 0) / vals.length;
    return vals.reduce((a, v) => a + (v - m) ** 2, 0) / vals.length;
  };
  const familyOrder = ["ElementProperty", "Stoichiometry", "OxidationStates", "IonProperty",
    "AtomicOrbitals", "ValenceOrbital", "Miedema", "YangSolidSolution", "TMetalFraction",
    "AtomicPackingEfficiency", "BandCenter", "ElementFraction"];
  const byFamily = {};
  cols.forEach((col) => {
    const fam = col.split("|")[0];
    (byFamily[fam] = byFamily[fam] || []).push([col, varOf(col)]);
  });
  const chosen = [];
  familyOrder.forEach((fam) => {
    (byFamily[fam] || []).sort((a, b) => b[1] - a[1]).slice(0, 3).forEach((x) => chosen.push(x));
  });
  Object.keys(byFamily).sort().forEach((fam) => {
    if (chosen.length >= 24 || familyOrder.includes(fam)) return;
    byFamily[fam].sort((a, b) => b[1] - a[1]).slice(0, 2).forEach((x) => chosen.push(x));
  });
  const feats = chosen.slice(0, 24).map((x) => x[0]);

  const stats = {};
  feats.forEach((col) => {
    const vals = dicts.map((dd) => Number(dd[col])).filter((v) => Number.isFinite(v));
    const m = vals.reduce((a, v) => a + v, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, v) => a + (v - m) ** 2, 0) / vals.length) || 1;
    stats[col] = { m, sd };
  });
  const color = (z) => {
    const a = Math.min(0.85, Math.abs(z) / 2.5 * 0.85);
    return z >= 0 ? `rgba(255,61,90,${a})` : `rgba(90,108,255,${a})`;
  };

  const rows = featData.compounds;
  const grid = $("featMatrix");
  grid.style.gridTemplateColumns = `160px repeat(${feats.length}, minmax(14px, 1fr))`;
  grid.innerHTML = "";
  grid.appendChild(document.createElement("div"));
  feats.forEach((col) => {
    const d = document.createElement("div");
    d.className = "collabel";
    d.title = col;
    d.textContent = col.split("|").slice(0, 2).join(" ");
    grid.appendChild(d);
  });
  rows.forEach((r) => {
    const isSelected = r.name === featCurrent;
    const dim = !matchesFilter(r, featFilter);
    const lab = document.createElement("div");
    lab.className = "rowlabel" + (isSelected ? " active" : "") + (dim ? " dim" : "");
    lab.textContent = `${r.name} · ${r.prototype}`;
    lab.onclick = () => { featCurrent = r.name; renderFeaturizer(); };
    grid.appendChild(lab);
    const dict = r[key] || {};
    feats.forEach((col) => {
      const v = Number(dict[col]);
      const z = Number.isFinite(v) ? (v - stats[col].m) / stats[col].sd : 0;
      const cell = document.createElement("div");
      cell.className = "cell" + (dim ? " dim" : "");
      cell.style.background = Number.isFinite(v) ? color(z) : "rgba(255,255,255,.04)";
      cell.title = `${r.name} · ${col}\nvalue ${Number.isFinite(v) ? v.toPrecision(3) : "null"} · z ${z.toFixed(2)}`;
      grid.appendChild(cell);
    });
  });

  $("featScale").innerHTML = '<span><i class="swatch" style="background:#5a6cff"></i>below mean</span><span><i class="swatch" style="background:#ff3d5a"></i>above mean</span><span>color = z-score across the six materials (clamped ±2.5)</span>';

  const selDict = c[key] || {};
  const scored = feats.map((col) => {
    const v = Number(selDict[col]);
    return { col, v, z: Number.isFinite(v) ? (v - stats[col].m) / stats[col].sd : 0 };
  }).filter((x) => Number.isFinite(x.v)).sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 8);
  $("featValues").innerHTML = `<table><thead><tr><th>descriptor</th><th>${c.name}</th><th>z</th></tr></thead><tbody>` +
    scored.map((x) => `<tr><td title="${x.col}">${x.col.length > 46 ? x.col.slice(0, 46) + "…" : x.col}</td><td>${x.v.toPrecision(4)}</td><td>${x.z.toFixed(2)}</td></tr>`).join("") +
    "</tbody></table>";
}

function matchesFilter(r, f) {
  if (f === "all") return true;
  if (f === "oxide") return r.prototype.includes("oxide");
  if (f === "nonoxide") return !r.prototype.includes("oxide");
  if (f === "binary") return r.prototype.includes("binary");
  if (f === "ternary") return r.prototype.includes("ternary");
  if (f === "multi") return r.prototype.includes("many-element");
  return true;
}

/* ---------- 2. NMI playground ---------- */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function gauss(r) {
  const u = Math.max(1e-9, r()), v = Math.max(1e-9, r());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

let nmiMode = "linear";

function nmiPoints() {
  const r = rng(42);
  const pts = [];
  const dep = Number($("nmiSlider").value) / 100;
  for (let i = 0; i < 400; i++) {
    const x = gauss(r);
    let y;
    if (nmiMode === "independent") {
      // no dependence: the slider only changes the spread of Y
      y = (0.3 + 1.7 * dep) * gauss(r);
    } else if (nmiMode === "quadratic") {
      y = dep * (x * x - 1) + (1 - dep) * 1.5 * gauss(r);
    } else {
      y = dep * x + (1 - dep) * 1.5 * gauss(r);
    }
    pts.push([x, y]);
  }
  return pts;
}

function entropyBin(p) {
  return -p.reduce((a, v) => a + (v > 0 ? v * Math.log(v) : 0), 0);
}

function binStats(pts, bins = 8) {
  const lo = -3, hi = 3;
  const grid = Array.from({ length: bins }, () => new Array(bins).fill(0));
  const idx = (v) => Math.max(0, Math.min(bins - 1, Math.floor((v - lo) / (hi - lo) * bins)));
  for (const [x, y] of pts) grid[idx(x)][idx(y)]++;
  const n = pts.length;
  const px = new Array(bins).fill(0), py = new Array(bins).fill(0);
  for (let i = 0; i < bins; i++) for (let j = 0; j < bins; j++) { px[i] += grid[i][j] / n; py[j] += grid[i][j] / n; }
  let mi = 0;
  for (let i = 0; i < bins; i++) for (let j = 0; j < bins; j++) {
    const p = grid[i][j] / n;
    if (p > 0) mi += p * Math.log(p / (px[i] * py[j]));
  }
  const hx = entropyBin(px), hy = entropyBin(py);
  return { mi: Math.max(0, mi), hx, hy, nmi: Math.max(0, mi / ((hx + hy) / 2)) };
}

function pearson(pts) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const n = xs.length;
  const mx = xs.reduce((a, v) => a + v, 0) / n, my = ys.reduce((a, v) => a + v, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return num / Math.sqrt(dx * dy + 1e-12);
}

function drawNMI() {
  const svg = $("nmiScatter");
  const pts = nmiPoints();
  const W = 420, H = 320, P = { t: 16, r: 16, b: 34, l: 40 };
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys);
  const sx = (x) => P.l + (x - xmin) / (xmax - xmin + 1e-9) * (W - P.l - P.r);
  const sy = (y) => H - P.b - (y - ymin) / (ymax - ymin + 1e-9) * (H - P.t - P.b);
  svg.innerHTML = "";
  const ax = el("g", { class: "axis" });
  ax.appendChild(el("line", { x1: P.l, x2: W - P.r, y1: H - P.b, y2: H - P.b }));
  ax.appendChild(el("line", { x1: P.l, x2: P.l, y1: P.t, y2: H - P.b }));
  const lx = el("text", { x: W - P.r, y: H - 14, "text-anchor": "end" }); lx.textContent = "feature X";
  const ly = el("text", { x: 12, y: P.t + 10 }); ly.textContent = "target Y";
  ax.appendChild(lx); ax.appendChild(ly);
  svg.appendChild(ax);
  pts.forEach(([x, y]) => svg.appendChild(el("circle", { cx: sx(x), cy: sy(y), r: 2.4, fill: "#ff3d5a", opacity: 0.65 })));

  const st = binStats(pts);
  $("nmiMI").textContent = st.mi.toFixed(3);
  $("nmiHX").textContent = st.hx.toFixed(3);
  $("nmiHY").textContent = st.hy.toFixed(3);
  $("nmiValue").textContent = st.nmi.toFixed(3);
  $("nmiPearson").textContent = pearson(pts).toFixed(3);
}

function initNMI() {
  $("nmiSlider").oninput = drawNMI;
  document.querySelectorAll("[data-nmi]").forEach((b) => {
    b.onclick = () => {
      nmiMode = b.dataset.nmi;
      document.querySelectorAll("[data-nmi]").forEach((x) => x.classList.toggle("primary", x === b));
      const notes = {
        linear: "Linear dependence: the points follow a line, so both Pearson r and NMI rise together.",
        quadratic: "Symmetric nonlinear dependence: Pearson r collapses toward zero while NMI stays high. This is why MODNet does not use correlation.",
        independent: "The variables are independent. The slider changes the spread of Y, so the cloud moves — but NMI stays near zero. A rescaled cloud is still unrelated.",
      };
      $("nmiModeNote").textContent = notes[nmiMode];
      drawNMI();
    };
  });
  document.querySelector('[data-nmi="linear"]').classList.add("primary");
  drawNMI();
}

/* ---------- 2b. real NMI ranking ---------- */
async function initNMIReal() {
  try {
    const d = await (await fetch("data/nmi_target.json")).json();
    if (!d.features) throw new Error("no nmi data");
    const top = d.features.slice(0, 12);
    const max = Math.max(...top.map((f) => f.nmi));
    $("nmiRealBars").innerHTML = top.map((f) => `
      <div class="bar-row" title="${f.feature}">
        <span>${f.feature.split("|").slice(0, 2).join(" · ")}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${(f.nmi / max) * 100}%"></span></span>
        <b>${f.nmi.toFixed(3)}</b>
      </div>`).join("");
  } catch (e) {
    const el = $("nmiRealBars");
    if (el) el.innerHTML = '<p class="note">Real NMI ranking not available.</p>';
  }
}

/* ---------- 3. FRR walkthrough ---------- */
let frr = null;
let frrReal = null;
let frrNmi = null;

function makeFRR() {
  const r = rng(1234);
  const features = [];
  for (let i = 0; i < 40; i++) {
    const cluster = Math.floor(i / 10);
    const relevance = 0.25 + 0.6 * r() + 0.15 * (cluster === 0 ? 1 : 0);
    features.push({ name: `f${String(i + 1).padStart(2, "0")}`, relevance, cluster });
  }
  const cross = features.map((a) => features.map((b) =>
    a.name === b.name ? 1 : (a.cluster === b.cluster ? 0.55 + 0.35 * r() : 0.05 + 0.12 * r())
  ));
  return { mode: "synthetic", features, cross, selected: [], last: null };
}

function makeFRRReal() {
  return { mode: "real", selected: [], step: -1, last: null };
}

function frrStep() {
  if (!frr) return;
  if (frr.mode === "real") {
    if (frr.step + 1 >= frrReal.seq.length) return;
    frr.step++;
    const f = frrReal.seq[frr.step];
    const r = frrReal.rankByFeat[f];
    frr.selected.push(f);
    frr.last = { p: r.p, c: r.c, score: r.rr_score, red: r.max_redundancy, nmi: r.nmi_target };
    drawFRR();
    return;
  }
  const n = frr.selected.length;
  if (n >= 12) return;
  const p = Math.max(0.1, 4.5 - Math.pow(n, 0.4));
  const c = 1e-6 * Math.pow(n, 3);
  let best = null, bestScore = -Infinity;
  frr.features.forEach((f, i) => {
    if (frr.selected.includes(i)) return;
    let maxRed = 0;
    frr.selected.forEach((j) => { maxRed = Math.max(maxRed, frr.cross[i][j]); });
    const score = f.relevance / (Math.pow(maxRed, p) + c);
    if (score > bestScore) { bestScore = score; best = i; }
  });
  if (best === null) return;
  frr.selected.push(best);
  frr.last = { p, c, score: bestScore };
  drawFRR();
}

function drawFRRReal() {
  const svg = $("frrScatter");
  if (!svg || !frr) return;
  const W = 440, H = 330, P = { t: 18, r: 18, b: 46, l: 52 };
  const maxN = Math.max(...frrReal.cands.map((c) => frrNmi[c] || 0), 0.001) * 1.1;
  const sx = (v) => P.l + v * (W - P.l - P.r);
  const sy = (v) => H - P.b - Math.sqrt(Math.min(1, v / maxN)) * (H - P.t - P.b);
  svg.innerHTML = "";
  const ax = el("g", { class: "axis" });
  [0, 0.25, 0.5, 0.75, 1].forEach((t) => {
    ax.appendChild(el("line", { x1: sx(t), x2: sx(t), y1: P.t, y2: H - P.b, class: "gridline" }));
    ax.appendChild(el("line", { x1: P.l, x2: W - P.r, y1: sy(t * maxN), y2: sy(t * maxN), class: "gridline" }));
    const tx = el("text", { x: sx(t), y: H - 26, "text-anchor": "middle" }); tx.textContent = t; ax.appendChild(tx);
    const ty = el("text", { x: P.l - 8, y: sy(t * maxN) + 4, "text-anchor": "end" }); ty.textContent = (t * maxN).toFixed(3); ax.appendChild(ty);
  });
  const xl = el("text", { x: (P.l + W - P.r) / 2, y: H - 6, "text-anchor": "middle" });
  xl.textContent = "max redundancy with already-selected features";
  const yl = el("text", { transform: `translate(12,${(P.t + H - P.b) / 2}) rotate(-90)`, "text-anchor": "middle" });
  yl.textContent = "NMI with target (sqrt scale)";
  ax.appendChild(xl); ax.appendChild(yl);
  svg.appendChild(ax);

  const cands = frrReal.cands;
  const idxOf = Object.fromEntries(cands.map((f, i) => [f, i]));
  const selSet = new Set(frr.selected);
  const last = frr.selected[frr.selected.length - 1];
  cands.forEach((c, ci) => {
    if (selSet.has(c)) return;
    let maxRed = 0;
    frr.selected.forEach((s) => { maxRed = Math.max(maxRed, frrReal.M[ci][idxOf[s]]); });
    svg.appendChild(el("circle", {
      cx: sx(Math.min(1, maxRed)), cy: sy(frrNmi[c] || 0), r: 4,
      fill: "#5a6cff", opacity: 0.55, class: "dot",
    }));
  });
  selSet.forEach((s) => {
    if (!(s in idxOf)) return;
    const ci = idxOf[s];
    const isLast = s === last;
    svg.appendChild(el("circle", {
      cx: sx(Math.min(1, frrReal.rankByFeat[s].max_redundancy || 0)),
      cy: sy(frrNmi[s] || 0), r: 6,
      fill: isLast ? "#45d6ff" : "#ff3d5a", class: "dot",
    }));
    if (isLast) {
      const t = el("text", { x: sx(Math.min(1, frrReal.rankByFeat[s].max_redundancy || 0)) + 8, y: sy(frrNmi[s] || 0) - 8, fill: "#45d6ff", "font-size": 10 });
      t.textContent = s.split("|").slice(0, 2).join("·"); svg.appendChild(t);
    }
  });

  $("frrStep").textContent = frr.selected.length;
  $("frrP").textContent = frr.last && frr.last.p != null ? Number(frr.last.p).toFixed(2) : "–";
  $("frrC").textContent = frr.last && frr.last.c != null ? Number(frr.last.c).toExponential(1) : "–";
  $("frrScore").textContent = frr.last && frr.last.score != null ? Number(frr.last.score).toFixed(2) : "–";
  $("frrList").innerHTML = frr.selected.slice(-8).reverse().map((s) =>
    `<li>${s.split("|").slice(0, 2).join(" · ")} — NMI ${(frrNmi[s] || 0).toFixed(3)}</li>`).join("");
}

function drawFRR() {
  if (frr && frr.mode === "real") return drawFRRReal();
  const svg = $("frrScatter");
  if (!svg || !frr) return;
  const W = 440, H = 330, P = { t: 18, r: 18, b: 46, l: 48 };
  const sx = (v) => P.l + v * (W - P.l - P.r);
  const sy = (v) => H - P.b - v * (H - P.t - P.b);
  svg.innerHTML = "";
  const ax = el("g", { class: "axis" });
  [0, 0.25, 0.5, 0.75, 1].forEach((t) => {
    ax.appendChild(el("line", { x1: sx(t), x2: sx(t), y1: P.t, y2: H - P.b, class: "gridline" }));
    ax.appendChild(el("line", { x1: P.l, x2: W - P.r, y1: sy(t), y2: sy(t), class: "gridline" }));
    const tx = el("text", { x: sx(t), y: H - 26, "text-anchor": "middle" }); tx.textContent = t; ax.appendChild(tx);
    const ty = el("text", { x: P.l - 8, y: sy(t) + 4, "text-anchor": "end" }); ty.textContent = t; ax.appendChild(ty);
  });
  const xl = el("text", { x: (P.l + W - P.r) / 2, y: H - 6, "text-anchor": "middle" });
  xl.textContent = "max redundancy with selected set";
  const yl = el("text", { transform: `translate(12,${(P.t + H - P.b) / 2}) rotate(-90)`, "text-anchor": "middle" });
  yl.textContent = "NMI with target";
  ax.appendChild(xl); ax.appendChild(yl);
  svg.appendChild(ax);

  frr.features.forEach((f, i) => {
    let maxRed = 0;
    frr.selected.forEach((j) => { maxRed = Math.max(maxRed, frr.cross[i][j]); });
    const isSel = frr.selected.includes(i);
    const isLast = frr.selected[frr.selected.length - 1] === i;
    svg.appendChild(el("circle", {
      cx: sx(maxRed), cy: sy(f.relevance), r: isSel ? 6 : 4,
      fill: isSel ? (isLast ? "#45d6ff" : "#ff3d5a") : "#5a6cff",
      opacity: isSel ? 1 : 0.55, class: "dot",
    }));
    if (isLast) {
      const t = el("text", { x: sx(maxRed) + 8, y: sy(f.relevance) - 8, fill: "#45d6ff", "font-size": 11 });
      t.textContent = f.name; svg.appendChild(t);
    }
  });

  $("frrStep").textContent = frr.selected.length;
  $("frrP").textContent = frr.last && frr.last.p != null ? frr.last.p.toFixed(2) : "–";
  $("frrC").textContent = frr.last && frr.last.c != null ? frr.last.c.toExponential(1) : "–";
  $("frrScore").textContent = frr.last ? frr.last.score.toFixed(2) : "–";
  $("frrList").innerHTML = frr.selected.map((i, k) =>
    `<li>${frr.features[i].name} — NMI ${frr.features[i].relevance.toFixed(2)}</li>`).join("");
}

async function initFRR() {
  try {
    const [r1, r2, r3] = await Promise.all([
      fetch("data/frr_ranking.json"),
      fetch("data/cross_nmi.json"),
      fetch("data/nmi_target.json"),
    ]);
    const [rank, cross, nmi] = await Promise.all([r1.json(), r2.json(), r3.json()]);
    const cands = cross.features;
    frrReal = {
      seq: rank.ranking.map((r) => r.feature).filter((f) => cands.includes(f)),
      rankByFeat: Object.fromEntries(rank.ranking.map((r) => [r.feature, r])),
      cands,
      M: cross.matrix,
    };
    frrNmi = Object.fromEntries(nmi.features.map((f) => [f.feature, f.nmi]));
    if (frrReal.seq.length < 3) throw new Error("ranking too small");
    frr = makeFRRReal();
  } catch (e) {
    console.error("FRR fallback:", e && e.message);
    frrReal = null;
    frr = makeFRR();
  }
  drawFRR();
  $("frrNext").onclick = frrStep;
  $("frrReset").onclick = () => {
    frr = frrReal ? makeFRRReal() : makeFRR();
    drawFRR();
  };
}

/* ---------- 4. architecture ---------- */
function drawArch() {
  const svg = $("archSvg");
  if (!svg) return;
  svg.innerHTML = "";
  const box = (x, y, w, h, label, sub, color) => {
    const g = el("g");
    g.appendChild(el("rect", { x, y, width: w, height: h, rx: 12, fill: "rgba(22,14,22,.9)", stroke: color, "stroke-width": 1.4 }));
    const t = el("text", { x: x + w / 2, y: y + h / 2 - 2, "text-anchor": "middle", fill: "#eee9ee", "font-size": 12, "font-family": "Space Grotesk" });
    t.textContent = label; g.appendChild(t);
    if (sub) {
      const s = el("text", { x: x + w / 2, y: y + h / 2 + 15, "text-anchor": "middle", fill: "#6e5f6e", "font-size": 10 });
      s.textContent = sub; g.appendChild(s);
    }
    svg.appendChild(g);
  };
  const arrow = (x1, y1, x2, y2) => {
    svg.appendChild(el("line", { x1, y1, x2, y2, stroke: "rgba(214,160,180,.35)", "stroke-width": 1.3, "marker-end": "url(#arrow)" }));
  };
  const defs = el("defs");
  const marker = el("marker", { id: "arrow", markerWidth: 8, markerHeight: 8, refX: 6, refY: 3, orient: "auto" });
  marker.appendChild(el("path", { d: "M0,0 L6,3 L0,6 Z", fill: "rgba(214,160,180,.45)" }));
  defs.appendChild(marker); svg.appendChild(defs);

  box(20, 140, 120, 70, "features", "n_feat = 64", "#45d6ff");
  box(190, 120, 150, 110, "shared encoder", "Dense 64 → BN", "#ff3d5a");
  box(390, 40, 170, 80, "group A block", "Dense 32 → BN", "#5a6cff");
  box(390, 230, 170, 80, "group B block", "Dense 32 → BN", "#5a6cff");
  box(620, 60, 150, 60, "head A", "regression", "#e8a05a");
  box(620, 230, 150, 60, "head B", "regression", "#e8a05a");
  arrow(140, 175, 185, 175);
  arrow(340, 175, 386, 90);
  arrow(340, 175, 386, 260);
  arrow(560, 80, 616, 90);
  arrow(560, 270, 616, 260);
}

/* ---------- 5. joint vs single ---------- */
function drawJoint() {
  const svg = $("jointSvg");
  if (!svg) return;
  svg.innerHTML = "";
  const label = (x, y, text, fill = "#eee9ee", size = 12) => {
    const t = el("text", { x, y, fill, "font-size": size, "text-anchor": "middle", "font-family": "Space Grotesk" });
    t.textContent = text; svg.appendChild(t);
  };
  const rect = (x, y, w, h, stroke, fill = "rgba(22,14,22,.9)") =>
    svg.appendChild(el("rect", { x, y, width: w, height: h, rx: 10, fill, stroke, "stroke-width": 1.3 }));

  label(210, 26, "single-task", "#ff3d5a", 13);
  rect(40, 110, 90, 50, "#45d6ff"); label(85, 140, "X", "#eee9ee", 12);
  rect(170, 95, 90, 80, "#ff3d5a"); label(215, 140, "trunk", "#eee9ee", 11);
  rect(300, 110, 90, 50, "#e8a05a"); label(345, 140, "y₁", "#eee9ee", 12);
  svg.appendChild(el("line", { x1: 130, y1: 135, x2: 166, y2: 135, stroke: "rgba(214,160,180,.4)", "stroke-width": 1.3 }));
  svg.appendChild(el("line", { x1: 260, y1: 135, x2: 296, y2: 135, stroke: "rgba(214,160,180,.4)", "stroke-width": 1.3 }));
  label(210, 230, "one network per target", "#6e5f6e", 10);

  label(660, 26, "joint", "#63e6a4", 13);
  rect(500, 110, 80, 50, "#45d6ff"); label(540, 140, "X", "#eee9ee", 12);
  rect(610, 85, 100, 100, "#63e6a4"); label(660, 130, "shared", "#eee9ee", 11); label(660, 146, "trunk", "#eee9ee", 11);
  rect(750, 55, 100, 50, "#e8a05a"); label(800, 85, "y₁", "#eee9ee", 12);
  rect(750, 165, 100, 50, "#e8a05a"); label(800, 195, "y₂", "#eee9ee", 12);
  svg.appendChild(el("line", { x1: 580, y1: 135, x2: 606, y2: 135, stroke: "rgba(214,160,180,.4)", "stroke-width": 1.3 }));
  svg.appendChild(el("line", { x1: 710, y1: 115, x2: 746, y2: 85, stroke: "rgba(214,160,180,.4)", "stroke-width": 1.3 }));
  svg.appendChild(el("line", { x1: 710, y1: 155, x2: 746, y2: 185, stroke: "rgba(214,160,180,.4)", "stroke-width": 1.3 }));
  label(660, 230, "one network, shared representation", "#6e5f6e", 10);
}

/* ---------- 5b. joint learning synthetic demo ---------- */
async function initJointChart() {
  const svg = $("jointChart");
  if (!svg) return;
  let d;
  try {
    d = await (await fetch("data/joint_synthetic.json")).json();
  } catch (e) {
    svg.parentNode.style.display = "none";
    return;
  }
  const rows = d.rows;
  const W = 900, H = 320, P = { t: 20, r: 20, b: 44, l: 60 };
  const x0 = P.l, x1 = W - P.r, y0 = H - P.b, y1 = P.t;
  const xs = rows.map((r) => r.n_train);
  const ymax = Math.max(...rows.flatMap((r) => [r.joint + r.joint_std, r.single + r.single_std])) * 1.1;
  const sx = (n) => x0 + (Math.log10(n) - Math.log10(xs[0])) / (Math.log10(xs[xs.length - 1]) - Math.log10(xs[0])) * (x1 - x0);
  const sy = (v) => y0 - (v / ymax) * (y0 - y1);
  svg.innerHTML = "";

  const ax = el("g", { class: "axis" });
  xs.forEach((n) => {
    const t = el("text", { x: sx(n), y: H - 20, "text-anchor": "middle" }); t.textContent = n; ax.appendChild(t);
  });
  for (let i = 0; i <= 4; i++) {
    const v = ymax * i / 4;
    const t = el("text", { x: x0 - 8, y: sy(v) + 4, "text-anchor": "end" }); t.textContent = v.toFixed(2); ax.appendChild(t);
    ax.appendChild(el("line", { x1: x0, x2: x1, y1: sy(v), y2: sy(v), class: "gridline" }));
  }
  const xl = el("text", { x: (x0 + x1) / 2, y: H - 4, "text-anchor": "middle" });
  xl.textContent = "training samples (log scale)"; ax.appendChild(xl);
  const yl = el("text", { transform: `translate(12,${(y0 + y1) / 2}) rotate(-90)`, "text-anchor": "middle" });
  yl.textContent = "test MAE (lower is better)"; ax.appendChild(yl);
  svg.appendChild(ax);

  const series = [
    { key: "joint", color: "#ff3d5a", label: "joint (shared trunk, two heads)" },
    { key: "single", color: "#5a6cff", label: "single-task (one network per target)" },
  ];
  series.forEach((sr) => {
    const lo = rows.map((r) => sy(Math.max(0, r[sr.key] - r[sr.key + "_std"])));
    const hi = rows.map((r) => sy(r[sr.key] + r[sr.key + "_std"]));
    const band = rows.map((r, i) => `${i ? "L" : "M"}${sx(r.n_train)} ${lo[i]}`)
      .concat([...rows].reverse().map((r, j) => `L${sx(r.n_train)} ${hi[rows.length - 1 - j]}`))
      .join(" ") + " Z";
    svg.appendChild(el("path", { d: band, fill: sr.color, opacity: 0.12, stroke: "none" }));
    const line = rows.map((r, i) => `${i ? "L" : "M"}${sx(r.n_train)} ${sy(r[sr.key])}`).join(" ");
    svg.appendChild(el("path", { class: "series", stroke: sr.color, d: line }));
    rows.forEach((r) => svg.appendChild(el("circle", { cx: sx(r.n_train), cy: sy(r[sr.key]), r: 4, fill: sr.color, class: "dot" })));
  });

  $("jointLegend").innerHTML = series.map((sr) =>
    `<span><i class="swatch" style="background:${sr.color}"></i>${sr.label}</span>`).join("");
}

/* ---------- 5c. real ensemble uncertainty ---------- */
async function initEnsemble() {
  const svg = $("ensChart");
  if (!svg) return;
  let d;
  try {
    d = await (await fetch("data/ensemble.json")).json();
  } catch (e) {
    svg.parentNode.parentNode.style.display = "none";
    return;
  }
  const pts = d.samples;
  const xmax = Math.max(...pts.map((p) => p.std)) * 1.1;
  const ymax = Math.max(...pts.map((p) => p.abs_error)) * 1.1;
  const W = 460, H = 360, P = { t: 18, r: 18, b: 46, l: 52 };
  const x0 = P.l, x1 = W - P.r, y0 = H - P.b, y1 = P.t;
  const sx = (v) => x0 + (v / xmax) * (x1 - x0);
  const sy = (v) => y0 - (v / ymax) * (y0 - y1);
  svg.innerHTML = "";
  const ax = el("g", { class: "axis" });
  for (let i = 0; i <= 4; i++) {
    const xv = xmax * i / 4, yv = ymax * i / 4;
    const tx = el("text", { x: sx(xv), y: H - 20, "text-anchor": "middle" }); tx.textContent = xv.toFixed(2); ax.appendChild(tx);
    const ty = el("text", { x: x0 - 8, y: sy(yv) + 4, "text-anchor": "end" }); ty.textContent = yv.toFixed(2); ax.appendChild(ty);
    ax.appendChild(el("line", { x1: x0, x2: x1, y1: sy(yv), y2: sy(yv), class: "gridline" }));
  }
  const xl = el("text", { x: (x0 + x1) / 2, y: H - 4, "text-anchor": "middle" });
  xl.textContent = "ensemble std"; ax.appendChild(xl);
  const yl = el("text", { transform: `translate(12,${(y0 + y1) / 2}) rotate(-90)`, "text-anchor": "middle" });
  yl.textContent = "absolute error"; ax.appendChild(yl);
  svg.appendChild(ax);
  pts.forEach((p) => svg.appendChild(el("circle", {
    cx: sx(p.std), cy: sy(p.abs_error), r: 3, fill: "#ff3d5a", opacity: 0.55,
  })));
  $("ensPearson").textContent = d.correlations.pearson_std_error.toFixed(2);
  $("ensCover1").textContent = (d.coverage.within_1sigma * 100).toFixed(0) + "%";
  $("ensCover2").textContent = (d.coverage.within_2sigma * 100).toFixed(0) + "%";
}

/* ---------- 6. real genetic algorithm ---------- */
let gaData = null;
let gaIdx = 0;

async function initGA() {
  const svg = $("gaChart");
  if (!svg) return;
  try {
    const r = await fetch("data/ga_run_events.json");
    gaData = r.ok ? await r.json() : await (await fetch("data/ga_run.json")).json();
  } catch (e) {
    svg.parentNode.style.display = "none";
    return;
  }
  gaIdx = 0;
  drawGA();
  $("gaNext").onclick = () => {
    if (gaIdx < gaData.generations.length - 1) gaIdx++;
    drawGA();
  };
  $("gaReset").onclick = () => { gaIdx = 0; drawGA(); };
}

function drawGA() {
  const gens = gaData.generations;
  const stats = gens.map((g) => {
    const losses = g.map((x) => x.val_loss);
    return { best: Math.min(...losses), mean: losses.reduce((a, v) => a + v, 0) / losses.length };
  });
  const shown = stats.slice(0, gaIdx + 1);
  const ymax = Math.max(...shown.flatMap((d) => [d.best, d.mean])) * 1.1;
  const W = 900, H = 320, P = { t: 22, r: 20, b: 42, l: 60 };
  const x0 = P.l, x1 = W - P.r, y0 = H - P.b, y1 = P.t;
  const sx = (i) => x0 + (gens.length <= 1 ? 0 : (i / (gens.length - 1)) * (x1 - x0));
  const sy = (v) => y0 - (v / ymax) * (y0 - y1);
  const svg = $("gaChart");
  svg.innerHTML = "";
  const ax = el("g", { class: "axis" });
  for (let i = 0; i <= 4; i++) {
    const v = ymax * i / 4;
    const t = el("text", { x: x0 - 8, y: sy(v) + 4, "text-anchor": "end" }); t.textContent = v.toFixed(2); ax.appendChild(t);
    ax.appendChild(el("line", { x1: x0, x2: x1, y1: sy(v), y2: sy(v), class: "gridline" }));
  }
  gens.forEach((_, i) => {
    const t = el("text", { x: sx(i), y: H - 20, "text-anchor": "middle" });
    t.textContent = i + 1; ax.appendChild(t);
  });
  const xl = el("text", { x: (x0 + x1) / 2, y: H - 4, "text-anchor": "middle" });
  xl.textContent = "generation"; ax.appendChild(xl);
  const yl = el("text", { transform: `translate(12,${(y0 + y1) / 2}) rotate(-90)`, "text-anchor": "middle" });
  yl.textContent = "validation MAE (lower is better)"; ax.appendChild(yl);
  svg.appendChild(ax);

  const bestPath = shown.map((d, i) => `${i ? "L" : "M"}${sx(i)} ${sy(d.best)}`).join(" ");
  const meanPath = shown.map((d, i) => `${i ? "L" : "M"}${sx(i)} ${sy(d.mean)}`).join(" ");
  svg.appendChild(el("path", { class: "series", stroke: "#ff3d5a", d: bestPath }));
  svg.appendChild(el("path", { class: "series", stroke: "#5a6cff", "stroke-dasharray": "5 4", d: meanPath }));
  shown.forEach((d, i) => {
    svg.appendChild(el("circle", { cx: sx(i), cy: sy(d.best), r: 4, fill: "#ff3d5a", class: "dot" }));
    svg.appendChild(el("circle", { cx: sx(i), cy: sy(d.mean), r: 3, fill: "#5a6cff", class: "dot" }));
  });

  $("gaGen").textContent = gaIdx + 1;
  $("gaBest").textContent = shown[shown.length - 1].best.toFixed(3);
  $("gaMean").textContent = shown[shown.length - 1].mean.toFixed(3);

  const pop = [...gens[gaIdx]].sort((a, b) => a.val_loss - b.val_loss).slice(0, 6);
  const cols = ["n_feat", "n_neurons_first_layer", "lr", "batch_size", "xscale", "loss"];
  const best = pop[0];
  const g = best.genes;
  const widths = [g.n_neurons_first_layer, g.n_neurons_first_layer * g.fraction1,
    g.n_neurons_first_layer * g.fraction1 * g.fraction2,
    g.n_neurons_first_layer * g.fraction1 * g.fraction2 * g.fraction3].map((v) => Math.round(v));
  $("gaTable").innerHTML =
    `<p class="note" style="margin:0 0 8px">Winner's four blocks: <strong>${widths.join(" → ")}</strong> neurons (first-layer width × the three fraction genes)</p>` +
    `<table><thead><tr><th>#</th>${cols.map((c) => `<th>${c}</th>`).join("")}<th>val MAE</th></tr></thead><tbody>` +
    pop.map((ind, i) => `<tr><td>${i + 1}</td>${cols.map((c) => `<td>${ind.genes[c]}</td>`).join("")}<td>${ind.val_loss.toFixed(3)}</td></tr>`).join("") +
    "</tbody></table>";

  const events = (gaData.events || []).filter((e) => e.gen === gaIdx);
  const cross = events.filter((e) => e.type === "crossover").length;
  const muts = events.filter((e) => e.type === "mutation");
  let html = `<p style="margin:10px 0 4px">Generation ${gaIdx + 1} operators: <strong>${cross}</strong> crossovers, <strong>${muts.length}</strong> mutations.</p>`;
  if (muts.length) {
    html += "<p style=\"margin:4px 0\">Example mutations:</p><ul style=\"margin:4px 0 0;padding-left:16px\">";
    muts.slice(0, 3).forEach((m) => {
      const parts = Object.entries(m.changes).slice(0, 2).map(([k, [a, b]]) => `${k}: ${a} → ${b}`);
      html += `<li>individual ${m.individual}: ${parts.join("; ")}</li>`;
    });
    html += "</ul>";
  }
  $("gaEvents").innerHTML = html;
}

/* ---------- boot ---------- */
initCross();
initLearningCurves();
initFeaturizer();
initNMI();
initNMIReal();
initFRR();
drawArch();
drawJoint();
initJointChart();
initEnsemble();
initGA();
