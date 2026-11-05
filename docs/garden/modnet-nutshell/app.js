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
const lcHidden = { main: new Set(), base: new Set() };

async function initLearningCurves() {
  let modnet, models;
  try {
    [modnet, models] = await Promise.all([
      (await fetch("data/learning_curves.json")).json(),
      (await fetch("data/learning_curves_models.json")).json(),
    ]);
  } catch (e) {
    $("lcChart").parentNode.style.display = "none";
    return;
  }
  const main = [
    { key: "modnet", label: "MODNet", color: "#ff3d5a", data: modnet.models.modnet.mae },
    { key: "random_forest", label: "Random forest", color: "#5a6cff", data: models.models.random_forest.mae },
    { key: "extra_trees", label: "Extra trees", color: "#63e6a4", data: models.models.extra_trees.mae },
    { key: "hist_gb", label: "Hist gradient boosting", color: "#e8a05a", data: models.models.hist_gb.mae },
    { key: "megnet", label: "MEGNet (MatBench ref.)", color: "#a79ba6", dash: "5 4", constant: 0.478 },
  ];
  const base = [
    { key: "allnet", label: "All features", color: "#5a6cff", data: modnet.models.allnet.mae },
    { key: "ridge", label: "Ridge", color: "#45d6ff", data: modnet.models.ridge.mae },
    { key: "dummy", label: "Mean baseline", color: "#63e6a4", data: modnet.models.dummy.mae },
  ];
  drawLC("lcChart", "lcLegend", "main", main, modnet.sizes);
  drawLC("lcBaselineChart", "lcBaselineLegend", "base", base, modnet.sizes);
}

function drawLC(svgId, legendId, group, series, sizes) {
  const svg = $(svgId);
  if (!svg) return;
  const stats = {};
  series.forEach((sr) => {
    if (sr.constant != null) return;
    stats[sr.key] = sizes.map((n) => {
      const vals = sr.data.filter((x) => x[0] === n).map((x) => x[2]);
      if (!vals.length) return null;
      return { mean: vals.reduce((a, v) => a + v, 0) / vals.length, lo: Math.min(...vals), hi: Math.max(...vals) };
    });
  });
  const valsAll = [];
  Object.values(stats).forEach((arr) => arr.forEach((p) => p && valsAll.push(p.lo, p.hi)));
  if (series.some((s) => s.constant != null)) valsAll.push(0.478);
  const ymax = Math.max(...valsAll) * 1.1;
  const W = 900, H = 340, P = { t: 30, r: 20, b: 44, l: 60 };
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
  const yl = el("text", { transform: `translate(12,${(y0 + y1) / 2}) rotate(-90)`, "text-anchor": "middle" });
  yl.textContent = "test MAE (lower is better)"; ax.appendChild(yl);
  svg.appendChild(ax);

  // shade sizes where MODNet beats every shown non-reference model
  if (group === "main" && !lcHidden.main.has("modnet")) {
    sizes.forEach((n, i) => {
      const m = stats.modnet[i];
      if (!m) return;
      const rivals = ["random_forest", "extra_trees", "hist_gb"].filter((k) => !lcHidden.main.has(k) && stats[k] && stats[k][i]);
      if (!rivals.length) return;
      if (rivals.every((k) => m.mean < stats[k][i].mean - 0.001)) {
        const half = i === 0 ? (sx(1) - sx(0)) / 2 : (sx(i) - sx(i - 1)) / 2;
        svg.appendChild(el("rect", { x: sx(i) - half, y: y1, width: 2 * half, height: y0 - y1,
          fill: "rgba(255,61,90,.14)", stroke: "rgba(255,61,90,.35)", "stroke-width": 1 }));
        const t = el("text", { x: sx(i), y: y1 - 6, "text-anchor": "middle", fill: "#ff3d5a", "font-size": 10 });
        t.textContent = "MODNet wins"; svg.appendChild(t);
      }
    });
  }

  series.forEach((sr) => {
    if (lcHidden[group].has(sr.key)) return;
    if (sr.constant != null) {
      svg.appendChild(el("line", { x1: x0, x2: x1, y1: sy(sr.constant), y2: sy(sr.constant),
        stroke: sr.color, "stroke-width": 1.5, "stroke-dasharray": sr.dash || "5 4", opacity: 0.8 }));
      return;
    }
    const pts = stats[sr.key];
    pts.forEach((p, i) => {
      if (!p) return;
      svg.appendChild(el("line", { x1: sx(i), x2: sx(i), y1: sy(p.lo), y2: sy(p.hi), stroke: sr.color, opacity: 0.3 }));
    });
    svg.appendChild(el("path", { class: "series", stroke: sr.color, "stroke-dasharray": sr.dash || "",
      d: pts.map((p, i) => p ? `${i ? "L" : "M"}${sx(i)} ${sy(p.mean)}` : "").join(" ") }));
    pts.forEach((p, i) => p && svg.appendChild(el("circle", { cx: sx(i), cy: sy(p.mean), r: 4, fill: sr.color, class: "dot" })));
  });

  const lg = $(legendId);
  lg.innerHTML = "";
  series.forEach((sr) => {
    const span = document.createElement("span");
    span.style.cursor = "pointer";
    span.style.opacity = lcHidden[group].has(sr.key) ? 0.35 : 1;
    span.innerHTML = `<i class="swatch" style="background:${sr.color};${sr.dash ? "height:0;border-top:2px dashed " + sr.color : ""}"></i>${sr.label}`;
    span.onclick = () => {
      if (lcHidden[group].has(sr.key)) lcHidden[group].delete(sr.key); else lcHidden[group].add(sr.key);
      drawLC(svgId, legendId, group, series, sizes);
    };
    lg.appendChild(span);
  });
}

