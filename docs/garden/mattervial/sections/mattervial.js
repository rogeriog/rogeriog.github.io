/* MatterVial section: MATerials feaTuRe Extraction Via Interpretable Artificial Learning.
 * Sources: Gouvêa, De Breuck, Pretto, Rignanese, Santos, npj Comput. Mater. 12, 67 (2026) (Tables 1-2, Figs 1-5);
 * MatterVial repo v0.1.5 (README, interpreter/formulas/all_formulas.json, interpreter/shap_values/*);
 * WelT decks (19 Mar 2026, 2 Jun 2026); in-house embedding benchmark for the static elemental embeddings.
 * See briefs/mattervial.md for the provenance of every number. Toy parts are labelled "schematic"/"toy". */
(function () {
  'use strict';
  const W = window.WELT;
  const h = W.h;
  const tok = (n) => W.css(n);
  const li = (html) => h('li', { html });
  const btn = (label, onclick, ghost, extra) =>
    h('button', Object.assign({ type: 'button', class: 'btn' + (ghost ? ' ghost' : ''), onclick }, extra || {}), label);
  const FIG = 'assets/figs/mattervial/';
  const CITE = 'Gouvêa <i>et al.</i>, <i>npj Comput. Mater.</i> 12, 67 (2026)';

  // canvas click → CSS-pixel coordinates inside the canvas
  function evPos(canvas, e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function inRect(p, r) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }
  function font(px, weight, mono) { return (weight || 400) + ' ' + px + 'px ' + (mono ? tok('--f-mono') : tok('--f-body')); }
  function fitText(ctx, s, maxW) {
    if (ctx.measureText(s).width <= maxW) return s;
    while (s.length > 2 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  }

  /* =====================================================================
   * Chapter 1: the gap + what a latent GNN feature is (schematic network)
   * ===================================================================== */
  function chIdea(el) {
    const cmp = h('div', { class: 'mv-cmp' },
      h('div', { class: 'mv-cmp-col' }, h('div', { class: 'mv-cmp-h' }, 'Feature-based (MODNet, …)'),
        h('ul', null, li('Good accuracy on <strong>small datasets</strong>'), li('Easy to link features to the property'),
          li('Needs <strong>slow descriptors</strong> (MatMiner, OFM, SOAP) to compete on large data'))),
      h('div', { class: 'mv-cmp-col' }, h('div', { class: 'mv-cmp-h' }, 'Graph neural networks'),
        h('ul', null, li('Learn structure–property relations directly'), li('<strong>High accuracy</strong> on large datasets'),
          li('<strong>Hard to read</strong>: chemistry stays hidden in the weights'))));
    const prose = h('div', { class: 'prose' }, cmp,
      W.ui.callout('<strong>MatterVial</strong> reads the hidden layers of <strong>pretrained GNNs</strong> and hands them to a feature-based model as ordinary descriptor columns. An Interpreter maps each latent column back to a formula of physical descriptors.'),
      h('p', { class: 'hint', html: '<b>MAT</b>erials fea<b>T</b>u<b>R</b>e <b>E</b>xtraction <b>V</b>ia <b>I</b>nterpretable <b>A</b>rtificial <b>L</b>earning. The diagram is a schematic: toy weights; only the element inputs (χ, period, valence electrons) are real.' }));

    /* Toy GNN, computed for real (schematic weights, seeded):
     *   h_i⁰ = tanh(E·x_i)                                  x_i = [χ_Pauling, period, valence e⁻] (scaled)
     *   h_i^{t+1} = tanh(W_s·h_i^t + W_m·(1/|N(i)|)·Σ_{j∈N(i)} h_j^t),  t = 0,1   (message passing)
     *   g = (1/N)·Σ_i h_i                                   (global average pooling)
     *   z₃₂ = ReLU(A·g + a),  z₁₆ = ReLU(B·z₃₂ + b),  y = c·z₁₆ + c₀   (MLP readout, as in MEGNet 32→16→1)
     * MatterVial's MVL featurizer keeps z₃₂ ("layer32") and z₁₆ ("layer16") as feature columns. */
    const D = 8;
    const ELEM = { Ni: [1.91, 4, 10], Cu: [1.90, 4, 11], Au: [2.54, 6, 11] };
    const xOf = (e) => { const v = ELEM[e]; return [(v[0] - 2.1) / 0.35, (v[1] - 5) / 1, (v[2] - 10.5) / 0.5]; };
    const STRUCTS = { Cu: ['Cu', 'Cu', 'Cu', 'Cu', 'Cu', 'Cu'], Ni: ['Ni', 'Ni', 'Ni', 'Ni', 'Ni', 'Ni'],
      CuAu: ['Cu', 'Au', 'Cu', 'Au', 'Cu', 'Au'], NiAu: ['Ni', 'Au', 'Ni', 'Au', 'Ni', 'Au'] };
    const SNAMES = Object.keys(STRUCTS);
    // 6-node graph: hexagonal ring + two cross bonds
    const EDGES = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 3], [1, 4]];
    const NB = Array.from({ length: 6 }, () => []);
    EDGES.forEach(([a, b]) => { NB[a].push(b); NB[b].push(a); });
    const r = W.rng(20260115);
    const gauss = () => { let s = 0; for (let k = 0; k < 4; k++) s += r(); return (s - 2) * 1.2; };
    const mat = (m, n, sc) => Array.from({ length: m }, () => Array.from({ length: n }, () => gauss() * sc));
    const Emb = mat(D, 3, 0.9), Ws = mat(D, D, 0.45), Wm = mat(D, D, 0.45);
    const A = mat(32, D, 0.8), a0 = Array.from({ length: 32 }, () => 0.15 + gauss() * 0.1);
    const B = mat(16, 32, 0.35), b0 = Array.from({ length: 16 }, () => 0.1 + gauss() * 0.1);
    const C = Array.from({ length: 16 }, () => gauss() * 0.6);
    const mv = (M, v) => M.map((row) => row.reduce((s, w, j) => s + w * v[j], 0));
    function forward(sp) {
      let H = sp.map((e) => mv(Emb, xOf(e)).map(Math.tanh));
      for (let t = 0; t < 2; t++) {
        H = H.map((hi, i) => {
          const m = new Array(D).fill(0);
          NB[i].forEach((j) => H[j].forEach((v, k) => (m[k] += v / NB[i].length)));
          const s = mv(Ws, hi), q = mv(Wm, m);
          return s.map((v, k) => Math.tanh(v + q[k]));
        });
      }
      const g = new Array(D).fill(0);
      H.forEach((hi) => hi.forEach((v, k) => (g[k] += v / H.length)));
      const z32 = mv(A, g).map((v, k) => Math.max(0, v + a0[k]));
      const z16 = mv(B, z32).map((v, k) => Math.max(0, v + b0[k]));
      const y = z16.reduce((s, v, k) => s + v * C[k], 0);
      return { H, g, z32, z16, y };
    }
    const RES = {}; SNAMES.forEach((s) => (RES[s] = forward(STRUCTS[s])));

    const st = { s: 'NiAu', stage: 3, sel: { layer: 32, i: 2 }, per: 'struct', pulse: 0, playing: false };
    const STAGES = ['Crystal graph', 'Message passing', 'Pooling', 'MLP readout'];
    let hits = [];
    const host = h('div', { class: 'mv-cv' });
    const cv = W.canvas(host, draw, { aspect: window.innerWidth < 600 ? 0.72 : 0.44, label: 'Schematic graph neural network: crystal graph, node embeddings, pooled vector, 32- and 16-neuron layers, output' });
    cv.canvas.style.cursor = 'pointer';

    function cellColor(v, vmax) {
      const t = Math.max(-1, Math.min(1, v / (vmax || 1)));
      return { col: t >= 0 ? tok('--p') : tok('--warn'), a: 0.12 + 0.88 * Math.abs(t) };
    }
    function draw(ctx, w, hh) {
      const R = RES[st.s], fg = tok('--fg'), mu = tok('--muted'), line = tok('--line'), p = tok('--p'), s2 = tok('--surface-2');
      hits = [];
      const narrow = w < 560;
      const topY = 26, botY = hh - 10, H0 = botY - topY;
      // column x positions (fractions of width)
      const xs = narrow ? [0.0, 0.33, 0.50, 0.62, 0.78, 0.93] : [0.0, 0.30, 0.47, 0.60, 0.75, 0.90];
      const X = xs.map((f) => f * w);
      const dim = (k) => (st.per === 'atom' && k >= 2 ? 0.25 : 1);
      const hl = (k) => (k === st.stage || (st.stage === 1 && k === 1));
      ctx.textBaseline = 'alphabetic';
      ctx.font = font(narrow ? 11 : 14, 700);
      const heads = [['Graph', 0], ['Nodes h', 1], ['Pool', 2], ['layer32', 3], ['layer16', 3], ['y', 3]];
      heads.forEach(([t, k], i) => {
        ctx.globalAlpha = (i >= 2 ? dim(2) : 1);
        ctx.fillStyle = (hl(k) && st.stage === k) || (k === 3 && st.stage === 3) ? p : mu;
        if (i === 1 && st.stage === 1) ctx.fillStyle = p;
        if (i === 2 && st.stage === 2) ctx.fillStyle = p;
        ctx.fillText(t, X[i] + (i === 0 ? 4 : 0), 18);
      });
      ctx.globalAlpha = 1;
      // --- graph ---
      const gw = X[1] - X[0] - 14, cx = X[0] + gw / 2 + 4, cy = topY + H0 / 2, rad = Math.min(gw, H0) * 0.36;
      const pos = STRUCTS[st.s].map((e, i) => ({ x: cx + rad * Math.cos(Math.PI / 2 + i * Math.PI / 3), y: cy - rad * Math.sin(Math.PI / 2 + i * Math.PI / 3), e }));
      ctx.lineWidth = 2;
      EDGES.forEach(([a, b]) => {
        ctx.strokeStyle = st.stage === 1 ? p : line; ctx.globalAlpha = st.stage === 1 ? 0.7 : 1;
        ctx.beginPath(); ctx.moveTo(pos[a].x, pos[a].y); ctx.lineTo(pos[b].x, pos[b].y); ctx.stroke();
      });
      ctx.globalAlpha = 1;
      if (st.stage === 1) { // message pulses travel along every edge in both directions
        const f = st.pulse % 1;
        ctx.fillStyle = tok('--p2');
        EDGES.forEach(([a, b]) => {
          [[a, b], [b, a]].forEach(([u, v]) => {
            const px = pos[u].x + (pos[v].x - pos[u].x) * f, py = pos[u].y + (pos[v].y - pos[u].y) * f;
            ctx.beginPath(); ctx.arc(px, py, 3, 0, 7); ctx.fill();
          });
        });
      }
      const nr = Math.max(10, Math.min(18, rad * 0.32));
      const ecol = { Ni: tok('--mv-task'), Cu: tok('--mv-desc'), Au: tok('--warn') };
      pos.forEach((q) => {
        ctx.fillStyle = ecol[q.e]; ctx.beginPath(); ctx.arc(q.x, q.y, nr, 0, 7); ctx.fill();
        ctx.strokeStyle = st.stage === 0 ? fg : tok('--surface'); ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = font(Math.round(nr * 0.85), 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(q.e, q.x, q.y + 1);
      });
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      // --- node matrix (N x D) ---
      const mW = X[2] - X[1] - 12, cwd = mW / D, chh = Math.min(22, H0 / 8);
      const my0 = cy - (6 * chh) / 2;
      R.H.forEach((row, i) => row.forEach((v, k) => {
        const c = cellColor(v, 1); ctx.fillStyle = c.col; ctx.globalAlpha = c.a;
        ctx.fillRect(X[1] + k * cwd, my0 + i * chh, cwd - 1, chh - 1);
      }));
      ctx.globalAlpha = 1;
      if (st.per === 'atom' || st.stage === 1) { ctx.strokeStyle = p; ctx.lineWidth = 2; ctx.strokeRect(X[1] - 2, my0 - 2, mW + 3, 6 * chh + 3); }
      ctx.fillStyle = mu; ctx.font = font(narrow ? 10 : 13, 400, true);
      ctx.fillText(st.per === 'atom' ? 'N×d output' : '6 × ' + D, X[1], my0 + 6 * chh + 14);
      // --- pooled g (vertical) ---
      const vh = (n) => Math.min(H0 / n, 22);
      const colW = Math.max(10, Math.min(26, w * 0.035));
      ctx.globalAlpha = dim(2);
      const gy0 = cy - (D * vh(D)) / 2;
      R.g.forEach((v, k) => { const c = cellColor(v, 1); ctx.fillStyle = c.col; ctx.globalAlpha = c.a * dim(2); ctx.fillRect(X[2], gy0 + k * vh(D), colW, vh(D) - 1); });
      if (st.stage === 2) { ctx.globalAlpha = 1; ctx.strokeStyle = p; ctx.lineWidth = 2; ctx.strokeRect(X[2] - 2, gy0 - 2, colW + 4, D * vh(D) + 3); }
      // arrows between columns
      ctx.globalAlpha = 0.6 * dim(2); ctx.strokeStyle = mu; ctx.lineWidth = 1.2;
      [[X[1] + mW + 2, X[2] - 4], [X[2] + colW + 4, X[3] - 4], [X[3] + colW + 4, X[4] - 4], [X[4] + colW + 4, X[5] - 4]].forEach(([x1, x2]) => {
        ctx.beginPath(); ctx.moveTo(x1, cy); ctx.lineTo(x2, cy); ctx.lineTo(x2 - 5, cy - 4); ctx.moveTo(x2, cy); ctx.lineTo(x2 - 5, cy + 4); ctx.stroke();
      });
      // --- z32, z16 ---
      const drawLayer = (vals, x, layer) => {
        const n = vals.length, ch = vh(n), y0 = cy - (n * ch) / 2, vmax = Math.max(...vals, 1e-6);
        vals.forEach((v, k) => {
          ctx.globalAlpha = dim(2) * (0.1 + 0.9 * v / vmax); ctx.fillStyle = p;
          ctx.fillRect(x, y0 + k * ch, colW, ch - 1);
          ctx.globalAlpha = dim(2) * 0.6; ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y0 + k * ch + 0.5, colW - 1, ch - 2);
          hits.push({ x: x - 4, y: y0 + k * ch, w: colW + 8, h: ch, layer, i: k });
          if (st.sel.layer === layer && st.sel.i === k) {
            ctx.globalAlpha = 1; ctx.strokeStyle = fg; ctx.lineWidth = 2.5; ctx.strokeRect(x - 2, y0 + k * ch - 1, colW + 4, ch + 1);
            ctx.fillStyle = fg; ctx.font = font(narrow ? 10 : 12, 700, true);
            ctx.beginPath(); ctx.moveTo(x + colW + 4, y0 + k * ch + ch / 2); ctx.lineTo(x + colW + 12, y0 + k * ch + ch / 2 - 5); ctx.lineTo(x + colW + 12, y0 + k * ch + ch / 2 + 5); ctx.fill();
          }
        });
        if (st.stage === 3) { ctx.globalAlpha = dim(2); ctx.strokeStyle = p; ctx.lineWidth = 2; ctx.strokeRect(x - 3, y0 - 3, colW + 6, n * ch + 5); }
      };
      drawLayer(R.z32, X[3], 32);
      drawLayer(R.z16, X[4], 16);
      // --- output y ---
      ctx.globalAlpha = dim(2);
      ctx.fillStyle = tok('--mv-adj'); ctx.beginPath(); ctx.arc(X[5] + colW / 2, cy, colW * 0.6, 0, 7); ctx.fill();
      ctx.fillStyle = fg; ctx.font = font(narrow ? 11 : 15, 600, true); ctx.textAlign = 'center';
      ctx.fillText(R.y.toFixed(2), X[5] + colW / 2, cy + colW + 8);
      ctx.fillStyle = mu; ctx.font = font(narrow ? 10 : 13, 400);
      ctx.fillText('toy Eform', X[5] + colW / 2, cy + colW + 26);
      ctx.textAlign = 'left'; ctx.globalAlpha = 1;
      if (st.per === 'atom') {
        ctx.fillStyle = p; ctx.font = font(narrow ? 11 : 13, 700);
        ctx.fillText('AtomicFeaturizer keeps one row per atom', X[2], botY - 4);
      }
    }
    cv.canvas.addEventListener('click', (e) => {
      const q = evPos(cv.canvas, e);
      const hit = hits.find((r0) => inRect(q, r0));
      if (hit) { st.sel = { layer: hit.layer, i: hit.i }; if (st.per === 'atom') { st.per = 'struct'; perSeg.set('struct'); } st.stage = 3; stageSeg.set('3'); refresh(); }
    });

    const nameEl = h('div', { class: 'mv-featname tnum' });
    const tblHost = h('div');
    function refresh() {
      cv.redraw();
      const L = st.sel.layer, i = st.sel.i;
      if (st.per === 'atom') {
        nameEl.innerHTML = 'Per-atom mode: the node matrix (N atoms × d) is the output, before any pooling. See chapter 6.';
        tblHost.innerHTML = '';
        return;
      }
      const name = 'MVL' + L + '_Eform_MP_2019_' + (i + 1);
      nameEl.innerHTML = 'Selected neuron → feature column <code>' + name + '</code>';
      const rows = SNAMES.map((s) => {
        const v = (L === 32 ? RES[s].z32 : RES[s].z16)[i];
        return [(s === st.s ? '<b>' : '') + s + ' (toy)' + (s === st.s ? '</b>' : ''), v.toFixed(3), RES[s].y.toFixed(2)];
      });
      tblHost.innerHTML = '';
      tblHost.appendChild(W.ui.table(['structure', name, 'toy output y'], rows, [1, 2]));
    }
    const sSeg = W.ui.seg(SNAMES.map((s) => ({ value: s, label: s })), st.s, (v) => { st.s = v; refresh(); }, 'Toy structure');
    const stageSeg = W.ui.seg(STAGES.map((s, i) => ({ value: String(i), label: (i + 1) + ' ' + s })), '3', (v) => { st.stage = +v; if (st.internal) return; stopPlay(); refresh(); }, 'Pipeline stage');
    const setStage = (v) => { st.internal = true; stageSeg.set(String(v)); st.internal = false; };
    const perSeg = W.ui.seg([{ value: 'struct', label: 'One vector per structure' }, { value: 'atom', label: 'N×d per structure' }], 'struct', (v) => { st.per = v; refresh(); }, 'Output granularity');
    let stopFn = null;
    const playBtn = btn(W.reduceMotion ? 'Next stage' : '▶ Play pipeline', () => {
      if (W.reduceMotion) { st.stage = (st.stage + 1) % 4; setStage(st.stage); refresh(); return; }
      if (st.playing) stopPlay(); else startPlay();
    }, true);
    function stopPlay() { if (stopFn) stopFn(); stopFn = null; st.playing = false; playBtn.textContent = '▶ Play pipeline'; }
    function startPlay() {
      st.playing = true; playBtn.textContent = '❚❚ Pause'; let tAcc = 0;
      st.stage = 0; setStage(0);
      stopFn = W.raf((dt) => {
        tAcc += dt; st.pulse += dt * 1.4;
        const target = Math.min(3, Math.floor(tAcc / 1.6));
        if (target !== st.stage) { st.stage = target; setStage(target); }
        if (tAcc > 1.6 * 4) { stopPlay(); refresh(); }
        cv.redraw();
      });
    }

    const stage = W.ui.stage('What is a latent GNN feature? (schematic)',
      h('div', { class: 'ctrl-row' }, sSeg.el, playBtn),
      h('div', { class: 'ctrl-row' }, stageSeg.el),
      host,
      h('div', { class: 'ctrl-row' }, perSeg.el),
      nameEl, tblHost,
      h('p', { class: 'hint', html: 'Click any cell of layer32 or layer16. Each neuron gives one number per structure, so across a dataset it is a feature column. Same toy weights for all structures.' }));
    el.appendChild(h('div', { class: 'bench' }, prose, stage));
    refresh();
  }

  /* =====================================================================
   * Chapter 2: three families → one feature vector (real sizes)
   * ===================================================================== */
  const FAM = [
    { id: 'lofm', name: 'ℓ-OFM', n: 188, cls: 'desc', type: 'I · descriptor-oriented',
      how: 'Autoencoder bottleneck of the Orbital Field Matrix, predicted from the structure by a MEGNet proxy. Decodable back to OFM.',
      code: "from mattervial import DescriptorMEGNetFeaturizer\ndesc_ofm = DescriptorMEGNetFeaturizer(base_descriptor='l-OFM_v1')\nl_ofm = desc_ofm.get_features(structures)   # 188 cols: MEGNet_OFMEncoded_v1_X" },
    { id: 'mvl', name: 'MVL', n: 288, cls: 'task', type: 'II · task-oriented',
      how: '32- and 16-neuron readout layers of the pretrained MVL MEGNet models (formation energy, Fermi energy, band gap, metal/non-metal classifier, log K, log G). Size from the current code: six models.',
      code: "from mattervial import MVLFeaturizer\nmvl_all = MVLFeaturizer()                   # layer32 + layer16 (default)\nmvl32   = MVLFeaturizer(layers='layer32')\nfeatures = mvl_all.get_features(structures)  # cols: MVL32_Eform_MP_2019_X, MVL16_…" },
    { id: 'roost', name: 'ROOST', n: 256, cls: 'roost', type: 'II · task-oriented',
      how: 'Composition-only, attention-based message passing. Two pretrained models (MP band gap, OQMD formation energy), 2 × 128 features.',
      code: "from mattervial import RoostModelFeaturizer\nroost_mpgap      = RoostModelFeaturizer(model_type='mpgap')\nroost_oqmd_eform = RoostModelFeaturizer(model_type='oqmd_eform')\nfeatures = roost_mpgap.get_features(pd.Series([\"Fe2O3\", \"Al2O3\"]))" },
    { id: 'orb', name: 'ORB-v3', n: 1792, cls: 'orb', type: 'II · task-oriented',
      how: 'Equivariant MLIP trained on ~120 M calculated structures. Atom embeddings mean-pooled at 7 blocks × 256. Runs in its own conda env.',
      code: "from mattervial import ORBFeaturizer\norb_featurizer = ORBFeaturizer(model_name=\"ORB_v3\")\norb_features = orb_featurizer.get_features(structures)   # 1792 cols" },
    { id: 'sisso', name: 'SISSO', n: 20, cls: 'sisso', type: 'III · symbolic',
      how: 'Rung-1 SISSO++ formulas of MatMiner features, 20 per dataset, 15 datasets shipped. Example (log K<sub>VRH</sub>): GRDF mean (3.0 Å) + density.',
      code: "from mattervial.featurizers import get_sisso_features\nsisso_df = get_sisso_features(input_csv_path=\"dataset_MatMinerFeaturized.csv\",\n                              type=\"SISSO_FORMULAS_v1\")   # cols: SISSO_<dataset>_<i>" },
    { id: 'adj', name: 'Adjacent GNN', n: 48, cls: 'adj', type: 'II · trained on your task',
      how: 'A MEGNet trained on the fly on each training fold, then read out like MVL (32 + 16). The paper also used coGN (KGCNN env).',
      code: "from mattervial import AdjacentGNNFeaturizer\nadj_gnn = AdjacentGNNFeaturizer(base_model='MEGNet', layers='layer32')\nadj_gnn.train_adjacent_model(structures, targets=targets, adjacent_model_path='./models/')\nfeatures_adj = adj_gnn.get_features(structures)" },
  ];
  const BASE = {
    mm: { name: 'MatMiner', n: 1336, cls: 'mm', type: 'classic descriptors', how: 'Default MatMiner featurizer of MODNet v0.1.13 (1336 features). Slow for structural descriptors.', code: '# classic route: MODNet / matminer featurization of the structures (slow step)' },
    lmm: { name: 'ℓ-MM', n: 758, cls: 'desc', type: 'I · descriptor-oriented',
      how: 'Autoencoder bottleneck of the 1336 MatMiner features (MP2018-stable, 106,113 structures), predicted by a MEGNet proxy. Decodable.',
      code: "from mattervial import DescriptorMEGNetFeaturizer\ndesc_mm = DescriptorMEGNetFeaturizer(base_descriptor='l-MM_v1')\nl_mm = desc_mm.get_features(structures)     # 758 cols: MEGNet_MatMiner_X" },
  };

  function chFamilies(el) {
    const st = { base: 'lmm', on: { lofm: true, mvl: true, roost: true, orb: true, sisso: true, adj: false }, focus: 'orb' };
    const prose = h('div', { class: 'prose' },
      h('ul', null,
        li('<strong>I · Descriptor-oriented.</strong> Compress an expensive descriptor (MatMiner, OFM) with an autoencoder. Train a GNN to predict the latent vector from the structure. Fast, and still decodable.'),
        li('<strong>II · Task-oriented.</strong> Read activations of GNNs pretrained on large data: MVL MEGNet, ROOST, ORB-v3. Or train an <em>adjacent</em> GNN on your own task.'),
        li('<strong>III · Symbolic.</strong> SISSO formulas built from MatMiner features.')),
      W.ui.fig(FIG + 'paper_fig1_overview.jpg', 'Fig. 1 of ' + CITE + ' (CC BY).', 'MatterVial overview: descriptor-oriented GNNs, task-oriented GNNs, symbolically derived features feeding one feature vector'));

    const cards = h('div', { class: 'mv-cards' });
    const detail = h('div', { class: 'mv-detail' });
    const totalEl = h('div', { class: 'mv-total tnum' });
    const host = h('div', { class: 'mv-cv' });
    const cv = W.canvas(host, draw, { height: 96, label: 'Stacked bar of feature-vector length by MatterVial group' });
    const MAXN = 1336 + FAM.reduce((s, f) => s + f.n, 0);
    function parts() {
      const out = [Object.assign({ id: st.base }, BASE[st.base])];
      FAM.forEach((f) => { if (st.on[f.id]) out.push(f); });
      return out;
    }
    function draw(ctx, w, hh) {
      const P = parts(), tot = P.reduce((s, f) => s + f.n, 0);
      const x0 = 2, bw = w - 4, y = 30, bh = 34;
      ctx.fillStyle = tok('--surface-2'); ctx.fillRect(x0, y, bw, bh);
      let x = x0;
      P.forEach((f) => {
        const ww = (f.n / MAXN) * bw;
        ctx.fillStyle = tok('--mv-' + f.cls); ctx.fillRect(x, y, Math.max(1, ww - 1), bh);
        if (f.id === st.focus) { ctx.strokeStyle = tok('--fg'); ctx.lineWidth = 2.5; ctx.strokeRect(x + 1, y - 2, Math.max(2, ww - 3), bh + 4); }
        ctx.font = font(12, 700);
        if (ww > ctx.measureText(f.name).width + 10) { ctx.fillStyle = '#fff'; ctx.fillText(f.name, x + 5, y + bh / 2 + 4); }
        x += ww;
      });
      // XGB-RFE preselection marker at 800 features
      const xm = x0 + (800 / MAXN) * bw;
      ctx.strokeStyle = tok('--fg'); ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(xm, y - 8); ctx.lineTo(xm, y + bh + 8); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = tok('--fg'); ctx.font = font(13, 600);
      ctx.fillText('800: XGBoost-RFE preselection, then MODNet selection', Math.min(xm + 6, w - 330 > xm + 6 ? xm + 6 : Math.max(2, w - 330)), y - 12 < 12 ? 12 : y - 12);
      ctx.fillStyle = tok('--muted'); ctx.font = font(11, 400, true);
      ctx.fillText('0', x0, y + bh + 18);
      const lab = MAXN.toLocaleString('en-US') + ' (all groups)';
      ctx.textAlign = 'right'; ctx.fillText(lab, x0 + bw, y + bh + 18); ctx.textAlign = 'left';
      totalEl.innerHTML = '<b>' + tot.toLocaleString('en-US') + '</b> features in the vector · ' + P.map((f) => f.name + ' ' + f.n).join(' + ');
    }
    function renderCards() {
      cards.innerHTML = '';
      const baseSeg = W.ui.seg([{ value: 'mm', label: 'MatMiner · 1336' }, { value: 'lmm', label: 'ℓ-MM · 758' }], st.base,
        (v) => { st.base = v; st.focus = v; update(); }, 'Base descriptor');
      cards.appendChild(h('div', { class: 'mv-basecard' }, h('span', { class: 'hint' }, 'Base'), baseSeg.el));
      FAM.forEach((f) => {
        const b = h('button', { type: 'button', class: 'mv-card', 'aria-pressed': String(!!st.on[f.id]), 'data-cls': f.cls,
          onclick: () => { st.on[f.id] = !st.on[f.id]; st.focus = f.id; update(); } },
          h('span', { class: 'mv-sw' }), h('span', { class: 'mv-card-n' }, f.name), h('span', { class: 'mv-card-c tnum' }, String(f.n)));
        cards.appendChild(b);
      });
    }
    function update() {
      renderCards();
      cv.redraw();
      const f = FAM.find((x) => x.id === st.focus) || BASE[st.focus];
      detail.innerHTML = '';
      detail.appendChild(h('div', { class: 'mv-detail-h' }, h('span', { class: 'mv-dot', 'data-cls': f.cls }), h('b', null, f.name), h('span', { class: 'hint' }, ' · ' + f.type + ' · ' + f.n + ' features')));
      detail.appendChild(h('p', { html: f.how }));
      detail.appendChild(W.ui.code(f.code, 'python'));
    }
    const stage = W.ui.stage('Build the feature vector (real group sizes)',
      cards, host, totalEl, detail,
      h('p', { class: 'hint', html: 'Click a group to add or remove it and show its API. Sizes: README and code (MVL: six models in the current code; the paper used five). Adjacent: one MEGNet, 32 + 16.' }));
    el.appendChild(h('div', { class: 'bench' }, prose, stage));
    update();
  }

  /* =====================================================================
   * Chapter 3: MatBench v0.1 (PAPER Table 1)
   * ===================================================================== */
  // [task, n, metric, cls?, baseline, MM+MV, MV, record value|null, record model, best groups, unit]
  const T1 = [
    ['Steels yield strength', 312, 'MAE', 0, 87.76, 85.12, 120.95, null, 'MODNet', 'ROOST', 'MPa'],
    ['E<sub>exfol</sub>', 636, 'MAE', 0, 33.19, 29.19, 28.86, null, 'MODNet', 'ORB, MVL, ℓ-OFM, ℓ-MM', 'meV/atom'],
    ['argmax(PhDOS)', 1265, 'MAE', 0, 34.27, 30.08, 30.58, '28.76', 'MEGNet', 'MVL, ORB, ℓ-OFM, ROOST, SISSO', 'cm⁻¹'],
    ['Exp. band gap', 4604, 'MAE', 0, 0.333, '0.290', 0.351, null, 'MODNet', 'ROOST, SISSO', 'eV'],
    ['Refractive index', 4764, 'MAE', 0, 0.271, 0.235, 0.234, null, 'MODNet', 'ORB, ℓ-OFM, MVL, ℓ-MM', ''],
    ['Exp. metallicity', 4921, 'AUROC', 1, 0.916, 0.976, 0.898, '0.921', 'AMMExpress', 'ROOST', ''],
    ['Glass-forming ability', 5680, 'AUROC', 1, 0.936, 0.937, 0.904, '0.960', 'MODNet (reported)', 'ROOST', ''],
    ['log G<sub>VRH</sub>', 10987, 'MAE', 0, 0.073, 0.032, 0.033, '0.067', 'coGN', 'MVL, ORB, ℓ-MM, ROOST, SISSO', 'log₁₀GPa'],
    ['log K<sub>VRH</sub>', 10987, 'MAE', 0, 0.056, 0.027, 0.028, '0.049', 'coNGN', 'MVL, ORB, ℓ-MM, ℓ-OFM, ROOST, SISSO', 'log₁₀GPa'],
    ['Perovskite ΔH<sub>f</sub>', 18928, 'MAE', 0, 0.0908, 0.0386, 0.0389, '0.0269', 'coGN', 'ORB, MVL, ℓ-OFM, ℓ-MM, ROOST, SISSO', 'eV/u.c.'],
    ['Band gap', 106113, 'MAE', 0, 0.2199, 0.137, 0.137, '0.156', 'coGN', 'MVL, ORB, ROOST, SISSO', 'eV'],
    ['Metallicity', 106113, 'AUROC', 1, 0.904, 0.978, 0.976, '0.9520', 'CGCNN', 'ORB, MVL, ℓ-OFM, ROOST', ''],
    ['E<sub>f</sub>', 132752, 'MAE', 0, 0.0448, 0.0147, 0.0138, '0.0170', 'coGN', 'MVL, ORB, ℓ-OFM, ℓ-MM', 'eV/atom'],
  ];
  // published % error reductions (Table 1) for MM+MV and MV
  const T1P = [[3.0, -37.8], [12.1, 13.0], [12.2, 10.8], [12.9, -5.5], [13.3, 13.7], [71.4, -59.3], [1.6, -50.0], [55.5, 54.8], [49.6, 50.1], [57.5, 57.3], [37.6, 37.8], [77.1, 75.0], [67.2, 69.2]];
  // Record position, derived with the paper's own definition:
  //   regression:      (MAE_base − MAE_rec)/MAE_base
  //   classification:  [(1−AUROC_base) − (1−AUROC_rec)]/(1−AUROC_base)
  const errRed = (t, v) => (v = parseFloat(v), t[3] ? ((1 - t[4]) - (1 - v)) / (1 - t[4]) : (t[4] - v) / t[4]) * 100;

  function chMatbench(el) {
    const st = { sel: 12, sort: 'n', view: 'chart' };
    const prose = h('div', { class: 'prose' },
      h('p', { html: 'MODNet with MatMiner (<strong>MODNet@MM</strong>) is the baseline. Add MatterVial features (<strong>MM+MV</strong>), or replace MatMiner by ℓ-MM (<strong>MV</strong>). 5-fold CV, as in MatBench.' }),
      h('div', { class: 'mv-stats4' }, W.ui.stats([
        { v: '0.978', k: 'Metallicity AUROC<br>record 0.952 (CGCNN)' },
        { v: '0.0138', k: 'E<sub>f</sub> MAE, eV/atom<br>record 0.0170 (coGN)' },
        { v: '0.032', k: 'log G<sub>VRH</sub> MAE<br>record 0.067 (coGN)' },
        { v: '0.137', k: 'Band gap MAE, eV<br>record 0.156 (coGN)' }])),
      h('ul', null,
        li('Gains grow with dataset size. On large structure tasks MatterVial beats the GNN records, except perovskites (coGN).'),
        li('New records on four tasks MODNet already led, and on experimental metallicity.'),
        li('Glass-forming ability: no substantial gain.')),
      h('p', { class: 'hint', html: 'Table 1 of ' + CITE + '. % error reduction vs MODNet@MM; for AUROC tasks it is computed on 1 − AUROC.' }));

    const host = h('div', { class: 'mv-cv' });
    const tblHost = h('div', { class: 'mv-t1' });
    const det = h('div', { class: 'mv-detail' });
    let rowsY = [];
    const order = () => {
      const idx = T1.map((_, i) => i);
      if (st.sort === 'gain') idx.sort((a, b) => Math.max(...T1P[b]) - Math.max(...T1P[a]));
      return idx;
    };
    const cv = W.canvas(host, draw, { height: 470, label: 'Percent error reduction per MatBench task for MODNet with MatterVial features' });
    cv.canvas.style.cursor = 'pointer';
    function draw(ctx, w, hh) {
      const fg = tok('--fg'), mu = tok('--muted'), line = tok('--line'), p = tok('--p'), p2 = tok('--mv-adj'), wr = tok('--warn');
      const narrow = w < 560;
      const labW = narrow ? 128 : 200, x0 = labW + 8, x1 = w - 12, top = 30, bot = hh - 34;
      const lo = -60, hi = 80, X = (v) => x0 + ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (x1 - x0);
      const idx = order(), rh = (bot - top) / idx.length;
      rowsY = [];
      // grid
      ctx.font = font(12, 400, true); ctx.fillStyle = mu; ctx.textAlign = 'center';
      for (let v = lo; v <= hi; v += 20) {
        ctx.strokeStyle = v === 0 ? fg : line; ctx.lineWidth = v === 0 ? 1.5 : 1;
        ctx.beginPath(); ctx.moveTo(X(v), top - 6); ctx.lineTo(X(v), bot); ctx.stroke();
        if (!narrow || v % 40 === 0) ctx.fillText((v > 0 ? '+' : '') + v + '%', X(v), bot + 16);
      }
      ctx.fillText('% error reduction vs MODNet@MM →', (x0 + x1) / 2, bot + 30);
      idx.forEach((i, k) => {
        const t = T1[i], y = top + k * rh + rh / 2;
        rowsY.push({ x: 0, y: top + k * rh, w: w, h: rh, i });
        if (i === st.sel) { ctx.fillStyle = tok('--p-soft'); ctx.fillRect(0, top + k * rh, w, rh); }
        ctx.textAlign = 'right'; ctx.fillStyle = i === st.sel ? fg : mu;
        ctx.font = font(narrow ? 11 : 13, i === st.sel ? 700 : 500);
        const nm = t[0].replace(/<sub>(.*?)<\/sub>/g, '_$1');
        ctx.fillText(fitText(ctx, nm, labW - 50), labW - 46, y + 4);
        ctx.font = font(11, 400, true); ctx.fillStyle = mu;
        ctx.fillText(t[1] >= 1e5 ? Math.round(t[1] / 1000) + 'k' : t[1].toLocaleString('en-US'), labW, y + 4);
        const a = T1P[i][0], b = T1P[i][1];
        ctx.strokeStyle = line; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(X(Math.min(a, b, 0)), y); ctx.lineTo(X(Math.max(a, b, 0)), y); ctx.stroke();
        if (t[7] != null && i !== 6) { // record tick (glass: 0.960 was not reproduced, so no tick)
          const rx = X(errRed(t, t[7]));
          ctx.strokeStyle = wr; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(rx, y - rh * 0.35); ctx.lineTo(rx, y + rh * 0.35); ctx.stroke();
        }
        ctx.fillStyle = tok('--surface'); ctx.strokeStyle = p2; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(X(b), y - 6); ctx.lineTo(X(b) + 6, y); ctx.lineTo(X(b), y + 6); ctx.lineTo(X(b) - 6, y); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = p; ctx.beginPath(); ctx.arc(X(a), y, 6, 0, 7); ctx.fill();
      });
      // legend
      ctx.textAlign = 'left'; ctx.font = font(12, 600);
      let lx = x0; const ly = 12;
      ctx.fillStyle = p; ctx.beginPath(); ctx.arc(lx + 5, ly, 5, 0, 7); ctx.fill(); ctx.fillStyle = fg; ctx.fillText('MM+MV', lx + 14, ly + 4); lx += 76;
      ctx.strokeStyle = p2; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lx + 5, ly - 5); ctx.lineTo(lx + 10, ly); ctx.lineTo(lx + 5, ly + 5); ctx.lineTo(lx, ly); ctx.closePath(); ctx.stroke(); ctx.fillStyle = fg; ctx.fillText('MV', lx + 14, ly + 4); lx += 48;
      ctx.strokeStyle = wr; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(lx + 4, ly - 6); ctx.lineTo(lx + 4, ly + 6); ctx.stroke(); ctx.fillStyle = fg; ctx.fillText(narrow ? 'record' : 'MatBench record (other model)', lx + 12, ly + 4);
      ctx.fillStyle = mu; ctx.font = font(10, 400, true); ctx.textAlign = 'right'; ctx.fillText('n', labW, ly + 4); ctx.textAlign = 'left';
    }
    cv.canvas.addEventListener('click', (e) => {
      const q = evPos(cv.canvas, e); const r0 = rowsY.find((rr) => inRect(q, rr));
      if (r0) { st.sel = r0.i; refresh(); }
    });
    function refresh() {
      cv.redraw();
      const t = T1[st.sel], u = t[10] ? ' ' + t[10] : '';
      det.innerHTML = '';
      det.appendChild(h('div', { class: 'mv-detail-h', html: '<b>' + t[0] + '</b> <span class="hint">· n = ' + t[1].toLocaleString('en-US') + ' · ' + t[2] + u + '</span>' }));
      const rec = t[7] != null ? t[7] + ' (' + t[8] + ')' : 'held by MODNet@MM';
      det.appendChild(h('div', { class: 'mv-kv tnum', html:
        '<span>MODNet@MM</span><b>' + t[4] + (st.sel === 6 ? ' <span class="hint">(0.960 reported, not reproduced)</span>' : '') + '</b>' +
        '<span>MM+MV</span><b>' + t[5] + ' (' + (T1P[st.sel][0] > 0 ? '+' : '') + T1P[st.sel][0].toFixed(1) + '%)</b>' +
        '<span>MV</span><b>' + t[6] + ' (' + (T1P[st.sel][1] > 0 ? '+' : '') + T1P[st.sel][1].toFixed(1) + '%)</b>' +
        '<span>Record</span><b>' + rec + '</b>' }));
      det.appendChild(h('div', { class: 'mv-chips' }, h('span', { class: 'hint' }, 'Best MatterVial groups: '), t[9].split(', ').map((g) => h('span', { class: 'chip' }, g))));
      host.hidden = st.view !== 'chart'; det.hidden = st.view !== 'chart'; tblHost.hidden = st.view !== 'table';
    }
    tblHost.appendChild(W.ui.table(['Task', 'n', 'MODNet@MM', 'MM+MV', 'MV', 'Record (model)'],
      T1.map((t, i) => [t[0] + (t[3] ? ' <span class="hint">AUROC</span>' : ''), t[1].toLocaleString('en-US'), t[4] + (i === 6 ? ' (0.960)†' : ''),
        t[5] + ' <span class="hint">(' + T1P[i][0].toFixed(1) + '%)</span>', t[6] + ' <span class="hint">(' + T1P[i][1].toFixed(1) + '%)</span>', (t[7] != null ? t[7] + ' (' + t[8] + ')' : t[8])]), [1, 2, 3, 4]));
    const sortSeg = W.ui.seg([{ value: 'n', label: 'Sort by dataset size' }, { value: 'gain', label: 'Sort by gain' }], 'n', (v) => { st.sort = v; refresh(); }, 'Sort');
    const viewSeg = W.ui.seg([{ value: 'chart', label: 'Chart' }, { value: 'table', label: 'Table 1' }], 'chart', (v) => { st.view = v; refresh(); }, 'View');
    const stage = W.ui.stage('MatBench v0.1 · 13 tasks (Table 1)', h('div', { class: 'ctrl-row' }, viewSeg.el, sortSeg.el), host, det, tblHost,
      h('p', { class: 'hint', html: 'Click a task. Record ticks use the same error-reduction formula (derived here). Tasks led by MODNet, and glass (0.960 not reproduced), have no tick. Perovskite baseline 0.0908 as in Table 1.' }));
    el.appendChild(h('div', { class: 'bench' }, prose, stage));
    refresh();
  }

  /* =====================================================================
   * Chapter 4: synergy, step by step on perovskites (PAPER Table 2)
   * ===================================================================== */
  const LADDER = [
    ['AutoMatMiner', 0.2005, 'MatBench reference with MatMiner features.'],
    ['MODNet@MM', 0.0888, 'Feature selection + GA-tuned MODNet on the same MatMiner features.'],
    ['ℓ-MM + ℓ-OFM', 0.0973, 'MatMiner replaced by its fast GNN proxy ℓ-MM, plus ℓ-OFM.'],
    ['+ MVL', 0.0673, 'Pretrained MEGNet readouts add structural and physicochemical detail.'],
    ['+ SISSO', 0.0653, 'Rung-1 formula features.'],
    ['+ ROOST', 0.0639, 'Composition model with attention. Full MatMiner instead of ℓ-MM here: 0.0637.'],
    ['+ ORB = MODNet@MV', 0.0388, 'ORB-v3, trained on ~120 M structures. HackNIP (MODNet@ORB alone): 0.0397.'],
    ['+ Adj(MEGNet)', 0.0343, 'A MEGNet trained on the task, used as a featurizer. Below the MatBench MEGNet (0.0352).'],
    ['+ Adj(coGN) instead', 0.0313, 'A coGN adjacent model in place of MEGNet.'],
    ['+ hiSISSO', 0.0288, 'SISSO formulas that approximate the GNN features, fed back as features.'],
  ];
  function chSynergy(el) {
    const st = { k: LADDER.length - 1 };
    const prose = h('div', { class: 'prose' },
      h('p', { html: 'One task, every group added in turn: perovskite heat of formation (18,928 structures), MAE in eV per unit cell.' }),
      h('ul', null,
        li('Groups <strong>stack</strong>: each pretrained source adds information the others miss.'),
        li('ℓ-MM is a valid shortcut: at step 5, ℓ-MM gives 0.0639 vs 0.0637 with full MatMiner.'),
        li('ORB brings the largest relative drop (−39%). The adjacent GNN and hiSISSO bring the rest.')),
      h('div', { class: 'code-label' }, 'Adjacent GNN, trained on your folds'),
      W.ui.code(`from mattervial import AdjacentGNNFeaturizer
adj = AdjacentGNNFeaturizer()  ## Default: MEGNet, both layers
adj.train_adjacent_model(
    train_df['structure'], train_df['ref_index'],
    adjacent_model_path='./data', max_epochs=10)
X_adj = adj.get_features(df['structure'], model_path='./data')`, 'python'),
      h('p', { class: 'hint', html: 'Table 2 of ' + CITE + '. Mean MAE over 5 folds; fold std ≤ 0.0025 for every MODNet step.' }));

    const host = h('div', { class: 'mv-cv' });
    const card = h('div', { class: 'mv-detail' });
    const cv = W.canvas(host, draw, { aspect: window.innerWidth < 600 ? 0.85 : 0.52, label: 'MAE ladder on the perovskite task as MatterVial groups are added' });
    // y axis is logarithmic: y = top + (log10(MAE_max) − log10(MAE)) / (log10(MAE_max) − log10(MAE_min)) · height
    function draw(ctx, w, hh) {
      const fg = tok('--fg'), mu = tok('--muted'), line = tok('--line'), p = tok('--p'), wr = tok('--warn');
      const narrow = w < 560;
      const L = narrow ? 44 : 70, Rm = narrow ? 22 : 36, T = 22, Bm = narrow ? 40 : 96;
      const ymax = 0.25, ymin = 0.024, lg = Math.log10;
      const Y = (v) => T + (lg(ymax) - lg(v)) / (lg(ymax) - lg(ymin)) * (hh - T - Bm);
      const X = (i) => L + 22 + (i / (LADDER.length - 1)) * (w - L - Rm - 22);
      ctx.font = font(11, 400, true); ctx.textAlign = 'right';
      [0.2, 0.1, 0.05, 0.03].forEach((v) => {
        ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L, Y(v)); ctx.lineTo(w - Rm, Y(v)); ctx.stroke();
        ctx.fillStyle = mu; ctx.fillText(String(v), L - 6, Y(v) + 4);
      });
      if (!narrow) { ctx.save(); ctx.translate(14, T + (hh - T - Bm) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('MAE (eV/u.c., log)', 0, 0); ctx.restore(); }
      // reference lines
      const ref = (v, lab, col, below) => {
        ctx.strokeStyle = col; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(L, Y(v)); ctx.lineTo(w - Rm, Y(v)); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.font = font(11, 700); ctx.fillText(lab, L + 6, Y(v) + (below ? 13 : -4));
      };
      ref(0.0352, 'MEGNet (MatBench) 0.0352', mu);
      ref(0.0269, 'record: coGN 0.0269', wr, true);
      // path up to current step
      ctx.strokeStyle = p; ctx.lineWidth = 3; ctx.beginPath();
      LADDER.slice(0, st.k + 1).forEach((s, i) => { const x = X(i), y = Y(s[1]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke();
      LADDER.forEach((s, i) => {
        const x = X(i), y = Y(s[1]), on = i <= st.k;
        ctx.fillStyle = on ? (i === st.k ? fg : p) : tok('--surface-2');
        ctx.strokeStyle = on ? p : line; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, i === st.k ? 7 : 5, 0, 7); ctx.fill(); ctx.stroke();
        if (on && (!narrow || i === st.k)) {
          ctx.fillStyle = fg; ctx.font = font(narrow ? 10 : 12, i === st.k ? 700 : 500, true); ctx.textAlign = 'center';
          ctx.lineWidth = 4; ctx.strokeStyle = tok('--surface'); ctx.lineJoin = 'round';
          ctx.strokeText(s[1].toFixed(4), x, y - 12); ctx.fillText(s[1].toFixed(4), x, y - 12);
        }
        // x labels (rotated)
        ctx.save(); ctx.translate(x, hh - Bm + 10); ctx.rotate(-Math.PI / 5);
        ctx.fillStyle = i === st.k ? fg : mu; ctx.font = font(narrow ? 10 : 13, i === st.k ? 700 : 500); ctx.textAlign = 'right';
        ctx.fillText(narrow ? String(i) : s[0].replace(' = MODNet@MV', '').replace(' instead', ''), 0, 0); ctx.restore();
      });
      ctx.textAlign = 'left';
    }
    const sl = W.ui.slider({ label: 'Step', min: 0, max: LADDER.length - 1, step: 1, value: st.k, fmt: (v) => v + ' / ' + (LADDER.length - 1), onInput: (v) => { st.k = v; refresh(); } });
    let stop = null;
    const play = btn('▶ Replay', () => {
      if (stop) { stop(); stop = null; play.textContent = '▶ Replay'; return; }
      sl.set(0); let acc = 0; play.textContent = '❚❚ Pause';
      stop = W.raf((dt) => { acc += dt; if (acc > 1.1) { acc = 0; if (st.k < LADDER.length - 1) sl.set(st.k + 1); else { stop(); stop = null; play.textContent = '▶ Replay'; } } });
    }, true);
    const prev = btn('←', () => sl.set(Math.max(0, st.k - 1)), true, { 'aria-label': 'Previous step' });
    const next = btn('→', () => sl.set(Math.min(LADDER.length - 1, st.k + 1)), true, { 'aria-label': 'Next step' });
    function refresh() {
      cv.redraw();
      const s = LADDER[st.k], pv = st.k ? LADDER[st.k - 1][1] : null;
      const d = pv ? ((s[1] - pv) / pv) * 100 : null;
      card.innerHTML = '';
      card.appendChild(h('div', { class: 'mv-detail-h', html: '<span class="mv-step">' + st.k + '</span><b>' + s[0] + '</b> <span class="tnum">· ' + s[1].toFixed(4) + ' eV/u.c.</span>' +
        (d != null ? ' <span class="mv-delta ' + (d < 0 ? 'good' : 'bad') + ' tnum">' + (d > 0 ? '+' : '') + d.toFixed(1) + '%</span>' : '') }));
      card.appendChild(h('p', { html: s[2] }));
    }
    const stage = W.ui.stage('Perovskite formation-enthalpy ladder (Table 2)',
      h('div', { class: 'ctrl-row' }, prev, next, play), sl.el, host, card,
      h('p', { class: 'hint', html: 'Final: MODNet@MV + Adj(coGN) + hiSISSO = <b>0.0288</b>, 7% above the coGN record (0.0269) and a third of MODNet@MM (0.0888).' }));
    el.appendChild(h('div', { class: 'bench' }, prose, stage));
    refresh();
  }

  /* =====================================================================
   * Chapter 5: Interpreter (real formula library + SHAP top features)
   * ===================================================================== */
  // Generated from mattervial/interpreter/formulas/all_formulas.json (dim_1..dim_5: c0, terms [a_i, φ_i], R²)
  // and interpreter/shap_values/*/<feature>_top_features.json (first 8 by mean |SHAP|). Names shortened
  // by stripping matminer class prefixes (ElementProperty_MagpieData_, ElectronegativityDiff_, ...).
  const FORM = {"MVL32_Eform_MP_2019_3": {"dims": [{"c0": 26.919, "t": [[1.948, "((|mean EN difference - avg dev Electronegativity|) * (exp(-1.0 * frac d valence electrons)))"]], "r2": 0.791}, {"c0": 0.727, "t": [[22.227, "((mean NpValence * avg dev NUnfilled) - (ℓ-OFM#79 * mean EN difference))"], [1.455, "((|mean EN difference - avg dev Electronegativity|) * (exp(-1.0 * frac d valence electrons)))"]], "r2": 0.856}, {"c0": -0.03, "t": [[0.764, "((mode CovalentRadius * deltaH inter) + (|avg dev CovalentRadius - mean SpaceGroupNumber|))"], [-4.333, "((mean NpValence * avg dev NUnfilled) - (ℓ-OFM#79 * minimum EN difference))"], [9.259, "((mean NpValence + minimum EN difference) * (frac d valence electrons - avg dev Electronegativity))"]], "r2": 0.883}, {"c0": -5.794, "t": [[-0.979, "((|mean NpValence - minimum Column|) / (minimum Column + max ionic char))"], [-0.738, "((avg dev NdValence * deltaH inter) - cbrt(ℓ-OFM#99))"], [56.707, "((mean GSbandgap - avg dev NUnfilled) + (ℓ-OFM#79 * minimum EN difference))"], [8.457, "((mean NpValence * avg ionic char) / exp(frac d valence electrons))"]], "r2": 0.899}, {"c0": -0.054, "t": [[-4.692, "((mode CovalentRadius * frac p valence electrons) * (|mean GSbandgap - frac d valence electrons|))"], [-0.938, "((|mean NpValence - minimum Column|) / (minimum Column + max ionic char))"], [0.653, "((avg dev NdValence * deltaH inter) - cbrt(ℓ-OFM#99))"], [-8.104, "((mean NpValence * avg dev NUnfilled) - (ℓ-OFM#79 * minimum EN difference))"], [10.443, "((|mean NpValence - frac d valence electrons|) * (frac d valence electrons - avg dev Electronegativity))"]], "r2": 0.913}], "shap": [["avg dev Electronegativity", 3.378], ["frac d valence electrons", 1.599], ["mean EN difference", 1.151], ["avg ionic char", 0.519], ["minimum EN difference", 0.464], ["max ionic char", 0.404], ["mean SpaceGroupNumber", 0.401], ["deltaH inter", 0.324]]}, "MVL32_Eform_MP_2019_16": {"dims": [{"c0": -6.454, "t": [[-3.697, "((|mean NsValence - frac d valence electrons|) * (band center * avg dev Electronegativity))"]], "r2": 0.923}, {"c0": -7.551, "t": [[-6.551, "((mean NsValence - avg dev Electronegativity) * (|O - avg dev Electronegativity|))"], [-0.993, "((|mean NsValence - frac d valence electrons|) * (band center * avg dev Electronegativity))"]], "r2": 0.949}, {"c0": -0.035, "t": [[-3.03, "((ℓ-OFM#79 - avg dev NUnfilled) * (ℓ-OFM#68 * minimum EN difference))"], [9.861, "((|mean NsValence - frac d valence electrons|) * (band center * avg dev Electronegativity))"], [-2.132, "((F + O) + (frac p valence electrons * avg dev Electronegativity))"]], "r2": 0.962}, {"c0": -0.169, "t": [[-0.03, "((mean NsValence - avg dev NpValence) * (avg ionic char * mode SpaceGroupNumber))"], [-5.684, "((ℓ-OFM#79 - avg dev NUnfilled) * (ℓ-OFM#68 * minimum EN difference))"], [-5.854, "((mean NsValence - avg dev Electronegativity) * (|O - avg dev Electronegativity|))"], [-0.709, "((|mean NsValence - frac d valence electrons|) * (band center * avg dev Electronegativity))"]], "r2": 0.966}, {"c0": 0.009, "t": [[-1.842, "((mean NsValence * avg ionic char) * (ℓ-OFM#172 * mode SpaceGroupNumber))"], [-0.031, "(|(mean NsValence + O) - (O * avg dev NUnfilled)|)"], [-3.488, "((ℓ-OFM#79 - avg dev NUnfilled) * (ℓ-OFM#68 * minimum EN difference))"], [7.682, "((mean NsValence - frac d valence electrons) * (band center * avg dev Electronegativity))"], [1.853, "((F + O) + (frac p valence electrons * avg dev Electronegativity))"]], "r2": 0.97}], "shap": [["maximum Electronegativity", 4.189], ["mode Electronegativity", 1.513], ["frac d valence electrons", 0.77], ["mode SpaceGroupNumber", 0.624], ["mean EN difference", 0.601], ["avg dev Electronegativity", 0.548], ["mean SpaceGroupNumber", 0.374], ["minimum EN difference", 0.314]]}, "l-MM_v1_730": {"dims": [{"c0": -35.984, "t": [[-1.332, "((mean GSbandgap * std dev G2 80.0) - (maximum NdUnfilled / maximum CovalentRadius))"]], "r2": 0.862}, {"c0": -0.186, "t": [[-2.102, "((avg dev NfUnfilled + avg dev NfValence) - (minimum NdValence + maximum NdUnfilled))"], [-0.908, "((mean MendeleevNumber * std dev G2 80.0) * (H + avg dev NsUnfilled))"]], "r2": 0.909}, {"c0": -35.001, "t": [[-0.185, "(|(range NsUnfilled / mean MendeleevNumber) - (|std dev G2 80.0 - mean G2 80.0|)|)"], [-2.038, "((avg dev NfUnfilled + avg dev NfValence) - (minimum NdValence + maximum NdUnfilled))"], [-0.605, "((mean MendeleevNumber * std dev G2 80.0) * (H + avg dev NsUnfilled))"]], "r2": 0.927}, {"c0": -0.112, "t": [[-34.999, "(|(mean GSbandgap - mean NdValence) - ln(mean AGNI eta=8 00e-01)|)"], [-0.169, "(|(range NsUnfilled / mean MendeleevNumber) - (|std dev G2 80.0 - mean G2 80.0|)|)"], [-2.038, "((avg dev NfUnfilled + avg dev NfValence) - (minimum NdValence + maximum NdUnfilled))"], [-0.002, "((mean MendeleevNumber * std dev G2 80.0) * (H + avg dev NsUnfilled))"]], "r2": 0.934}, {"c0": 444.44, "t": [[0.102, "((|max packing efficiency - std dev AGNI eta=8 00e-01|) * (mean AGNI eta=8 00e-01 * avg dev NsUnfilled))"], [-37.908, "(|(minimum Column - mean NdValence) - (mean NdUnfilled / max packing efficiency)|)"], [-0.169, "(|(range NsUnfilled / mean MendeleevNumber) - (|std dev G2 80.0 - mean G2 80.0|)|)"], [-2.181, "((avg dev NfUnfilled + avg dev NfValence) - (minimum NdValence + maximum NdUnfilled))"], [-1.071, "((mean MendeleevNumber * std dev G2 80.0) * (H + avg dev NsUnfilled))"]], "r2": 0.942}], "shap": [["mean G2 80.0", 0.294], ["std dev G2 80.0", 0.256], ["maximum NdUnfilled", 0.247], ["mean NdUnfilled", 0.18], ["std dev AGNI eta=8 00e-01", 0.178], ["frac f valence electrons", 0.157], ["avg dev NsUnfilled", 0.094], ["minimum NdValence", 0.092]]}, "l-OFM_v1_19": {"dims": [{"c0": 15.491, "t": [[-9.674, "(|(|OFM: p^5 - s^2 - OFM: p^4 - p^4|) - cbrt(OFM: p^4 - s^2)|)"]], "r2": 0.446}, {"c0": 10.542, "t": [[15.524, "((OFM: p^5 - s^1 + OFM: s^2 - d^7) + (OFM: p^3 - s^2 + OFM: p^4 - d^10))"], [-11.449, "(|(|OFM: p^5 - s^2 - OFM: p^4 - p^4|) - cbrt(OFM: p^4 - s^2)|)"]], "r2": 0.571}, {"c0": -4.976, "t": [[9.307, "(|(OFM: s^1 - s^1 + OFM: d^10 - s^2) - (OFM: p^5 - s^2 + OFM: s^2 - p^4)|)"], [15.972, "((OFM: p^5 - s^1 + OFM: s^2 - d^7) + (OFM: p^3 - s^2 + OFM: p^4 - d^10))"], [-9.304, "(|(|OFM: p^5 - s^2 - OFM: p^4 - p^4|) - cbrt(OFM: p^4 - s^2)|)"]], "r2": 0.625}, {"c0": -27.167, "t": [[-4.779, "((OFM: d^6 - s^2 + OFM: d^5 - s^2) * (|OFM: p^5 - p^5 - OFM: p^4 - s^2|))"], [8.859, "(|(OFM: s^1 - s^1 + OFM: d^10 - s^2) - (|OFM: p^5 - s^2 - OFM: s^2 - p^4|)|)"], [17.106, "((OFM: p^5 - s^1 + OFM: s^2 - d^7) + (OFM: p^3 - s^2 + OFM: p^4 - d^10))"], [-9.317, "(|(|OFM: p^5 - s^2 - OFM: p^4 - p^4|) - cbrt(OFM: p^4 - s^2)|)"]], "r2": 0.659}, {"c0": 5.127, "t": [[-27.441, "((|OFM: s^2 - d^8 - OFM: s^2 - p^2|) + (OFM: p^5 - s^1 + OFM: p^4 - s^1))"], [-4.37, "((OFM: d^6 - s^2 + OFM: d^5 - s^2) * cbrt(OFM: p^4 - p^4))"], [9.092, "(|(OFM: s^1 - s^1 + OFM: d^10 - s^2) - (|OFM: p^5 - s^2 - OFM: s^2 - p^4|)|)"], [17.051, "((OFM: p^5 - s^1 + OFM: s^2 - d^7) + (OFM: p^3 - s^2 + OFM: p^4 - d^10))"], [-10.413, "(|(|OFM: p^5 - s^2 - OFM: p^4 - p^4|) - cbrt(OFM: p^4 - s^2)|)"]], "r2": 0.68}], "shap": [["OFM: p^4 - s^2", 1.897], ["OFM: s^2 - p^4", 0.993], ["OFM: p^5 - p^5", 0.916], ["OFM: p^4 - p^4", 0.84], ["OFM: p^4 - s^1", 0.787], ["OFM: p^4 - d^10", 0.75], ["OFM: p^5 - s^2", 0.736], ["OFM: s^2 - d^7", 0.455]]}, "ORB_v3_layer_5_1": {"dims": [{"c0": 0.002, "t": [[5.787, "((|ℓ-OFM#86 - mean CovalentRadius|) * (minimum EN difference + mean G2 0.05))"]], "r2": 0.724}, {"c0": -0.013, "t": [[0.002, "((|maximum NdValence - mean G2 0.05|) * (avg dev NdValence - minimum EN difference))"], [5.852, "((|ℓ-OFM#86 - mean CovalentRadius|) * (mean tetrahedral CN 4 + mean G2 0.05))"]], "r2": 0.772}, {"c0": -1.808, "t": [[0.495, "(|(exp(-1.0 * mean Electronegativity)) - (avg dev NdValence * mean Gaussian center=2.0 width=1.0)|)"], [0.002, "((std dev tetrahedral CN 4 * minimum EN difference) - (mean BOOP Q l=2 * avg dev NdValence))"], [6.139, "((|ℓ-OFM#86 - mean CovalentRadius|) * (mean tetrahedral CN 4 + mean G2 0.05))"]], "r2": 0.797}, {"c0": 86.179, "t": [[-1.882, "((mean tetrahedral CN 4 / mean Column) / (avg dev MendeleevNumber + mean Column))"], [0.49, "(|(exp(-1.0 * mean Electronegativity)) - (avg dev NdValence * mean Gaussian center=2.0 width=1.0)|)"], [0.001, "((std dev tetrahedral CN 4 * minimum EN difference) - (mean BOOP Q l=2 * avg dev NdValence))"], [6.073, "((|ℓ-OFM#86 - mean CovalentRadius|) * (mean ordering parameter shell 1 + mean G2 0.05))"]], "r2": 0.814}, {"c0": -0.0, "t": [[4.71, "((|VoronoiFingerprint mean Voro dist mean - mean EN difference|) * (mean Column^3))"], [-1.947, "((mean tetrahedral CN 4 * mean NUnfilled) / (avg dev MendeleevNumber + mean Column))"], [0.226, "(|(exp(-1.0 * mean Electronegativity)) - (avg dev NdValence * mean Gaussian center=2.0 width=1.0)|)"], [-0.001, "(|(mean ordering parameter shell 1 + std dev tetrahedral CN 4) - (transition metal fraction * avg dev NdValence)|)"], [6.379, "((|ℓ-OFM#86 - mean CovalentRadius|) * (packing fraction - mean G2 0.05))"]], "r2": 0.829}], "shap": [["mean Gaussian center=3.0 width=1.0", 0.256], ["band center", 0.113], ["mean Gaussian center=2.0 width=1.0", 0.091], ["mean NUnfilled", 0.038], ["mean MendeleevNumber", 0.032], ["mean G2 0.05", 0.028], ["mean Gaussian center=5.0 width=1.0", 0.028], ["packing fraction", 0.025]]}, "ROOST_oqmd_eform_LayerMaterialPooling_11": {"dims": [{"c0": -0.0, "t": [[-0.095, "((minimum Number / 0-norm) * (mean Electronegativity^6))"]], "r2": 0.195}, {"c0": 4.963, "t": [[-0.0, "((mean BO 1:8 + mean ordering parameter shell 1) * (max packing efficiency^6))"], [-0.149, "((minimum Number / 0-norm) * (mean Electronegativity^6))"]], "r2": 0.271}, {"c0": 0.214, "t": [[5.022, "((HOMO energy + Yang delta) / (|minimum Number - range GSvolume pa|))"], [-0.0, "((mean BO 1:8 + mean ordering parameter shell 1) * (max packing efficiency^6))"], [-0.145, "((minimum Number / 0-norm) * (mean Electronegativity^6))"]], "r2": 0.316}, {"c0": -0.091, "t": [[0.248, "((avg dev Row * mean GSbandgap) - (|max packing efficiency - mean GSbandgap|))"], [4.404, "((HOMO energy + Yang delta) / (|minimum Number - range GSvolume pa|))"], [-0.0, "((mean BO 1:8 + mean ordering parameter shell 1) * (max packing efficiency^6))"], [-0.157, "((minimum Number / 0-norm) * (mean Electronegativity^6))"]], "r2": 0.351}, {"c0": 2.493, "t": [[-0.291, "((HOMO energy + O) * (avg dev Row / maximum NValence))"], [0.199, "((5-norm^6) * (minimum Electronegativity - mean GSbandgap))"], [0.627, "((HOMO energy + Yang delta) / (|minimum Number - range GSvolume pa|))"], [-0.0, "(|(mean BO 1:8 + max packing efficiency) - (|Yang delta - O|)|)"], [-0.298, "((minimum Number / 0-norm) * (mean Electronegativity^6))"]], "r2": 0.386}], "shap": [["mean NpValence", 0.047], ["mean GSbandgap", 0.031], ["O", 0.03], ["0-norm", 0.024], ["3-norm", 0.017], ["minimum MendeleevNumber", 0.017], ["2-norm", 0.015], ["range GSvolume pa", 0.015]]}};
  const FEATS = [
    ['MVL32_Eform_MP_2019_3', 'MVL32 Eform #3', 'MVL'],
    ['MVL32_Eform_MP_2019_16', 'MVL32 Eform #16', 'MVL'],
    ['l-MM_v1_730', 'ℓ-MM #730', 'ℓ-MM'],
    ['l-OFM_v1_19', 'ℓ-OFM #19', 'ℓ-OFM'],
    ['ORB_v3_layer_5_1', 'ORB layer 5 #1', 'ORB-v3'],
    ['ROOST_oqmd_eform_LayerMaterialPooling_11', 'ROOST Eform #11', 'ROOST'],
  ];
  // median R² of the SISSO approximation vs number of terms, computed from the shipped formula library
  const MED = { 'ℓ-MM': [0.893, 0.922, 0.936, 0.945, 0.951], 'ℓ-OFM': [0.514, 0.611, 0.673, 0.708, 0.733], 'ORB-v3': [0.454, 0.598, 0.674, 0.721, 0.750], 'MVL': [0.332, 0.453, 0.525, 0.575, 0.606], 'ROOST': [0.319, 0.416, 0.476, 0.531, 0.569] };
  const MEDN = { 'ℓ-MM': 758, 'ℓ-OFM': 188, 'ORB-v3': 1792, 'MVL': 288, 'ROOST': 256 };
  const FAMCLS = { 'ℓ-MM': 'desc', 'ℓ-OFM': 'lofm', 'ORB-v3': 'orb', 'MVL': 'task', 'ROOST': 'roost' };

  function prettyTerm(s) {
    const esc = (x) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return esc(s).replace(/exp\(-1\.0 \* ([^()]+)\)/g, 'e<sup>−$1</sup>').replace(/ \* /g, ' · ').replace(/\^(\d+)/g, '<sup>$1</sup>');
  }
  function chInterpreter(el) {
    const st = { f: 0, d: 1 };
    const prose = h('div', { class: 'prose' },
      h('ol', null,
        li('Train a <strong>surrogate XGBoost</strong>: interpretable MatMiner + OFM descriptors → one latent feature (MP2018-stable, 106,113 structures).'),
        li('Keep the <strong>top 30 descriptors</strong> by SHAP value.'),
        li('Run <strong>SISSO++</strong> on them: formulas with 1 to 5 terms, each with R².')),
      W.ui.code('from mattervial.interpreter import Interpreter\ninterp = Interpreter()\ninterp.get_formula("MVL32_Eform_MP_2019_3", dimension=1)\ninterp.get_shap_values("MEGNet_MatMiner_1")', 'python'),
      W.ui.callout('MVL formation-energy features link stability to <strong>large electronegativity gaps</strong> and <strong>low d-electron fractions</strong>. Textbook solid-state chemistry, recovered from a GNN.'),
      h('p', { class: 'hint', html: 'Library: 3282 latent features, up to five formulas each. Stronger features (ORB, adjacent coGN) are harder to approximate: R² drops.' }));

    const fSeg = W.ui.seg(FEATS.map((f, i) => ({ value: String(i), label: f[1] })), '0', (v) => { st.f = +v; refresh(); }, 'Latent feature');
    const sl = W.ui.slider({ label: 'SISSO terms', min: 1, max: 5, step: 1, value: 1, fmt: (v) => String(v), onInput: (v) => { st.d = v; refresh(); } });
    const formEl = h('div', { class: 'mv-formula' });
    const r2El = h('div', { class: 'mv-r2' });
    const shapHost = h('div', { class: 'mv-cv' });
    const famHost = h('div', { class: 'mv-cv' });
    const shapCv = W.canvas(shapHost, drawShap, { height: 210, label: 'Top descriptors of the surrogate model by mean absolute SHAP value' });
    const famCv = W.canvas(famHost, drawFam, { height: 210, label: 'Median R squared of SISSO approximations versus number of terms, per feature family' });
    function drawShap(ctx, w, hh) {
      const key = FEATS[st.f][0], sh = (FORM[key] && FORM[key].shap) || [];
      const fg = tok('--fg'), mu = tok('--muted'), p = tok('--p');
      ctx.font = font(11, 700); ctx.fillStyle = mu; ctx.fillText('SURROGATE · TOP DESCRIPTORS (mean |SHAP|)', 0, 11);
      if (!sh.length) return;
      const used = (FORM[key].dims[st.d - 1].t.map((t) => t[1]).join(' '));
      const labW = Math.min(230, w * 0.55), max = sh[0][1], rh = (hh - 22) / sh.length;
      sh.forEach(([n, v], i) => {
        const y = 20 + i * rh, inF = used.indexOf(n) >= 0;
        ctx.font = font(12, inF ? 700 : 400); ctx.fillStyle = inF ? fg : mu; ctx.textAlign = 'right';
        ctx.fillText(fitText(ctx, n, labW - 8), labW - 6, y + rh / 2 + 4);
        const bw = (v / max) * (w - labW - 48);
        ctx.fillStyle = p; ctx.globalAlpha = inF ? 1 : 0.4; ctx.fillRect(labW, y + 3, Math.max(1, bw), rh - 6); ctx.globalAlpha = 1;
        ctx.textAlign = 'left'; ctx.fillStyle = mu; ctx.font = font(11, 400, true); ctx.fillText(v.toFixed(2), labW + bw + 4, y + rh / 2 + 4);
      });
      ctx.textAlign = 'left';
    }
    function drawFam(ctx, w, hh) {
      const fg = tok('--fg'), mu = tok('--muted'), line = tok('--line');
      ctx.font = font(11, 700); ctx.fillStyle = mu; ctx.fillText('MEDIAN R² PER FAMILY (formula library)', 0, 11);
      const L = 34, Rr = 80, T = 22, Bb = 24, X = (d) => L + ((d - 1) / 4) * (w - L - Rr), Y = (r) => T + (1 - r) * (hh - T - Bb);
      ctx.font = font(12, 400, true);
      [0.2, 0.4, 0.6, 0.8, 1.0].forEach((r) => { ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(L, Y(r)); ctx.lineTo(w - Rr, Y(r)); ctx.stroke(); ctx.fillStyle = mu; ctx.textAlign = 'right'; ctx.fillText(r.toFixed(1), L - 4, Y(r) + 3); });
      ctx.textAlign = 'center'; for (let d = 1; d <= 5; d++) ctx.fillText(d === 5 ? '5 terms' : String(d), X(d), hh - 6);
      const cur = FEATS[st.f][2];
      // end labels: sort by y and push apart so they never overlap (min gap 12 px)
      const ly = {}; let lastY = -1e9;
      Object.keys(MED).map((k) => [k, Y(MED[k][4])]).sort((a, b) => a[1] - b[1]).forEach(([k, y]) => { const yy = Math.max(y, lastY + 14); ly[k] = yy; lastY = yy; });
      Object.keys(MED).forEach((k) => {
        const col = tok('--mv-' + FAMCLS[k]), on = k === cur;
        ctx.strokeStyle = col; ctx.lineWidth = on ? 3.5 : 1.8; ctx.globalAlpha = on ? 1 : 0.55;
        ctx.beginPath(); MED[k].forEach((r, i) => (i ? ctx.lineTo(X(i + 1), Y(r)) : ctx.moveTo(X(i + 1), Y(r)))); ctx.stroke();
        ctx.globalAlpha = 1; ctx.fillStyle = on ? fg : mu; ctx.font = font(12, on ? 700 : 500); ctx.textAlign = 'left';
        ctx.fillText(k, w - Rr + 6, ly[k] + 4);
      });
      // this feature's own curve (dashed) + current term marker
      const dims = FORM[FEATS[st.f][0]].dims;
      ctx.strokeStyle = fg; ctx.setLineDash([5, 4]); ctx.lineWidth = 2; ctx.beginPath();
      dims.forEach((dd, i) => (i ? ctx.lineTo(X(i + 1), Y(dd.r2)) : ctx.moveTo(X(i + 1), Y(dd.r2)))); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(X(st.d), Y(dims[st.d - 1].r2), 6, 0, 7); ctx.fill();
      ctx.textAlign = 'left';
    }
    function refresh() {
      const key = FEATS[st.f][0], dd = FORM[key].dims[st.d - 1];
      const terms = dd.t.map(([a, t], i) => '<div class="mv-term"><span class="mv-coef tnum">' + (a >= 0 && i ? '+ ' : (a < 0 ? '− ' : '')) + Math.abs(a).toFixed(3) + ' ·</span> <span>' + prettyTerm(t) + '</span></div>').join('');
      formEl.innerHTML = '<div class="mv-fhead"><code>' + key + '</code> ≈ <span class="tnum">' + dd.c0.toFixed(3) + '</span></div>' + terms;
      const pct = Math.round(dd.r2 * 100);
      r2El.innerHTML = '<span>R² = <b class="tnum">' + dd.r2.toFixed(3) + '</b></span><span class="mv-bar"><span style="width:' + pct + '%"></span></span>';
      shapCv.redraw(); famCv.redraw();
    }
    const stage = W.ui.stage('Decode a latent feature (shipped formula library)',
      fSeg.el, sl.el, formEl, r2El,
      h('div', { class: 'mv-two' }, shapHost, famHost),
      h('p', { class: 'hint', html: 'Bold descriptors appear in the current formula. Each term count is a separate SISSO fit. Medians computed from the library shipped with MatterVial.' }));
    el.appendChild(h('div', { class: 'bench' }, prose, stage));
    refresh();
  }

  /* =====================================================================
   * Chapter 6: AtomicFeaturizer → static elemental embeddings
   * ===================================================================== */
  const EMB_BLOCKS = [['MVL ×6', 192, 'task'], ['ℓ-MM', 128, 'desc'], ['ℓ-OFM', 128, 'lofm'], ['ROOST ×2', 128, 'roost'], ['ORB', 256, 'orb']];
  // Element-embedding quality (in-house benchmark). Columns: Metal, Period, Block, TM (linear-probe acc., %),
  // RQ2 kNN-Jaccard, RQ3 UMAP trustworthiness, RQ4 analogy (%).
  const EQ = {
    Global: [95.5, 53.9, 98.9, 95.4, 0.331, 0.986, 73.9],
    Hull: [96.6, 51.7, 97.8, 95.4, 0.325, 0.978, 60.9],
    'ICSD subst. (98D)': [98.8, 34.7, 94.4, 91.0, 0.281, 0.885, 43.5],
    'Pettifor (1D)': [81.0, 32.6, 77.6, 65.2, 0.375, 0.998, 34.8],
    'Random (832D)': [75.3, 30.3, 47.2, 59.5, 0.037, 0.741, 0.0],
  };
  const EQCOL = ['Metal', 'Period', 'Block', 'TM', 'kNN-Jaccard', 'UMAP trust.', 'Analogy'];
  function chEmbeddings(el) {
    const st = { dict: 'Global' };
    const prose = h('div', { class: 'prose' },
      h('p', { html: '<strong>AtomicFeaturizer</strong> (new, in development) keeps the N×d node features instead of one vector per structure. It streams compressed structure files, so whole databases fit.' }),
      h('div', { class: 'mv-stats4' }, W.ui.stats([{ v: '5,068,744', k: 'Alexandria structures' }, { v: '49.7 M', k: 'atomic environments' }, { v: '832-D', k: 'per atom, 11 GNN models' }, { v: '89', k: 'elements' }])),
      h('p', { class: 'mv-eq', html: 'Per element α: &nbsp;μ<sub>α</sub> = s<sub>α</sub> / n<sub>α</sub>, &nbsp; σ<sub>α</sub> = √(q<sub>α</sub>/n<sub>α</sub> − μ<sub>α</sub><sup>2</sup>)' }),
      h('p', { class: 'hint', html: 's<sub>α</sub>, q<sub>α</sub>: streamed sum and sum of squares over all n<sub>α</sub> occurrences. μ is Z-scored (global stats) and L2-normalised. <b>Global</b>: all structures. <b>Hull</b>: E<sub>hull</sub> ≤ 50 meV/atom. They feed downstream structure–chemistry metrics.' }),
      W.ui.fig(FIG + 'umap_elements_period.jpg', 'UMAP of the 89 Global embeddings, coloured by period. Families cluster without being told.', 'UMAP of MatterVial element embeddings'));

    const blockHost = h('div', { class: 'mv-cv' });
    const bcv = W.canvas(blockHost, drawBlocks, { height: 64, label: 'The 832-dimensional per-atom vector split by source model' });
    function drawBlocks(ctx, w) {
      let x = 0; const tot = 832;
      ctx.font = font(12, 700);
      EMB_BLOCKS.forEach(([n, d, c]) => {
        const ww = (d / tot) * w;
        ctx.fillStyle = tok('--mv-' + c); ctx.fillRect(x, 6, ww - 2, 30);
        ctx.fillStyle = '#fff'; const lab = ww > 80 ? n + ' · ' + d : String(d);
        ctx.fillText(fitText(ctx, lab, ww - 8), x + 5, 26);
        x += ww;
      });
      ctx.fillStyle = tok('--muted'); ctx.font = font(13, 400);
      ctx.fillText('6·32 + 128 + 128 + 2·64 + 256 = 832 node features per atom', 0, 54);
    }
    const chartHost = h('div', { class: 'mv-cv' });
    const ccv = W.canvas(chartHost, drawQ, { height: 300, label: 'Element-embedding quality metrics for MatterVial and reference embeddings' });
    function drawQ(ctx, w, hh) {
      const fg = tok('--fg'), mu = tok('--muted'), line = tok('--line');
      const keys = [st.dict, 'ICSD subst. (98D)', 'Pettifor (1D)', 'Random (832D)'];
      const cols = [tok('--p'), tok('--mv-roost'), tok('--warn'), tok('--muted')];
      const narrow = w < 560;
      const L = 36, T = narrow ? 48 : 34, Bb = 30, gw = (w - L) / EQCOL.length;
      const Y = (v) => T + (1 - v) * (hh - T - Bb);
      ctx.font = font(12, 400, true); ctx.textAlign = 'right';
      [0, 0.25, 0.5, 0.75, 1].forEach((v) => { ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(L, Y(v)); ctx.lineTo(w, Y(v)); ctx.stroke(); ctx.fillStyle = mu; ctx.fillText(v.toFixed(2).replace(/0$/, ''), L - 4, Y(v) + 3); });
      EQCOL.forEach((c, j) => {
        const gx = L + j * gw, bw = (gw - 10) / keys.length;
        keys.forEach((k, i) => {
          let v = EQ[k][j]; v = (j === 4 || j === 5) ? v : v / 100;
          ctx.fillStyle = cols[i]; ctx.globalAlpha = i === 0 ? 1 : 0.75;
          ctx.fillRect(gx + 5 + i * bw, Y(v), bw - 1.5, Y(0) - Y(v));
        });
        ctx.globalAlpha = 1;
        if (j === 1 || j === 6) { // annotate the two columns where Global/Hull differ most
          const v = EQ[st.dict][j] / 100; ctx.fillStyle = fg; ctx.font = font(13, 700, true); ctx.textAlign = 'center';
          ctx.fillText(EQ[st.dict][j].toFixed(1) + '%', gx + 5 + bw / 2, Y(v) - 4);
        }
        ctx.fillStyle = fg; ctx.font = font(narrow ? 10 : 13, 600); ctx.textAlign = 'center';
        ctx.fillText(narrow ? c.split(' ')[0].slice(0, 7) : c, gx + gw / 2, hh - 10);
      });
      // legend
      ctx.textAlign = 'left'; ctx.font = font(narrow ? 11 : 13, 600);
      let lx = L, ly = 12;
      keys.forEach((k, i) => {
        const lab = i === 0 ? 'MatterVial ' + k + ' (832D)' : k;
        const tw = ctx.measureText(lab).width + 26;
        if (lx + tw > w) { lx = L; ly += 17; }
        ctx.fillStyle = cols[i]; ctx.fillRect(lx, ly - 8, 10, 10); ctx.fillStyle = fg; ctx.fillText(lab, lx + 14, ly + 1); lx += tw;
      });
    }
    const anaEl = h('div', { class: 'mv-ana' });
    function refresh() {
      bcv.redraw(); ccv.redraw();
      anaEl.innerHTML = '<span class="mv-anaq">e<sub>Na</sub> − e<sub>Li</sub> + e<sub>K</sub> → <b>e<sub>Rb</sub></b>?</span>' +
        '<span>Analogy top-1 (23 pairs): <b class="tnum">' + EQ[st.dict][6] + '%</b> MatterVial ' + st.dict + ' · ' + EQ['ICSD subst. (98D)'][6] + '% ICSD · ' + EQ['Pettifor (1D)'][6] + '% Pettifor</span>';
    }
    const dSeg = W.ui.seg([{ value: 'Global', label: 'Global dictionary' }, { value: 'Hull', label: 'Hull (≤ 50 meV/atom)' }], 'Global', (v) => { st.dict = v; refresh(); }, 'Embedding dictionary');
    const stage = W.ui.stage('Static elemental embeddings',
      blockHost, dSeg.el, chartHost, anaEl,
      h('p', { class: 'hint', html: 'Metal/Period/Block/TM: linear-probe accuracy. kNN-Jaccard, UMAP trustworthiness: 0–1. Values from an in-house embedding benchmark. Probes saturate at 10–20 principal components.' }));
    el.appendChild(h('div', { class: 'bench' }, prose, stage));
    refresh();
  }

  /* =====================================================================
   * Chapter 7: at scale + status
   * ===================================================================== */
  function chScale(el) {
    const st = { m: 'mv' };
    const prose = h('div', { class: 'prose' },
      h('h3', null, 'Alexandria, featurized'),
      h('div', { class: 'mv-db' },
        W.ui.fig(FIG + 'alexandria_parquet_tree.png', 'Parquet shards, queried with DuckDB.', 'Folder tree of alexandria_mv1_featurized parquet shards'),
        h('div', { class: 'mv-db-txt' },
          h('p', { html: '<strong>5M+ structures</strong> featurized with MatterVial (internal). Targets: <span class="chip">e_above_hull</span> <span class="chip">band_gap_ind</span> <span class="chip">band_gap_dir</span> <span class="chip">e_form</span> <span class="chip">total_mag</span>' }),
          h('p', { html: 'Models trained on it: stability (class. + regr.), metallicity, band gap, band-gap type, magnetic (class. + regr.).' }))),
      h('h3', null, 'Use it'),
      W.ui.code(`conda create -n env_primary python=3.9.21 \\
    pip cudatoolkit=11.8.0 cudnn=8.9.2.26 uv -c conda-forge -y
conda activate env_primary
uv pip install tensorflow==2.13.1 megnet==1.3.2 \\
    matminer==0.7.4 …     # full pinned list: README
uv pip install -e .     # in the MatterVial folder
# ORB featurizer: own env (python 3.11.13, orb-models 0.5.4)`, 'bash'),
      h('p', { class: 'hint', html: 'MIT licence · v0.1.5 · <a href="https://github.com/rogeriog/MatterVial" target="_blank" rel="noopener">github.com/rogeriog/MatterVial</a>. Next: ℓ-OFM / ℓ-MM / ℓ-SOAP proxies trained on Alexandria, and coupling with the <a href="/garden/meidnet/">MEIDNet</a> generative model.' }));

    const imgWrap = h('div', { class: 'mv-parity' });
    const img = h('img', { alt: 'Parity plot of predicted vs DFT band gap on MatterGen structures', loading: 'lazy' });
    const r2 = h('div', { class: 'mv-r2big tnum' });
    imgWrap.appendChild(img); imgWrap.appendChild(r2);
    function refresh() {
      img.src = FIG + (st.m === 'mv' ? 'mattergen_gap_mattervial.jpg' : 'mattergen_gap_megnet.png');
      r2.innerHTML = st.m === 'mv' ? '<b>R² = 0.92</b><span>MatterVial mp_gap model</span>' : '<b>R² = 0.60</b><span>MEGNet</span>';
      r2.className = 'mv-r2big tnum ' + st.m;
    }
    const mSeg = W.ui.seg([{ value: 'megnet', label: 'MEGNet' }, { value: 'mv', label: 'MatterVial band-gap model' }], 'mv', (v) => { st.m = v; refresh(); }, 'Model');
    const stage = W.ui.stage('Out of distribution: generated structures',
      h('p', { class: 'hint', html: 'Band gap of MatterGen-generated structures (from colleagues Victor and Alberto), DFT vs predicted.' }),
      mSeg.el, imgWrap,
      h('div', { class: 'stage-title' }, 'MXenes (exploratory, aNANt ~23,800 MXenes)'),
      W.ui.table(['MODNet@MV', 'Band-gap MAE (eV)', 'R²'], [['Trained on aNANt', '0.0114', '0.961'], ['MP-trained, applied to MXenes', '0.2018', '−1.82']], [1, 2]),
      h('p', { class: 'hint', html: 'MXenes are far from MP chemistry: transfer fails, in-domain training works. Exploratory study shown at WelT (Nov 2025, Jun 2026); not in the paper.' }));
    el.appendChild(h('div', { class: 'bench even' }, prose, stage));
    refresh();
  }

  WELT.register({
    id: 'mattervial', order: 1, name: 'MatterVial',
    logo: 'assets/logos/mattervial.png', logoDark: false,
    tagline: 'Give a feature-based model the representations a graph neural network has learned, and keep the result readable.',
    status: [
      { label: 'Published · npj Comput. Mater. 12, 67 (2026)', tone: 'good', href: 'https://doi.org/10.1038/s41524-025-01938-2' },
      { label: 'GitHub', tone: 'plain', href: 'https://github.com/rogeriog/MatterVial' },
    ],
    chapters: [
      { id: 'idea', title: 'Latent GNN features', kicker: 'The gap', lede: 'Feature-based models are readable and data-efficient. GNNs are accurate on big data. MatterVial puts what GNNs learned into the feature vector.', render: chIdea },
      { id: 'families', title: 'Feature families', kicker: 'Featurizers', lede: 'Descriptor-oriented, task-oriented and symbolic features, one line of code each, appended to MatMiner or replacing it.', render: chFamilies },
      { id: 'matbench', title: 'MatBench results', kicker: 'Key results', lede: 'MODNet with MatterVial features beats the MatBench records on elastic moduli, band gap, metallicity and formation energy.', render: chMatbench },
      { id: 'synergy', title: 'Synergy, step by step', kicker: 'Perovskite heat of formation', lede: 'Each pretrained source adds information. Stacked, they take MODNet from 0.0888 to 0.0288 eV per unit cell.', render: chSynergy },
      { id: 'interpreter', title: 'Opening the black box', kicker: 'Interpreter', lede: 'Every latent feature ships with SHAP-ranked descriptors and SISSO formulas, from one to five terms.', render: chInterpreter },
      { id: 'embeddings', title: 'Element embeddings', kicker: 'AtomicFeaturizer', lede: 'Per-atom MatterVial vectors over all of Alexandria give a static embedding for each element.', render: chEmbeddings },
      { id: 'scale', title: 'Scale and status', kicker: 'Applications · status', lede: 'A featurized Alexandria database, out-of-distribution tests, and the open-source package.', render: chScale },
    ],
  });
})();