/* ---------- 1. featurizer explorer ---------- */
let featData = null;
let featMatrix = null;
let featSelected = 0;
let featFilter = "all";

async function initFeaturizer() {
  try {
    featData = await (await fetch("data/featurizer.json")).json();
  } catch (e) {
    $("featValues").innerHTML = '<p class="note">Could not load featurizer data.</p>';
  }
  if (featData && featData.preset_summary) {
    $("featComp").textContent = featData.preset_summary.composition_only.n_features;
    $("featStruct").textContent = featData.preset_summary.with_structure.n_features;
    $("featTotal").textContent = featData.preset_summary.composition_only.n_features +
      featData.preset_summary.with_structure.n_features;
  }
  try {
    const txt = await (await fetch("data/feature_matrix.csv")).text();
    const lines = txt.trim().split("\n");
    const header = lines[0].split(",");
    const rows = lines.slice(1).map((line) => {
      const parts = line.split(",");
      return { material: parts[0], values: parts.slice(1).map(Number) };
    });
    featMatrix = { cols: header.slice(1), rows };
  } catch (e) {
    $("featCanvas").parentNode.innerHTML = '<p class="note">Feature matrix not available.</p>';
    return;
  }

  const filters = [["all", "all"], ["oxide", "oxides"], ["nonoxide", "non-oxides"],
    ["binary", "binary"], ["ternary", "ternary"], ["multi", "multi-element"]];
  const fbox = $("chemFilters");
  filters.forEach(([k, label]) => {
    const b = document.createElement("button");
    b.className = "pill";
    b.textContent = label;
    b.setAttribute("aria-pressed", k === featFilter);
    b.onclick = () => {
      featFilter = k;
      [...fbox.children].forEach((x) => x.setAttribute("aria-pressed", x === b));
      drawFeatMatrix();
    };
    fbox.appendChild(b);
  });

  $("featCanvas").addEventListener("click", (ev) => {
    const rect = ev.target.getBoundingClientRect();
    const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
    const top = 150, cell = 10, left = 120;
    if (y < top || x < left) return;
    const row = Math.floor((y - top) / cell);
    if (row >= 0 && row < Math.min(300, featMatrix.rows.length)) {
      featSelected = row;
      drawFeatMatrix();
    }
  });
  drawFeatMatrix();
}

function formulaStats(formula) {
  const oxide = formula.includes("O");
  const nElem = (formula.match(/[A-Z]/g) || []).length;
  return { oxide, nElem };
}

function matchesFeatFilter(material, f) {
  if (f === "all") return true;
  const { oxide, nElem } = formulaStats(material);
  if (f === "oxide") return oxide;
  if (f === "nonoxide") return !oxide;
  if (f === "binary") return nElem === 2;
  if (f === "ternary") return nElem === 3;
  if (f === "multi") return nElem >= 4;
  return true;
}

function drawFeatMatrix() {
  if (!featMatrix) return;
  const rowsAll = featMatrix.rows;
  const nRows = Math.min(300, rowsAll.length);
  const rows = rowsAll.slice(0, nRows);
  const cols = featMatrix.cols;
  const nCols = cols.length;
  const left = 120, top = 150, cell = 10;
  const canvas = $("featCanvas");
  canvas.width = left + nCols * cell;
  canvas.height = top + nRows * cell;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#0d090d";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const stats = cols.map((_, j) => {
    const vals = rows.map((r) => r.values[j]).filter((v) => Number.isFinite(v));
    const m = vals.reduce((a, v) => a + v, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, v) => a + (v - m) ** 2, 0) / vals.length) || 1;
    return { m, sd };
  });

  // diagonal column labels
  ctx.save();
  ctx.font = "8px Inter, sans-serif";
  ctx.fillStyle = "#a79ba6";
  cols.forEach((c, j) => {
    ctx.save();
    ctx.translate(left + j * cell + cell / 2, top - 6);
    ctx.rotate(-Math.PI / 4);
    ctx.textAlign = "left";
    ctx.fillText(c.split("|").slice(0, 2).join(" ").slice(0, 34), 0, 0);
    ctx.restore();
  });
  ctx.restore();

  rows.forEach((r, i) => {
    const dim = !matchesFeatFilter(r.material, featFilter);
    if (i === featSelected) {
      ctx.fillStyle = "rgba(255,61,90,.18)";
      ctx.fillRect(0, top + i * cell, canvas.width, cell);
    }
    ctx.font = "9px Inter, sans-serif";
    ctx.fillStyle = dim ? "rgba(167,155,166,.25)" : (i === featSelected ? "#ff3d5a" : "#a79ba6");
    ctx.textAlign = "right";
    ctx.fillText(r.material.slice(0, 18), left - 6, top + i * cell + 8);
    for (let j = 0; j < nCols; j++) {
      const v = r.values[j];
      let alpha = 0.06;
      let col = "rgba(255,255,255,.04)";
      if (Number.isFinite(v)) {
        const z = (v - stats[j].m) / stats[j].sd;
        alpha = Math.min(0.9, Math.abs(z) / 2.5 * 0.9);
        col = z >= 0 ? `rgba(255,61,90,${alpha})` : `rgba(90,108,255,${alpha})`;
      }
      ctx.fillStyle = col;
      ctx.fillRect(left + j * cell, top + i * cell, cell - 1, cell - 1);
    }
  });

  $("featScale").innerHTML = '<span><i class="swatch" style="background:#5a6cff"></i>below mean</span>' +
    '<span><i class="swatch" style="background:#ff3d5a"></i>above mean</span>' +
    `<span>color = per-descriptor z-score, clamped ±2.5 · showing ${nRows} of ${rowsAll.length} sampled materials, all ${nCols} descriptors</span>`;

  const sel = rows[featSelected];
  if (!sel) return;
  const scored = cols.map((c, j) => ({
    col: c, v: sel.values[j],
    z: Number.isFinite(sel.values[j]) ? (sel.values[j] - stats[j].m) / stats[j].sd : 0,
  })).filter((x) => Number.isFinite(x.v))
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 8);
  $("featValues").innerHTML = `<table><thead><tr><th>descriptor</th><th>${sel.material}</th><th>z</th></tr></thead><tbody>` +
    scored.map((x) => `<tr><td title="${x.col}">${x.col.length > 46 ? x.col.slice(0, 46) + "…" : x.col}</td><td>${x.v.toPrecision(4)}</td><td>${x.z.toFixed(2)}</td></tr>`).join("") +
    "</tbody></table>";
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
      // rotate an independent cloud: the picture moves, the dependence does not
      const x0 = gauss(r), y0 = gauss(r);
      const a = dep * Math.PI;
      const xr = x0 * Math.cos(a) - y0 * Math.sin(a);
      const yr = x0 * Math.sin(a) + y0 * Math.cos(a);
      pts.push([xr, yr]);
      continue;
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

  const lastRank = last ? frrReal.rankByFeat[last] : null;
  $("frrInterp").textContent = lastRank && lastRank.interpretation
    ? `Last pick — ${last.split("|").slice(0, 2).join(" · ")}: ${lastRank.interpretation}`
    : (last ? `Last pick — ${last.split("|").slice(0, 2).join(" · ")}` : "Click “next feature” to run the selection.");
  $("frrStep").textContent = frr.selected.length;
  $("frrP").textContent = frr.last && frr.last.p != null ? Number(frr.last.p).toFixed(2) : "–";
  $("frrC").textContent = frr.last && frr.last.c != null ? Number(frr.last.c).toExponential(1) : "–";
  $("frrScore").textContent = frr.last && frr.last.score != null ? Number(frr.last.score).toFixed(2) : "–";
  $("frrList").innerHTML = frr.selected.slice(-8).reverse().map((s) =>
    `<li>${s.split("|").slice(0, 2).join(" · ")} — NMI ${(frrNmi[s] || 0).toFixed(3)}</li>`).join("");
  drawFRRScores();
}

function drawFRRScores() {
  const svg = $("frrScores");
  if (!svg) return;
  const n = frr.selected.length;
  const p = frr.last && frr.last.p != null ? Number(frr.last.p) : Math.max(0.1, 4.5 - Math.pow(n, 0.4));
  const c = frr.last && frr.last.c != null ? Number(frr.last.c) : 1e-6 * Math.pow(n, 3);
  const selected = new Set(frr.selected);
  const rows = frrReal.cands.filter((f) => !selected.has(f)).map((f) => {
    let maxRed = 0;
    frr.selected.forEach((s) => { maxRed = Math.max(maxRed, frrReal.M[frrReal.cands.indexOf(f)][frrReal.cands.indexOf(s)]); });
    return { f, score: (frrNmi[f] || 0) / (Math.pow(maxRed, p) + c) };
  }).sort((a, b) => b.score - a.score).slice(0, 10);
  const W = 440, H = 220, left = 120, top = 16, rowH = 18;
  const max = Math.max(...rows.map((r) => r.score), 1e-9);
  svg.innerHTML = "";
  rows.forEach((r, i) => {
    const y = top + i * rowH;
    const w = (r.score / max) * (W - left - 70);
    svg.appendChild(el("rect", { x: left, y, width: Math.max(1, w), height: 12, rx: 2, fill: "#ff3d5a", opacity: 0.75 }));
    const t = el("text", { x: left - 6, y: y + 10, "text-anchor": "end", fill: "#a79ba6", "font-size": 8 });
    t.textContent = r.f.split("|").slice(0, 2).join(" ").slice(0, 26); svg.appendChild(t);
    const v = el("text", { x: left + w + 6, y: y + 10, fill: "#eee9ee", "font-size": 8 });
    v.textContent = r.score.toFixed(2); svg.appendChild(v);
  });
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

  const lastRank = last ? frrReal.rankByFeat[last] : null;
  $("frrInterp").textContent = lastRank && lastRank.interpretation
    ? `Last pick — ${last.split("|").slice(0, 2).join(" · ")}: ${lastRank.interpretation}`
    : (last ? `Last pick — ${last.split("|").slice(0, 2).join(" · ")}` : "Click “next feature” to run the selection.");
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
