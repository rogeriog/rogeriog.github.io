/* MEIDNet section: Multimodal Equivariant Inverse Design Network (A. Babu et al., npj Comput. Mater. 12, 287, 2026).
 * Sources: briefs/meidnet.md (arXiv:2601.22009 v1, the ABnano/MEIDNet repo v2.3.1 and its docs, the VibroML revision,
 * the Jun 2026 WelT deck). Every number on the page comes from there. Toys are labelled "toy model" on the page and
 * their formulas are stated in the code comments next to them. */
(function () {
  'use strict';
  const FIG = 'assets/figs/meidnet/';
  const NARROW = () => (window.innerWidth || 1200) < 700;
  const minus = (s) => String(s).replace(/-/g, '−');

  /* ---------- small helpers ---------- */
  function tok(W, name, fb) { return W.css(name) || fb || '#888'; }
  function rgbOf(c) {
    c = (c || '').trim();
    let m = c.match(/^#([0-9a-f]{3})$/i);
    if (m) return m[1].split('').map((x) => parseInt(x + x, 16));
    m = c.match(/^#([0-9a-f]{6})$/i);
    if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
    m = c.match(/rgba?\(([^)]+)\)/i);
    if (m) return m[1].split(/[ ,/]+/).slice(0, 3).map(Number);
    return [128, 128, 128];
  }
  function rgba(c, a) { const v = rgbOf(c); return `rgba(${v[0]},${v[1]},${v[2]},${a})`; }
  function mix(a, b, t) { return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)); }
  function font(W, px, wgt) { return `${wgt || 600} ${px}px ${W.css('--f-body') || 'system-ui, sans-serif'}`; }
  function mono(W, px, wgt) { return `${wgt || 500} ${px}px ${W.css('--f-mono') || 'monospace'}`; }
  // per-pair hue that reads on both grounds
  function hue(W, i, n) { return `hsl(${Math.round((i * 360) / n + 12)}, ${W.isDark() ? 70 : 62}%, ${W.isDark() ? 64 : 44}%)`; }
  function svgEl(W, w, hh, cls) { return W.h('svg', { viewBox: `0 0 ${w} ${hh}`, class: cls || '', role: 'img' }); }
  function sub(s) { return s.replace(/(\d+)/g, (m) => m.split('').map((d) => '₀₁₂₃₄₅₆₇₈₉'[+d]).join('')); }

  /* =====================================================================
   * Chapter 1 — the problem: from properties to crystals
   * ===================================================================== */
  function chProblem(el, W) {
    const h = W.h;
    // Modality map: D/learn/index.md §1 (data shapes) and its multimodality map (status in MEIDNet 2.3.1).
    const MODS = [
      { k: 'Crystal structure', shape: 'graph', st: 'in use', d: 'Lattice, neighbour graph (r<sub>c</sub> = 4 Å), species and fractional coordinates. Read by an E(n)-equivariant graph network.' },
      { k: 'Band gap', shape: 'scalar', st: 'in use', d: 'Direct band gap <code>dir_gap</code> (eV), DFT, Perov-5.' },
      { k: 'Formation enthalpy', shape: 'scalar', st: 'in use', d: 'Formation enthalpy <code>heat_all</code> (eV/atom), DFT, Perov-5. Concatenated with the band gap into one property vector.' },
      { k: 'Composition', shape: 'set', st: 'via structure', d: 'Not a separate encoder: it enters through the species of the structure.' },
      { k: 'Processing conditions', shape: 'vector', st: 'partial', d: 'Possible as extra scalar columns of the property vector.' },
      { k: 'XRD, DOS, spectra', shape: 'curve', st: 'planned', d: 'Roadmap: binned XRD or DOS as a vector modality with its own encoder. Designed for, not implemented.' },
      { k: 'Microscopy, text', shape: 'grid / sequence', st: 'planned', d: 'On the roadmap only.' },
    ];
    const detail = h('p', { class: 'hint mdn-moddetail' });
    const chips = h('div', { class: 'mdn-mods', role: 'group', 'aria-label': 'Modalities' });
    const btns = MODS.map((m, i) => {
      const b = h('button', { type: 'button', class: 'mdn-mod st-' + m.st.replace(/\s+/g, '-'), onclick: () => pick(i) },
        h('span', { class: 'k' }, m.k), h('span', { class: 's' }, m.shape + ' · ' + m.st));
      chips.appendChild(b); return b;
    });
    function pick(i) {
      btns.forEach((b, j) => b.setAttribute('aria-pressed', String(i === j)));
      detail.innerHTML = `<strong>${MODS[i].k}</strong> (${MODS[i].shape}): ${MODS[i].d}`;
    }
    pick(0);

    const prose = h('div', { class: 'prose' },
      h('ul', null,
        h('li', { html: '<strong>Inverse design</strong>: start from the properties you want and end with a crystal, instead of screening crystals one by one.' }),
        h('li', { html: 'Generators such as CDVAE, DiffCSP or MatterGen rely on <strong>a single mode of information</strong>, which limits how well they capture several properties at once.' }),
        h('li', { html: 'MEIDNet learns crystals and their properties <strong>together</strong>, in one shared latent space. A property target is then a point you can search from.' }),
        h('li', { html: 'Training data must be <strong>paired</strong>: each of the 18,928 Perov-5 structures comes with its DFT band gap and formation enthalpy.' })),
      h('div', { class: 'mdn-sub' }, 'What counts as a modality (click)'),
      chips, detail,
      W.ui.callout('MEIDNet is <strong>Anand Babu</strong>’s framework (UCLouvain); co-authors P. Vandergheynst (EPFL), G.-M. Rignanese and me. Anand built the model, the package and the platform. My part: the vibrational (dynamical-stability) analysis with VibroML (chapter 6).'));

    const stage = W.ui.stage('The MEIDNet workflow (paper Fig. 1)',
      W.ui.fig(FIG + 'fig1_workflow.jpg', '(a) Crystal and properties are encoded, aligned by contrastive learning and fused in a joint latent space; inverse design initialises latents, optimises them, decodes crystals, filters with an MLIP and validates ab initio. (b) Late vs early fusion. (c) Distance to the target properties during a latent search. Babu <i>et al.</i>, arXiv:2601.22009.'),
      W.ui.stats([
        { v: '2', k: 'encoders: EGNN (crystal), MLP (properties)' },
        { v: '128', k: 'latent dimensions' },
        { v: '0.70 M', k: 'parameters, 2.8 MB, runs on a laptop CPU' },
      ]));
    el.appendChild(h('div', { class: 'bench' }, prose, stage));
  }

  /* =====================================================================
   * Chapter 2 — contrastive alignment (toy InfoNCE playground)
   * ===================================================================== */
  function chAlign(el, W) {
    const h = W.h;
    /* Toy model (illustrative): N = 8 materials. Each has a structure latent s_i and a property latent p_i on the unit
     * circle (2D; the real model uses 128 dimensions on the unit sphere), parametrised by angles a_i, b_i.
     *   S_ij = s_i · p_j = cos(a_i − b_j)                                  cosine table
     *   L = (1/2N) Σ_i [ −log softmax_j(S_ij/τ)_i  −log softmax_j(S_ji/τ)_i ]   symmetric InfoNCE (train.py contrastive_loss)
     *   ∂L/∂S_ij = (P_ij + Q_ij − 2δ_ij) / (2Nτ),  P = row softmax, Q = column softmax of S/τ
     *   ∂S_ij/∂a_i = −sin(a_i − b_j),  ∂S_ij/∂b_j = +sin(a_i − b_j)
     * "Train" takes gradient steps on the angles (step scaled by τ and clipped, for a stable demo). */
    const N = 8;
    const TIED = [5, 6, 7]; // "shared properties": these three materials get one identical property vector
    let a = [], b = [], tau = 0.1, tied = false, stopAnim = null, steps = 0;
    function reset(seed, spread) {
      const r = W.rng(seed);
      a = []; b = [];
      for (let i = 0; i < N; i++) {
        a.push((2 * Math.PI * i) / N + (r() - 0.5) * 0.5);
        b.push(a[i] + (r() - 0.5) * spread);
      }
      if (tied) tieB();
      steps = 0;
    }
    function circMean(ix) { let x = 0, y = 0; ix.forEach((i) => { x += Math.cos(b[i]); y += Math.sin(b[i]); }); return Math.atan2(y, x); }
    function tieB() { const m = circMean(TIED); TIED.forEach((i) => (b[i] = m)); }
    function compute() {
      const S = [], P = [], Q = [];
      for (let i = 0; i < N; i++) { S.push([]); for (let j = 0; j < N; j++) S[i].push(Math.cos(a[i] - b[j])); }
      for (let i = 0; i < N; i++) {
        const row = S[i].map((v) => v / tau), mx = Math.max(...row);
        const e = row.map((v) => Math.exp(v - mx)), z = e.reduce((s, v) => s + v, 0);
        P.push(e.map((v) => v / z));
      }
      for (let i = 0; i < N; i++) Q.push(new Array(N).fill(0));
      for (let j = 0; j < N; j++) {
        const col = S.map((r) => r[j] / tau), mx = Math.max(...col);
        const e = col.map((v) => Math.exp(v - mx)), z = e.reduce((s, v) => s + v, 0);
        for (let i = 0; i < N; i++) Q[i][j] = e[i] / z;
      }
      let loss = 0, cos = 0, r1 = 0, r1p = 0;
      for (let i = 0; i < N; i++) {
        loss += -Math.log(Math.max(P[i][i], 1e-300)) - Math.log(Math.max(Q[i][i], 1e-300));
        cos += S[i][i];
        const mxr = Math.max(...S[i]), tr = S[i].filter((v) => v >= mxr - 1e-9).length;
        if (S[i][i] >= mxr - 1e-9) r1 += 1 / tr;            // ties share the credit
        const col = S.map((r) => r[i]), mxc = Math.max(...col), tc = col.filter((v) => v >= mxc - 1e-9).length;
        if (S[i][i] >= mxc - 1e-9) r1p += 1 / tc;
      }
      return { S, P, Q, loss: loss / (2 * N), cos: cos / N, r1: r1 / N, r1p: r1p / N };
    }
    function step() {
      const { S, P, Q } = compute();
      const ga = new Array(N).fill(0), gb = new Array(N).fill(0);
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const G = (P[i][j] + Q[i][j] - (i === j ? 2 : 0)) / (2 * N * tau);
        const s = Math.sin(a[i] - b[j]);
        ga[i] += G * -s; gb[j] += G * s;
      }
      if (tied) { const g = TIED.reduce((s, i) => s + gb[i], 0) / TIED.length; TIED.forEach((i) => (gb[i] = g)); }
      const clip = (v) => Math.max(-0.07, Math.min(0.07, v));
      for (let i = 0; i < N; i++) { a[i] -= clip(0.6 * tau * ga[i]); b[i] -= clip(0.6 * tau * gb[i]); }
      if (tied) tieB();
      steps++;
      void S;
    }

    const prose = h('div', { class: 'prose' },
      h('ul', null,
        h('li', { html: 'Each crystal gives a structure latent <i>z</i><sub>c</sub>, its properties give a property latent <i>z</i><sub>p</sub>. Both are normalised onto the unit sphere.' }),
        h('li', { html: 'Lay out the <i>N</i>×<i>N</i> cosine table of a batch. The <strong>diagonal holds the true pairs</strong>. Each row asks: which of the <i>N</i> property vectors belongs to this structure?' }),
        h('li', { html: 'The same loss pairs pictures with captions in CLIP. MEIDNet pairs crystals with their properties.' })),
      h('div', { class: 'mdn-eq', html: 'L<sub>InfoNCE</sub> = <sup>1</sup>⁄<sub>2N</sub> ∑<sub>i</sub> [ −log <span class="fr"><span>e<sup>z<sub>c</sub><sup>i</sup>·z<sub>p</sub><sup>i</sup>/τ</sup></span><span>∑<sub>j</sub> e<sup>z<sub>c</sub><sup>i</sup>·z<sub>p</sub><sup>j</sup>/τ</sup></span></span> − log <span class="fr"><span>e<sup>z<sub>p</sub><sup>i</sup>·z<sub>c</sub><sup>i</sup>/τ</sup></span><span>∑<sub>j</sub> e<sup>z<sub>p</sub><sup>i</sup>·z<sub>c</sub><sup>j</sup>/τ</sup></span></span> ]' }),
      h('div', { class: 'code-label' }, 'meidnet/train.py'),
      W.ui.code(`def contrastive_loss(z1, z2, temperature=0.01):
    """Symmetric InfoNCE: each structure should be closest to its own property latent."""
    logits = torch.matmul(z1, z2.t()) / temperature
    labels = torch.arange(z1.size(0), device=z1.device)
    return 0.5 * (F.cross_entropy(logits, labels) + F.cross_entropy(logits.t(), labels))`, 'python'),
      h('p', { class: 'hint', html: 'Defaults: τ = 0.01, contrastive weight 5, ramped up linearly from 0 over the first ~60% of training (curriculum).' }));

    const stage = W.ui.stage('Toy model · 8 materials in a 2D latent');
    const duo = h('div', { class: 'mdn-duo' });
    const cA = h('div', { class: 'mdn-cv' }), cB = h('div', { class: 'mdn-cv' });
    duo.append(cA, cB);
    const read = h('div', { class: 'mdn-read' });
    const tauSl = W.ui.slider({ label: 'Temperature τ', min: -2, max: 0, step: 0.01, value: Math.log10(tau),
      fmt: (v) => Math.pow(10, v).toFixed(Math.pow(10, v) < 0.1 ? 3 : 2), onInput: (v) => { tau = Math.pow(10, v); refresh(); } });
    const bTrain = h('button', { class: 'btn', type: 'button', onclick: toggleTrain }, 'Train');
    const bStep = h('button', { class: 'btn ghost', type: 'button', onclick: () => { stop(); for (let k = 0; k < 10; k++) step(); refresh(); } }, '+10 steps');
    const bShuf = h('button', { class: 'btn ghost', type: 'button', onclick: () => { stop(); reset(Math.floor(Math.random() * 1e6), 2 * Math.PI); refresh(); } }, 'Shuffle pairs');
    const bTie = h('button', { class: 'btn ghost', type: 'button', 'aria-pressed': 'false', onclick: () => {
      tied = !tied; bTie.setAttribute('aria-pressed', String(tied)); bTie.classList.toggle('on', tied);
      if (tied) tieB(); else { const r = W.rng(7); TIED.forEach((i) => (b[i] += (r() - 0.5) * 0.9)); }
      refresh();
    } }, 'Materials 6–8 share properties');
    const note = h('p', { class: 'hint' });
    stage.append(duo, read, tauSl.el, h('div', { class: 'ctrl-row' }, bTrain, bStep, bShuf, bTie), note);
    el.appendChild(h('div', { class: 'bench' }, prose, stage));

    const cvA = W.canvas(cA, drawCircle, { aspect: 1, label: 'Structure and property latents on the unit circle' });
    const cvB = W.canvas(cB, drawMatrix, { aspect: 1, label: 'Row-softmax of the cosine table' });

    function stop() { if (stopAnim) { stopAnim(); stopAnim = null; } bTrain.textContent = 'Train'; }
    function toggleTrain() {
      if (stopAnim) { stop(); return; }
      if (W.reduceMotion) { for (let k = 0; k < 60; k++) step(); refresh(); return; }
      bTrain.textContent = 'Pause';
      let n = 0;
      stopAnim = W.raf(() => { step(); n++; refresh(); if (n > 400) stop(); });
    }
    function refresh() {
      const s = compute();
      cvA.redraw(); cvB.redraw();
      read.innerHTML = '';
      const cell = (k, v, cls) => h('div', null, h('span', { class: 'k' }, k), h('span', { class: 'v tnum ' + (cls || '') }, v));
      read.append(
        cell('InfoNCE loss', s.loss.toFixed(3)),
        cell('chance level', 'ln 8 = 2.079'),
        cell('mean matched cos', minus(s.cos.toFixed(2))),
        cell('top-1 structure→prop.', (100 * s.r1).toFixed(0) + '%', s.r1 > 0.99 ? 'good' : ''),
        cell('top-1 prop.→structure', (100 * s.r1p).toFixed(0) + '%', s.r1p > 0.99 ? 'good' : ''));
      note.innerHTML = tied
        ? 'Three materials now carry the same property vector: no loss can tell them apart from the property side. In Perov-5, 18,928 materials share only 903 distinct (ΔH, gap) pairs; retrieval top-1 is 0.230 from structure to properties but 0.003 from properties to structure. Inverse design is a search, not a lookup.'
        : (tau < 0.03 ? 'Low τ: the softmax is peaky, only the hardest negatives matter (MEIDNet uses τ = 0.01).'
          : tau > 0.4 ? 'High τ: every row is nearly uniform and the loss barely separates true from false pairs.'
          : 'Press Train: matched pairs (same colour, ● structure, ■ properties) are pulled together, the others pushed apart.');
    }
    function drawCircle(ctx, w, hh) {
      if (w < 40) return;
      const fg = tok(W, '--fg'), mu = tok(W, '--muted'), line = tok(W, '--line');
      const cx = w / 2, cy = hh / 2, R = Math.min(w, hh) * 0.36;
      ctx.strokeStyle = line; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.74, 0, 7); ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([]);
      const P = (ang, r) => [cx + r * Math.cos(ang), cy - r * Math.sin(ang)];
      for (let i = 0; i < N; i++) {
        const [x1, y1] = P(a[i], R), [x2, y2] = P(b[i], R * 0.74);
        ctx.strokeStyle = hue(W, i, N); ctx.globalAlpha = 0.55; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.globalAlpha = 1;
      }
      const rs = Math.max(7, R * 0.085);
      for (let i = 0; i < N; i++) {
        const [x2, y2] = P(b[i], R * 0.74);
        ctx.fillStyle = hue(W, i, N); ctx.strokeStyle = tok(W, '--surface'); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.rect(x2 - rs * 0.8, y2 - rs * 0.8, rs * 1.6, rs * 1.6); ctx.fill(); ctx.stroke();
      }
      for (let i = 0; i < N; i++) {
        const [x1, y1] = P(a[i], R);
        ctx.fillStyle = hue(W, i, N); ctx.strokeStyle = tok(W, '--surface'); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x1, y1, rs, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = font(W, Math.round(rs * 1.15), 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), x1, y1 + 0.5);
      }
      ctx.fillStyle = mu; ctx.font = font(W, 11, 600); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('● structure (outer)   ■ properties (inner)', cx, 4);
      ctx.textBaseline = 'bottom'; ctx.fillStyle = fg;
      ctx.fillText(`step ${steps}`, cx, hh - 2);
    }
    function drawMatrix(ctx, w, hh) {
      if (w < 40) return;
      const { P } = compute();
      const p = rgbOf(tok(W, '--p')), sf = rgbOf(tok(W, '--surface')), mu = tok(W, '--muted'), p2 = tok(W, '--p2'), fg = tok(W, '--fg');
      const L = 26, T = 40, size = Math.min(w - L - 6, hh - T - 6), c = size / N;
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const v = Math.pow(P[i][j], 0.6);
        const col = mix(sf, p, v);
        ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
        ctx.fillRect(L + j * c + 1, T + i * c + 1, c - 2, c - 2);
        if (c > 30) {
          ctx.fillStyle = v > 0.55 ? tok(W, '--surface') : fg; ctx.font = mono(W, Math.min(11, c * 0.28), 500);
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(P[i][j] >= 0.995 ? '1.0' : P[i][j].toFixed(2).replace(/^0/, ''), L + (j + 0.5) * c, T + (i + 0.5) * c);
        }
      }
      ctx.strokeStyle = p2; ctx.lineWidth = 2.5;
      for (let i = 0; i < N; i++) ctx.strokeRect(L + i * c + 1, T + i * c + 1, c - 2, c - 2);
      ctx.fillStyle = mu; ctx.font = font(W, 11, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < N; i++) {
        ctx.fillStyle = hue(W, i, N);
        ctx.fillText(String(i + 1), L + (i + 0.5) * c, T - 10);
        ctx.fillText(String(i + 1), L - 10, T + (i + 0.5) * c);
      }
      ctx.fillStyle = mu; ctx.font = font(W, 10, 600); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('rows: structures · columns: properties · softmax(S/τ)', L, 8);
    }
    reset(3, 1.6);
    refresh();
  }

  /* =====================================================================
   * Chapter 3 — the network (clickable architecture + fusion ablation)
   * ===================================================================== */
  function chNet(el, W) {
    const h = W.h;
    const NODES = {
      crystal: { t: 'Crystal', s: 'lattice · graph · species',
        d: 'Dense vector v ∈ ℝ<sup>6+N²+N|S|+3N</sup>: six lattice parameters, the N×N neighbour adjacency (within 4 Å), one-hot species and fractional coordinates. N = <code>max_sites</code> (default 20; Perov-5 cells have 5 atoms).' },
      egnn: { t: 'SE3Encoder', s: 'EGNN message passing',
        d: 'Element embedding → EGNN layers on <strong>squared distances only</strong>, so rotations and translations change nothing → masked mean pool → concatenated with a lattice MLP → <i>z</i><sub>c</sub>.<br>m<sub>ij</sub> = φ<sub>e</sub>(h<sub>i</sub>, h<sub>j</sub>, ‖x<sub>i</sub> − x<sub>j</sub>‖²) · a<sub>ij</sub>; h<sub>i</sub>′ = φ<sub>h</sub>(h<sub>i</sub>, ∑<sub>j</sub> m<sub>ij</sub>); x<sub>i</sub>′ = x<sub>i</sub> + ∑<sub>j</sub> (x<sub>i</sub> − x<sub>j</sub>) φ<sub>x</sub>(m<sub>ij</sub>)',
        code: `diff = x.unsqueeze(2) - x.unsqueeze(1)
dist2 = (diff ** 2).sum(dim=-1, keepdim=True)
edge = self.phi_e(torch.cat([h_i, h_j, dist2], dim=-1))
edge = edge * adj.unsqueeze(-1)
x_new = x + (diff * self.phi_x(edge)).sum(dim=2)
h_new = self.phi_h(torch.cat([h, edge.sum(dim=2)], dim=-1))` },
      props: { t: 'Properties', s: '[E_g ; ΔH]', d: 'Direct band gap (eV) and formation enthalpy (eV/atom), normalised. <strong>Early fusion</strong> (the paper’s term): both scalars enter one encoder.' },
      mlp: { t: 'PropertyEncoder', s: 'MLP 2 → 128 → 128', d: 'Linear–ReLU–Linear into the 128-dimensional latent.',
        code: `self.fc = nn.Sequential(nn.Linear(n_properties, hidden_dim), nn.ReLU(),
                        nn.Linear(hidden_dim, latent_dim))` },
      zc: { t: 'z̃c', s: 'normalise', d: 'Each branch is normalised, projected and normalised again: z̃ = g(z)/‖g(z)‖.',
        code: `F.normalize(self.proj_crystal(F.normalize(z_raw, p=2, dim=1)), p=2, dim=1)` },
      zp: { t: 'z̃p', s: 'normalise', d: 'Same projection on the property side.',
        code: `F.normalize(self.proj_prop(F.normalize(self.property_encoder(props), p=2, dim=1)), p=2, dim=1)` },
      nce: { t: 'InfoNCE', s: 'align z̃c ↔ z̃p', d: 'Symmetric contrastive loss with τ = 0.01 (chapter 2). Its weight λ(t) ramps up from 0 (the curriculum).',
        code: `lam = min(epoch / float(tcfg.warmup()), 1.0) * tcfg.contrastive_weight` },
      joint: { t: 'z_joint', s: '(z̃c + z̃p) / 2', d: 'The decoders read the mean of the two latents.',
        code: `z_joint = (z_c + z_p) / 2.0` },
      cdec: { t: 'SE3Decoder', s: 'four output heads', d: 'Predicts lattice, adjacency logits, species logits and coordinates. Reconstruction loss = lattice MSE + adjacency BCE + species cross-entropy + coordinate MSE.' },
      pdec: { t: 'PropertyDecoder', s: 'MLP 128 → 64 → 2', d: 'Predicts the two properties from the latent.' },
      inv: { t: 'z̃p → crystal', s: '', d: '<strong>The term that enables inverse design.</strong> During training the crystal decoder also rebuilds the crystal from the property latent alone, so a point chosen from properties decodes into a structure.',
        code: `lat_p, adj_p, spc_p, crd_p = model.crystal_decoder(zp2, input_coords=coords, center=center)
l_rp = reconstruction_loss(cv, lat_p, adj_p, spc_p, crd_p, model.max_sites)` },
    };
    let variant = 'efcl', sel = 'inv';
    // 200-epoch Perov-5 ablation (arXiv v1 p.7): SM %, CS (0-1), L2D (0-2)
    const ABL = { lf: { SM: 66, CS: 0.31, L2D: 1.06, n: 'Late fusion' }, ef: { SM: 32, CS: 0.89, L2D: 0.45, n: 'Early fusion' }, efcl: { SM: 66, CS: 0.91, L2D: 0.40, n: 'Early fusion + curriculum' } };

    const svgHost = h('div', { class: 'mdn-arch' });
    const info = h('div', { class: 'mdn-info' });
    const bars = h('div', { class: 'mdn-abl' });
    const seg = W.ui.seg([{ value: 'lf', label: 'Late fusion' }, { value: 'ef', label: 'Early fusion' }, { value: 'efcl', label: 'EF + curriculum' }], variant,
      (v) => { variant = v; draw(); drawBars(); }, 'Fusion variant');

    function box(id, x, y, w, hh, kind) {
      const n = NODES[id];
      const g = h('g', { class: 'mdn-node ' + (kind || '') + (sel === id ? ' sel' : ''), tabindex: '0', role: 'button', 'aria-label': n.t,
        onclick: () => { sel = id; draw(); showInfo(); }, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sel = id; draw(); showInfo(); } } });
      g.append(h('rect', { x, y, width: w, height: hh, rx: 9 }),
        h('text', { x: x + w / 2, y: y + (n.s ? hh / 2 - 4 : hh / 2 + 5), class: 't' }, n.t));
      if (n.s) g.append(h('text', { x: x + w / 2, y: y + hh / 2 + 14, class: 's' }, n.s));
      return g;
    }
    function edge(d, cls) { return h('path', { d, class: 'mdn-edge ' + (cls || ''), 'marker-end': 'url(#mdn-arr)' }); }
    function draw() {
      svgHost.innerHTML = '';
      const s = svgEl(W, 820, 330, 'mdn-archsvg');
      s.append(h('defs', null, h('marker', { id: 'mdn-arr', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' },
        h('path', { d: 'M0,0 L10,5 L0,10 z', class: 'mdn-arrhead' })),
        h('marker', { id: 'mdn-arr-inv', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 12, markerHeight: 12, markerUnits: 'userSpaceOnUse', orient: 'auto-start-reverse' },
          h('path', { d: 'M0,0 L10,5 L0,10 z', class: 'mdn-arrhead inv' }))));
      // edges first
      s.append(edge('M140,60 L168,60'), edge('M318,60 L346,60'), edge('M140,270 L168,270'), edge('M318,270 L346,270'),
        edge('M436,70 C470,70 470,165 492,165'), edge('M436,262 C470,262 470,175 492,175'),
        edge('M612,160 C630,160 630,90 650,90'), edge('M612,180 C630,180 630,240 650,240'),
        h('path', { d: 'M391,82 L391,138', class: 'mdn-edge nce' }), h('path', { d: 'M391,192 L391,248', class: 'mdn-edge nce' }),
        h('path', { d: 'M436,282 C560,322 640,300 690,124', class: 'mdn-edge inv' + (sel === 'inv' ? ' sel' : ''), 'marker-end': 'url(#mdn-arr-inv)',
          onclick: () => { sel = 'inv'; draw(); showInfo(); } }));
      const invLabel = h('text', { x: 548, y: 318, class: 'mdn-elab inv', onclick: () => { sel = 'inv'; draw(); showInfo(); } }, 'w₃: rebuild from z̃p alone');
      s.append(invLabel);
      s.append(box('crystal', 6, 30, 134, 60, 'in'), box('egnn', 168, 30, 150, 60, 'enc'), box('zc', 346, 40, 90, 42, 'lat'));
      if (variant === 'lf') {
        s.append(fakeBox(6, 226, 134, 38, 'Band gap'), fakeBox(6, 276, 134, 38, 'Formation enthalpy'),
          fakeBox(168, 226, 150, 38, 'MLP (gap)', 'enc'), fakeBox(168, 276, 150, 38, 'MLP (ΔH)', 'enc'));
      } else {
        s.append(box('props', 6, 240, 134, 60, 'in'), box('mlp', 168, 240, 150, 60, 'enc'));
      }
      s.append(box('zp', 346, 248, 90, 42, 'lat'));
      s.append(box('nce', 336, 138, 110, 54, 'loss'));
      s.append(box('joint', 492, 140, 120, 54, 'lat'));
      s.append(box('cdec', 650, 60, 164, 60, 'dec'), box('pdec', 650, 212, 164, 56, 'dec'));
      if (variant === 'lf') s.append(h('text', { x: 391, y: 210, class: 'mdn-elab' }, '3 pairwise losses'), h('text', { x: 552, y: 210, class: 'mdn-elab' }, 'joint = (c + h + d)/3'));
      if (variant === 'efcl') s.append(h('text', { x: 398, y: 118, class: 'mdn-elab acc', 'text-anchor': 'start', style: { textAnchor: 'start' } }, 'λ(t) ramps 0 → 5'));
      svgHost.appendChild(s);
    }
    function fakeBox(x, y, w, hh, t, kind) {
      return h('g', { class: 'mdn-node ' + (kind || 'in') + ' fake' }, h('rect', { x, y, width: w, height: hh, rx: 8 }), h('text', { x: x + w / 2, y: y + hh / 2 + 5, class: 't sm' }, t));
    }
    function showInfo() {
      const n = NODES[sel];
      info.innerHTML = '';
      info.append(h('div', { class: 'mdn-info-t' }, n.t + (n.s ? ' · ' + n.s : '')), h('p', { html: n.d }));
      if (n.code) info.append(W.ui.code(n.code, 'python'));
    }
    function drawBars() {
      bars.innerHTML = '';
      const metr = [['SM', 'structure matching', 100, (v) => v + '%', true], ['CS', 'cosine similarity', 1, (v) => v.toFixed(2), true], ['L2D', 'L2 distance', 2, (v) => v.toFixed(2), false]];
      metr.forEach(([k, lab, max, f, up]) => {
        const row = h('div', { class: 'mdn-ablrow' }, h('div', { class: 'k' }, `${k} `, h('span', null, `${lab} ${up ? '↑' : '↓'}`)));
        ['lf', 'ef', 'efcl'].forEach((v) => {
          const val = ABL[v][k];
          row.append(h('div', { class: 'bar' + (v === variant ? ' on' : ''), title: ABL[v].n },
            h('i', { style: { width: (100 * val / max) + '%' } }), h('b', { class: 'tnum' }, f(val))));
        });
        bars.append(row);
      });
      bars.append(h('div', { class: 'mdn-ablkey' }, h('span', null, ''), h('span', null, 'LF'), h('span', null, 'EF'), h('span', null, 'EF+CL')));
    }

    const prose = h('div', { class: 'prose' },
      h('p', { html: 'Two autoencoders that share one latent space. Click any block to see what it does and the line of code behind it.' }),
      h('div', { class: 'mdn-eq sm', html: 'L = w<sub>1</sub>L<sub>rec</sub>(z<sub>joint</sub>) + w<sub>2</sub>L<sub>prop</sub>(z<sub>joint</sub>) + <b>w<sub>3</sub>L<sub>rec</sub>(z<sub>p</sub>)</b> + w<sub>4</sub>L<sub>prop</sub>(z<sub>p</sub>) + λ(t) L<sub>InfoNCE</sub>' }),
      h('ul', null,
        h('li', { html: '<strong>Curriculum</strong>: the contrastive weight starts at zero. Crystals are learned first; the scalar properties are easier and come later.' }),
        h('li', { html: 'Reproduced in the repo (paired run): structure matching at epoch 50 is <strong>88.3%</strong> with the curriculum vs <strong>8.5%</strong> without. The paper reports ~60× faster learning.' }),
        h('li', { html: 'Shipped checkpoint: <code>dual_autoencoder_clip_earlyfusion_propertyaware_2k.pth</code> = two autoencoders, CLIP-style alignment, early fusion, property-aware decoding, 2,000 epochs.' })),
      h('div', { class: 'mdn-sub' }, 'Fusion ablation, Perov-5, 200 epochs (paper)'),
      seg.el, bars,
      h('p', { class: 'hint', html: 'Production model (EF + curriculum, 2,000 epochs): cosine ≈ 0.96–0.97, L2D ≈ 0.24. Repo reproduction, 7 seeds: cosine 0.954 ± 0.011, structure matching 86.1 ± 5.0%.' }));
    const stage = W.ui.stage('MEIDNet architecture · meidnet/model.py', svgHost, info);
    el.appendChild(h('div', { class: 'bench even' }, prose, stage));
    draw(); showInfo(); drawBars();
  }

  /* =====================================================================
   * Chapter 4 — inverse design as a search (toy latent search + rules)
   * ===================================================================== */
  // Shannon ionic radii (Å): A site XII-coordinated, B site VI, X anions VI. Fixed table, used for the toy only.
  const RA = { Cs: [1, 1.88], Rb: [1, 1.72], K: [1, 1.64], Na: [1, 1.39], Ba: [2, 1.61], Sr: [2, 1.44], Ca: [2, 1.34], La: [3, 1.36] };
  const RB = { Pb: [2, 1.19], Ge: [2, 0.73], Ti: [4, 0.605], Zr: [4, 0.72], Hf: [4, 0.71], Sn: [4, 0.69], Ta: [5, 0.64], Nb: [5, 0.64], Sc: [3, 0.745] };
  const RX = { I: [-1, 2.20], Br: [-1, 1.96], Cl: [-1, 1.81], O: [-2, 1.40] };
  // Paper SUN materials per band-gap target (arXiv SI Table S1; * = in Materials Project but not in training data)
  const SUN_BY_T = {
    0.8: ['RbTaSe₃', 'RbNbSe₃', 'LaBiTe₃', 'KTaSe₃', 'NaTaSe₃'],
    1.0: ['LaScSe₃', 'EuTaO₃', 'YbYSe₃', 'YbScSe₃'],
    1.2: ['EuCoO₃*', 'YbTaO₃*', 'YbFeSe₃', 'YbCoSe₃', 'TmMnSe₃'],
    1.5: ['KSnI₃*', 'YbMnSe₃', 'BaZrTe₃', 'CsPbI₃*', 'BaHfSe₃'],
  };
  function chSearch(el, W) {
    const h = W.h;
    /* Toy model (illustrative). Latent = 2D square [−3, 3]². A smooth toy "band gap" field
     *   g(x, y) = clamp(1.9 + 1.1 sin(0.9x + 0.3) + 0.7 cos(1.2y − 0.5) + 0.08xy, 0, 3.8)  eV
     * plays the role of the property decoder. 49 toy ABX₃ compositions (one per cell of a jittered 7×7 grid) sit at fixed latent points (seeded).
     * Search (mirrors meidnet/generate.py in spirit): a population of 12 latents starts at a target-dependent point
     * (the "property-encoder output") plus noise, then gradient descent on
     *   E(z_k) = (g(z_k) − T)² + 0.04 ‖z_k − z_0‖² + 0.25 ∑_{l≠k} exp(−‖z_k − z_l‖² / 0.15)   (fit + anchor + repulsion)
     * Decode = snap to the nearest composition. Rules (real definitions, toy radii):
     *   charge q_A + q_B + 3 q_X = 0;  property window |g − T| ≤ 0.4 eV;  Goldschmidt t = (r_A + r_X) / (√2 (r_B + r_X)) ∈ [0.78, 1.05];  μ = r_B / r_X ∈ [0.414, 0.90]. */
    const g = (x, y) => Math.max(0, Math.min(3.8, 1.9 + 1.1 * Math.sin(0.9 * x + 0.3) + 0.7 * Math.cos(1.2 * y - 0.5) + 0.08 * x * y));
    const grad = (x, y) => { const e = 1e-3; return [(g(x + e, y) - g(x - e, y)) / (2 * e), (g(x, y + e) - g(x, y - e)) / (2 * e)]; };
    const D = 3;
    // composition set
    const rr = W.rng(11), comps = [];
    const As = Object.keys(RA), Bs = Object.keys(RB), Xs = Object.keys(RX);
    const seen = new Set();
    let nUnbal = 0;
    // one composition per cell of a jittered 7×7 grid, so the toy family covers the whole map
    for (let gi = 0; gi < 7; gi++) for (let gj = 0; gj < 7; gj++) {
      for (let tries = 0; tries < 400; tries++) {
        const A = As[Math.floor(rr() * As.length)], B = Bs[Math.floor(rr() * Bs.length)], X = Xs[Math.floor(rr() * Xs.length)];
        const key = A + B + X; if (seen.has(key)) continue;
        const q = RA[A][0] + RB[B][0] + 3 * RX[X][0];
        if (q !== 0 && (nUnbal >= 4 || rr() < 0.85)) continue; // step 3 makes most decodes charge-balanced; keep a few failures
        if (q !== 0) nUnbal++;
        seen.add(key);
        const x = -D + (gi + 0.5) * (2 * D / 7) + (rr() - 0.5) * 0.45, y = -D + (gj + 0.5) * (2 * D / 7) + (rr() - 0.5) * 0.45;
        const t = (RA[A][1] + RX[X][1]) / (Math.SQRT2 * (RB[B][1] + RX[X][1]));
        const mu = RB[B][1] / RX[X][1];
        comps.push({ A, B, X, f: A + B + X + '₃', x, y, gap: g(x, y), q, t, mu });
        break;
      }
    }
    comps.forEach((c) => {
      c.fail = c.q !== 0 ? 'charge' : (c.t < 0.78 || c.t > 1.05) ? 'tolerance t' : (c.mu < 0.414 || c.mu > 0.9) ? 'octahedral μ' : null;
    });
    let T = 1.5, pop = [], trails = [], z0 = [0, 0], phase = 'done', decoded = [], stopAnim = null, seed = 5;
    // last check (like the package's property_window rule): toy gap within ±0.4 eV of the target
    const why = (c) => c.fail || (Math.abs(c.gap - T) > 0.4 ? 'off target' : null);

    function start() {
      // target-dependent start point (toy "property-encoder output") + a target-dependent direction
      z0 = [-2.2 + 1.3 * T, 1.6 * Math.sin(1.7 * T + 0.4)];
      const r = W.rng(seed);
      pop = []; trails = [];
      for (let k = 0; k < 12; k++) { const p = [z0[0] + (r() - 0.5) * 1.6, z0[1] + (r() - 0.5) * 1.6]; pop.push(p); trails.push([p.slice()]); }
      decoded = []; phase = 'opt';
    }
    function optStep() {
      const lr = 0.05;
      const next = pop.map((p, k) => {
        const [gx, gy] = grad(p[0], p[1]), r = g(p[0], p[1]) - T;
        let fx = 2 * r * gx + 0.08 * (p[0] - z0[0]), fy = 2 * r * gy + 0.08 * (p[1] - z0[1]);
        pop.forEach((q, l) => {
          if (l === k) return;
          const dx = p[0] - q[0], dy = p[1] - q[1], e = Math.exp(-(dx * dx + dy * dy) / 0.15);
          fx += 0.25 * e * (-2 * dx / 0.15); fy += 0.25 * e * (-2 * dy / 0.15);
        });
        const nx = Math.max(-D, Math.min(D, p[0] - lr * fx)), ny = Math.max(-D, Math.min(D, p[1] - lr * fy));
        return [nx, ny];
      });
      pop = next; pop.forEach((p, k) => trails[k].push(p.slice()));
    }
    function decode() {
      const pick = new Map();
      pop.forEach((p) => {
        let best = null, bd = 1e9;
        comps.forEach((c) => { const d = Math.hypot(c.x - p[0], c.y - p[1]); if (d < bd) { bd = d; best = c; } });
        pick.set(best.f, best);
      });
      decoded = [...pick.values()];
      phase = 'done';
    }
    function runInstant() { start(); for (let i = 0; i < 70; i++) optStep(); decode(); }

    const cvHost = h('div', { class: 'mdn-cv' });
    const funnel = h('div', { class: 'mdn-funnel' });
    const cands = h('div', { class: 'mdn-cands' });
    const sunBox = h('p', { class: 'hint' });
    const tSl = W.ui.slider({ label: 'Target band gap', min: 0.5, max: 3.5, step: 0.1, value: T, fmt: (v) => v.toFixed(1) + ' eV',
      onInput: (v) => { stop(); T = v; runInstant(); refresh(); } });
    const bRun = h('button', { class: 'btn', type: 'button', onclick: run }, 'Run search');
    const bNew = h('button', { class: 'btn ghost', type: 'button', onclick: () => { stop(); seed++; runInstant(); refresh(); } }, 'New population');
    const presets = W.ui.seg([0.8, 1.0, 1.2, 1.5].map((v) => ({ value: v, label: v.toFixed(1) + ' eV' })), 1.5, (v) => tSl.set(v), 'Paper targets');

    const stage = W.ui.stage('Toy model · search a 2D latent for a band-gap target');
    stage.append(cvHost, tSl.el, h('div', { class: 'ctrl-row' }, bRun, bNew, h('span', { class: 'hint' }, 'Paper targets:'), presets.el), funnel, cands, sunBox,
      h('p', { class: 'hint', html: 'Illustrative: the gap field, latent positions and population are invented. Rule formulas are real; radii are fixed Shannon values, not the package’s averaged radii.' }));
    const cv = W.canvas(cvHost, draw, { aspect: NARROW() ? 0.85 : 0.56, label: 'Toy latent map coloured by predicted band gap, with the search population' });

    const prose = h('div', { class: 'prose' },
      h('ol', { class: 'mdn-steps' },
        h('li', { html: '<strong>Start</strong> a population of latents at the property encoder’s output for the target, plus noise.' }),
        h('li', { html: '<strong>Optimise</strong> by gradient descent: decoded properties → target, soft chemistry terms, repulsion for diversity.' }),
        h('li', { html: '<strong>Decode</strong> one element per site group; the last group is drawn only from charge-balancing elements.' }),
        h('li', { html: '<strong>Rules</strong>: hard checks (charge neutrality, distances, bond window, tolerance factor <i>t</i>, octahedral factor μ).' }),
        h('li', { html: '<strong>Rank</strong> by distance to the target, drop duplicates, write CIFs and an HTML report.' })),
      h('div', { class: 'code-label' }, 'examples/perov5/meidnet.yaml (excerpt)'),
      W.ui.code(`generation:
  family: perovskite_abx3
  variant: halide
  objectives:
    - {property: dir_gap,  loss: l2, weight: 10000, select_weight: 1.0}
    - {property: heat_all, loss: l1, weight: 6000,  select_weight: 0.4}
  targets:
    - {dir_gap: 1.5, heat_all: -0.10}
  population: 48
  rounds: 20
  steps: 800`, 'yaml'),
      W.ui.callout('<strong>One real round</strong> (published model, halides, target 1.5 eV): 411 decoding attempts, 48 latents decoded, 15 pass all rules. First failures: octahedral factor 171, no charge-balancing element 140, tolerance factor 85. First kept: RbZnI₃, predicted 1.550 eV, <i>t</i> = 0.963, μ = 0.691.'),
      h('p', { class: 'hint', html: '<strong>Scope:</strong> generation works within <strong>prototype families</strong> (YAML data: sites, allowed elements, rules). It does not invent new atomic arrangements. Halide perovskite design space: 924 compositions.' }));
    el.appendChild(h('div', { class: 'bench' }, prose, stage));

    function stop() { if (stopAnim) { stopAnim(); stopAnim = null; } bRun.disabled = false; }
    function run() {
      stop();
      if (W.reduceMotion) { runInstant(); refresh(); return; }
      start(); refresh();
      let n = 0; bRun.disabled = true;
      stopAnim = W.raf(() => {
        optStep(); optStep(); n += 2; cv.redraw();
        if (n >= 70) { decode(); stop(); refresh(); }
      });
    }
    function refresh() {
      cv.redraw();
      funnel.innerHTML = ''; cands.innerHTML = '';
      const charge = decoded.filter((c) => c.q === 0), tOK = charge.filter((c) => c.t >= 0.78 && c.t <= 1.05), muOK = tOK.filter((c) => c.mu >= 0.414 && c.mu <= 0.9);
      const near = muOK.filter((c) => !why(c));
      const st = phase === 'done' ? [['12', 'latents'], [decoded.length, 'distinct decoded'], [charge.length, 'charge-balanced'], [tOK.length, 'pass t'], [muOK.length, 'pass μ'], [near.length, 'gap ± 0.4 eV (kept)']]
        : [['12', 'latents'], ['…', 'optimising']];
      st.forEach(([n, k], i) => funnel.append(h('div', { class: 'f' + (i === st.length - 1 && phase === 'done' ? ' last' : '') }, h('b', { class: 'tnum' }, String(n)), h('span', null, k))));
      if (phase === 'done') {
        decoded.slice().sort((x, y) => (!!why(x) - !!why(y)) || Math.abs(x.gap - T) - Math.abs(y.gap - T)).forEach((c) => {
          cands.append(h('span', { class: 'mdn-cand ' + (why(c) ? 'bad' : 'good'), title: `t = ${c.t.toFixed(3)}, μ = ${c.mu.toFixed(3)}, charge ${c.q > 0 ? '+' : ''}${minus(c.q)}` },
            h('b', null, sub(c.A + c.B + c.X) + '₃'), h('span', null, why(c) ? '✗ ' + why(c) + (c.fail ? '' : ` (${c.gap.toFixed(2)} eV)`) : `✓ ${c.gap.toFixed(2)} eV`)));
        });
      }
      const key = [0.8, 1.0, 1.2, 1.5].find((v) => Math.abs(v - T) < 1e-6);
      sunBox.innerHTML = key ? `<strong>Paper, ${key.toFixed(1)} eV target:</strong> SUN materials found: ${SUN_BY_T[key].join(', ')} (* in Materials Project, not in the training data).`
        : 'Paper targets were 0.8, 1.0, 1.2 and 1.5 eV at −25 meV/atom, 35 candidates each. Pick one to see the real SUN materials.';
      presets.el.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String([0.8, 1.0, 1.2, 1.5][i] === key)));
    }
    let heat = null, heatKey = '';
    function draw(ctx, w, hh) {
      if (w < 40) return;
      const X = (x) => ((x + D) / (2 * D)) * w, Y = (y) => hh - ((y + D) / (2 * D)) * hh;
      const p = rgbOf(tok(W, '--p')), sf = rgbOf(tok(W, '--surface')), p2 = rgbOf(tok(W, '--p2'));
      const key = p + sf + p2 + T;
      if (key !== heatKey) {
        heatKey = key;
        const gw = 120, gh = 68;
        heat = document.createElement('canvas'); heat.width = gw; heat.height = gh;
        const hc = heat.getContext('2d'), im = hc.createImageData(gw, gh);
        for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
          const x = -D + (2 * D * (i + 0.5)) / gw, y = D - (2 * D * (j + 0.5)) / gh, v = g(x, y);
          let c = mix(sf, p, 0.08 + 0.62 * (v / 3.8));
          if (Math.abs(v - T) < 0.07) c = mix(c, p2, 0.85);
          const o = 4 * (j * gw + i); im.data[o] = c[0]; im.data[o + 1] = c[1]; im.data[o + 2] = c[2]; im.data[o + 3] = 255;
        }
        hc.putImageData(im, 0, 0);
      }
      ctx.imageSmoothingEnabled = true; ctx.drawImage(heat, 0, 0, w, hh);
      const fg = tok(W, '--fg'), mu = tok(W, '--muted'), good = tok(W, '--good'), bad = tok(W, '--bad'), pc = tok(W, '--p'), p2c = tok(W, '--p2');
      // compositions
      const dec = new Set(decoded.map((c) => c.f));
      comps.forEach((c) => {
        const on = dec.has(c.f);
        ctx.fillStyle = on ? (why(c) ? bad : good) : rgba(mu, 0.75);
        ctx.beginPath(); ctx.arc(X(c.x), Y(c.y), on ? 6 : 3.5, 0, 7); ctx.fill();
        if (on) {
          ctx.strokeStyle = tok(W, '--surface'); ctx.lineWidth = 1.5; ctx.stroke();
          ctx.font = font(W, NARROW() ? 10 : 12, 700); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          const lab = sub(c.A + c.B + c.X) + '₃';
          ctx.lineWidth = 3; ctx.strokeStyle = tok(W, '--surface'); ctx.strokeText(lab, X(c.x) + 8, Y(c.y));
          ctx.fillStyle = why(c) ? bad : fg; ctx.fillText(lab, X(c.x) + 8, Y(c.y));
        }
      });
      // trails + population
      trails.forEach((tr) => {
        ctx.strokeStyle = rgba(pc, 0.55); ctx.lineWidth = 1.4; ctx.beginPath();
        tr.forEach((q, i) => (i ? ctx.lineTo(X(q[0]), Y(q[1])) : ctx.moveTo(X(q[0]), Y(q[1])))); ctx.stroke();
      });
      pop.forEach((q) => { ctx.fillStyle = pc; ctx.beginPath(); ctx.arc(X(q[0]), Y(q[1]), 3.2, 0, 7); ctx.fill(); });
      // start marker
      ctx.strokeStyle = fg; ctx.lineWidth = 2;
      const sx = X(z0[0]), sy = Y(z0[1]);
      ctx.beginPath(); ctx.moveTo(sx - 6, sy - 6); ctx.lineTo(sx + 6, sy + 6); ctx.moveTo(sx + 6, sy - 6); ctx.lineTo(sx - 6, sy + 6); ctx.stroke();
      // legend
      ctx.font = font(W, 11, 700); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      const lg = [['band = target gap', p2c, 'band'], ['× start (property encoder)', fg, 'x'], ['● kept', good, 'dot'], ['● rejected by a rule', bad, 'dot']];
      let ly = 6;
      const lh = NARROW() ? 13 : 16; ctx.font = font(W, NARROW() ? 10 : 11, 700);
      ctx.fillStyle = rgba(tok(W, '--surface'), 0.85); ctx.fillRect(4, 4, NARROW() ? 140 : 180, lg.length * lh + 6);
      lg.forEach(([t, c, k]) => {
        ctx.fillStyle = c;
        if (k === 'band') ctx.fillRect(10, ly + 3, 14, 7); else if (k === 'x') { ctx.fillText('×', 12, ly - 1); } else { ctx.beginPath(); ctx.arc(17, ly + 6, 4.5, 0, 7); ctx.fill(); }
        ctx.fillStyle = fg; ctx.fillText(t.replace(/^● |^× /, ''), 30, ly); ly += lh;
      });
      ctx.font = font(W, 11, 600); ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.lineWidth = 3; ctx.strokeStyle = tok(W, '--surface'); ctx.strokeText('stronger tint = larger predicted gap (toy)', w - 6, hh - 4);
      ctx.fillStyle = fg; ctx.fillText('stronger tint = larger predicted gap (toy)', w - 6, hh - 4);
    }
    runInstant(); refresh();
  }

  /* =====================================================================
   * Chapter 5 — results (paper inverse design · reconstruction · open benchmark)
   * ===================================================================== */
  // arXiv SI Table S1: formula, target, CGCNN gap, DFT gap, Ehull eSEN (meV), Ehull DFT (meV)
  const S1 = [
    ['RbTaSe₃', 0.8, 0.792, 0, 98.81, 94.2], ['RbNbSe₃', 0.8, 0.81, 0, 49.35, 97.6], ['LaBiTe₃', 0.8, 0.764, 0.14, 94.61, 0],
    ['KTaSe₃', 0.8, 0.807, 0, 88.6, 0], ['NaTaSe₃', 0.8, 0.784, 0.91, 92.3, 0], ['LaScSe₃', 1.0, 0.981, 0.72, 91.88, 95.6],
    ['EuTaO₃', 1.0, 1.016, 0, 0, 0], ['YbYSe₃', 1.0, 1.023, 0.78, 0, 0], ['YbScSe₃', 1.0, 0.997, 0.63, 0, 0],
    ['EuCoO₃*', 1.2, 1.192, 0, 28.4, 0], ['YbTaO₃*', 1.2, 1.206, 0, 97.6, 0], ['YbFeSe₃', 1.2, 1.201, 0, 0, 0],
    ['YbCoSe₃', 1.2, 1.211, 0, 0, 0], ['TmMnSe₃', 1.2, 1.18, 0, 81.8, 88.6], ['KSnI₃*', 1.5, 1.501, 1.89, 0, 0],
    ['YbMnSe₃', 1.5, 1.509, 0, 0, 0], ['BaZrTe₃', 1.5, 1.47, 1.1, 96.3, 0], ['CsPbI₃*', 1.5, 1.526, 1.48, 28.43, 25],
    ['BaHfSe₃', 1.5, 1.48, 0.21, 66.78, 98.7],
  ];
  function chResults(el, W) {
    const h = W.h;
    const panel = h('div', { class: 'mdn-panel' });
    const seg = W.ui.seg([{ value: 'gap', label: 'Band gaps of the 19 SUN' }, { value: 'gal', label: 'SUN gallery' }, { value: 'rec', label: 'Reconstruction' }, { value: 'open', label: 'Open benchmark' }], 'gap', show, 'Result view');

    function scatter() {
      const wrap = h('div', null);
      const read = h('p', { class: 'hint mdn-hov' }, 'Hover or tap a point.');
      const Wd = 560, Hd = 320, L = 50, R = 14, Tp = 14, B = 40;
      const x0 = 0.65, x1 = 1.65, y0 = -0.1, y1 = 2.0;
      const X = (v) => L + ((v - x0) / (x1 - x0)) * (Wd - L - R), Y = (v) => Tp + ((y1 - v) / (y1 - y0)) * (Hd - Tp - B);
      const s = svgEl(W, Wd, Hd, 'mdn-plot');
      [0, 0.5, 1, 1.5, 2].forEach((v) => s.append(h('line', { x1: L, x2: Wd - R, y1: Y(v), y2: Y(v), class: 'grid' }), h('text', { x: L - 8, y: Y(v) + 4, class: 'ax', 'text-anchor': 'end' }, v.toFixed(1))));
      [0.8, 1.0, 1.2, 1.5].forEach((v) => s.append(h('text', { x: X(v), y: Hd - B + 18, class: 'ax', 'text-anchor': 'middle' }, v.toFixed(1))));
      s.append(h('line', { x1: X(0.7), y1: Y(0.7), x2: X(1.6), y2: Y(1.6), class: 'diag' }),
        h('text', { x: (L + Wd - R) / 2, y: Hd - 6, class: 'ax lab', 'text-anchor': 'middle' }, 'target band gap (eV)'),
        h('text', { x: 14, y: (Tp + Hd - B) / 2, class: 'ax lab', 'text-anchor': 'middle', transform: `rotate(-90 14 ${(Tp + Hd - B) / 2})` }, 'band gap (eV)'));
      const cnt = {};
      S1.forEach((r) => {
        const k = r[1]; cnt[k] = (cnt[k] || 0) + 1;
        const n = S1.filter((q) => q[1] === k).length, off = (cnt[k] - (n + 1) / 2) * 0.022;
        const msg = `<strong>${r[0]}</strong> · target ${r[1].toFixed(1)} eV · CGCNN ${r[2]} eV · DFT (PBE) ${r[3]} eV · E<sub>hull</sub> eSEN ${r[4]} meV, DFT ${r[5]} meV`;
        const on = () => { read.innerHTML = msg; };
        s.append(h('line', { x1: X(k + off), x2: X(k + off), y1: Y(r[2]), y2: Y(r[3]), class: 'link' }));
        s.append(h('circle', { cx: X(k + off), cy: Y(r[3]), r: 5.5, class: 'dft', tabindex: '0', onmouseenter: on, onfocus: on, onclick: on }, h('title', null, r[0] + ' DFT')));
        s.append(h('circle', { cx: X(k + off), cy: Y(r[2]), r: 5, class: 'cg', tabindex: '0', onmouseenter: on, onfocus: on, onclick: on }, h('title', null, r[0] + ' CGCNN')));
      });
      s.append(h('circle', { cx: L + 16, cy: Tp + 10, r: 5, class: 'cg' }), h('text', { x: L + 26, y: Tp + 14, class: 'ax' }, 'CGCNN check (MAE ~0.02 eV)'),
        h('circle', { cx: L + 16, cy: Tp + 28, r: 5.5, class: 'dft' }), h('text', { x: L + 26, y: Tp + 32, class: 'ax' }, 'DFT (PBE, no +U, no SOC)'));
      wrap.append(s, read);
      return wrap;
    }
    function recon() {
      const rows = [['FTCP', 99.34, 62.28, 69.89], ['CDVAE', 97.52, 55.22, 45.43], ['MEIDNet', 99.85, 66.4, 72.35]];
      const sets = ['Perov-5', 'Carbon-24', 'MP-20'];
      const box = h('div', { class: 'mdn-gbars' });
      sets.forEach((sname, si) => {
        box.append(h('div', { class: 'mdn-gset' }, h('div', { class: 'k' }, sname),
          rows.map((r) => h('div', { class: 'bar' + (r[0] === 'MEIDNet' ? ' on' : '') }, h('span', { class: 'n' }, r[0]),
            h('span', { class: 'track' }, h('i', { style: { width: r[si + 1] + '%' } })), h('b', { class: 'tnum' }, r[si + 1].toFixed(2) + '%')))));
      });
      return h('div', null, box, h('p', { class: 'hint', html: 'Structure-matching rate (%) when encoding and decoding test crystals (paper Table 1). Joint reconstruction of E<sub>g</sub> and H<sub>f</sub> tracks the ground truth with R² ≈ 0.996.' }));
    }
    function open() {
      // docs/benchmarks/perov5.md, protocol perov5-v1.1 (54 candidates, MACE-MP-0, ΔHf ≤ 0.1 eV/atom vs elements)
      const LB = [['Encoder screening (baseline)', 0.852, null, true], ['Random sampling (baseline)', 0.778, 0.0, true], ['MEIDNet, first early-fusion model', 0.648, 0.188],
        ['MEIDNet, published model (2k)', 0.611, 0.056], ['MEIDNet, alignment training, seed 3', 0.611, 0.25], ['MEIDNet, shorter training', 0.556, 0.056]];
      const wrap = h('div', null);
      const bars = h('div', { class: 'mdn-lb' });
      let m = 1;
      const sg = W.ui.seg([{ value: 1, label: 'ΔHf·U·N' }, { value: 2, label: 'DFT hit rate' }], 1, (v) => { m = v; drawLB(); }, 'Metric');
      function drawLB() {
        bars.innerHTML = '';
        LB.forEach((r) => {
          const v = r[m];
          bars.append(h('div', { class: 'row' + (r[3] ? ' base' : '') }, h('span', { class: 'n' }, r[0]),
            h('span', { class: 'track' }, h('i', { style: { width: (v == null ? 0 : v * 100) + '%' } })), h('b', { class: 'tnum' }, v == null ? '–' : v.toFixed(3))));
        });
      }
      drawLB();
      wrap.append(sg.el, bars, h('p', { class: 'hint', html: 'Perov-5, 3 targets × 3 variants × 6 = 54 candidates, MACE-MP-0 relaxation, ΔH<sub>f</sub> ≤ 0.1 eV/atom against the elements, novelty against all 18,928. DFT hit = within 0.5 eV of the target where Perov-5 has the same A, B, X.' }),
        W.ui.callout('The platform publishes this with its baselines: ΔH<sub>f</sub>·U·N is <strong>not</strong> hull stability, and the published model is <strong>below</strong> both baselines on it. It met the band-gap target in 1 of 18 DFT checks. Not comparable with the paper’s 13.6%.'));
      return wrap;
    }
    function show(v) {
      panel.innerHTML = '';
      panel.append(v === 'gap' ? scatter() : v === 'gal' ? W.ui.fig(FIG + 'figS2_sun_gallery.jpg', 'The other 15 SUN structures (paper Fig. S2, panels a–o), as generated by MEIDNet, before the phonon check.') : v === 'rec' ? recon() : open());
    }

    const prose = h('div', { class: 'prose' },
      W.ui.stats([{ v: '140', k: 'generated (4 targets × 35)' }, { v: '19', k: 'SUN' }, { v: '13.6%', k: 'SUN rate, no further filtering' }]),
      h('ul', null,
        h('li', { html: '<strong>S</strong>table: E<sub>hull</sub> &lt; 100 meV vs Materials Project after eSEN-30M-OAM relaxation (a loose, metastable window). <strong>U</strong>nique. <strong>N</strong>ovel: not in the training data.' }),
        h('li', { html: 'Targets 0.8, 1.0, 1.2, 1.5 eV at −25 meV/atom. CGCNN agrees with MEIDNet (MAE ~0.02 eV), but <strong>PBE gaps are often lower</strong>: 10 of 19 have a DFT gap of 0.' }),
        h('li', { html: 'As reported by the authors for single-modality generators: MatterGen ~39%, CDVAE ≈ 18%, Matra-Genoa ~16%, FTCP &lt; 5%. Criteria differ between papers.' })),
      W.ui.fig(FIG + 'fig3_sun.jpg', '(a) E<sub>hull</sub> of the 140 generated structures. (b) SUN share. (c) YbScSe₃, LaScSe₃, BaHfSe₃, KTaSe₃. Paper Fig. 3.'));
    const stage = W.ui.stage('Results', seg.el, panel);
    el.appendChild(h('div', { class: 'bench even' }, prose, stage));
    show('gap');
  }

  /* =====================================================================
   * Chapter 6 — generated → repaired → scored (VibroML, ProtoCSP)
   * ===================================================================== */
  // arXiv SI Table S2 (DFT): Ehull before/after (meV), Eg before/after (eV); * = predicted metallic, gap assumes 1–2 eV Fermi shift
  const S2 = [
    ['KTaSe₃', 'ktase3', 0, 0, 0, '0.68'], ['LaScSe₃', 'lascse3', 95.6, 58, 0.72, '1.05'], ['YbScSe₃', 'ybscse3', 0, 0, 0.63, '1.68'],
    ['LaBiTe₃', 'labite3', 0, 0, 0.14, '1.38'], ['YbFeSe₃', 'ybfese3', 0, 0, 0, '0.79*'], ['YbMnSe₃', 'ybmnse3', 0, 0, 0, '1.98*'],
    ['YbCoSe₃', 'ybcose3', 0, 0, 0, '0.67*'], ['TmMnSe₃', 'tmmnse3', 88.6, 41, 0, '0.79*'], ['BaHfSe₃', 'bahfse3', 98.7, 0, 0.21, '0.22'],
  ];
  function chRepair(el, W) {
    const h = W.h;
    let cur = 8;
    const strip = h('div', { class: 'mdn-strip' },
      [['MEIDNet', '19 SUN perovskites, E<sub>hull</sub> &lt; 100 meV'], ['Phonons', 'Phonopy + MACE-OMAT-0: soft modes, dynamically unstable at 0 K'],
        ['VibroML GA', 'search for lower-energy polymorphs (19 generations); pick the most symmetric of the 3 lowest without soft modes'], ['DFT', 'E<sub>hull</sub> and band gap re-computed']]
        .map(([t, d], i) => h('div', { class: 'st' }, h('b', null, `${i + 1}. ${t}`), h('span', { html: d }))));
    const list = h('div', { class: 'mdn-clist', role: 'tablist', 'aria-label': 'Compounds' });
    const btns = S2.map((r, i) => { const b = h('button', { type: 'button', role: 'tab', onclick: () => sel(i) }, r[0]); list.append(b); return b; });
    const card = h('div', { class: 'mdn-rep' });
    const img = h('img', { alt: '', loading: 'lazy' });
    const cap = h('figcaption');
    const fig = h('figure', { class: 'fig mdn-ph' }, img, cap);
    function dumb(label, a, b, max, unit, star) {
      const pa = Math.min(100, (a / max) * 100), pb = Math.min(100, (parseFloat(b) / max) * 100);
      return h('div', { class: 'mdn-db' }, h('div', { class: 'k', html: label }),
        h('div', { class: 'track' }, h('span', { class: 'seg', style: { left: Math.min(pa, pb) + '%', width: Math.abs(pb - pa) + '%' } }),
          h('span', { class: 'dot a', style: { left: pa + '%' } }), h('span', { class: 'dot b' + (star ? ' star' : ''), style: { left: pb + '%' } })),
        h('div', { class: 'v tnum', html: `${a}${unit} → <b>${b}${unit}</b>` }));
    }
    function sel(i) {
      cur = i;
      const r = S2[i];
      btns.forEach((b, j) => b.setAttribute('aria-selected', String(i === j)));
      card.innerHTML = '';
      card.append(dumb('E<sub>hull</sub> (DFT)', r[2], String(r[3]), 100, ' meV'), dumb('E<sub>g</sub> (DFT)', r[4], r[5].replace('*', ''), 2, ' eV', r[5].includes('*')),
        h('p', { class: 'hint', html: r[5].includes('*') ? '* Predicted metallic; the gap assumes a 1–2 eV Fermi-level shift (defects or a proper Hubbard correction could restore semiconducting behaviour).'
          : (r[0] === 'KTaSe₃' ? 'Metallic as a cubic perovskite; the VibroML polymorph has a small direct gap of 0.68 eV.' : r[0] === 'BaHfSe₃' ? 'From 98.7 meV above the hull to on the hull.' : 'Lower-energy polymorphs show larger gaps: reduced electronic dimensionality.') }));
      img.src = FIG + 'ph_' + r[1] + '.jpg';
      img.alt = 'Phonon bands of ' + r[0] + ' before (top) and after (bottom) VibroML';
      cap.innerHTML = `${r[0]}: phonons (MACE-OMAT-0) of the generated cubic cell (top, imaginary modes shaded) and of the VibroML polymorph (bottom). Paper Fig. S7` + (r[0] === 'LaBiTe₃' ? ' (the panel is titled LaBiSe₃ there; Tables S1–S2 list LaBiTe₃).' : '.');
    }
    const prose = h('div', { class: 'prose' },
      h('p', { html: 'Thermodynamically plausible is not dynamically stable. The generated cubic perovskites had soft modes; VibroML remediated nine of them (paper Table S2). This is the part of the paper I did.' }),
      list, card,
      h('div', { class: 'mdn-next' },
        h('div', { class: 'nx' }, h('b', null, 'ProtoCSP'), h('span', { html: 'KTaSe₃ continues as an alloying target: (K,Ba)(Ta,Zr)(Se,O)₃. Pure KTaSe₃: f<sub>soft</sub> 16.0%, ω<sub>min</sub> −2.32 THz (VibroML revision).' })),
        h('div', { class: 'nx' }, h('b', null, 'Open problem'), h('span', { html: 'The learned latents are not regular: structure and property latents each span ~2 of 128 dimensions (participation ratio, repo reproduction). A smooth structure–chemistry distance for novelty scoring is a natural next step, not yet a result.' }))));
    const stage = W.ui.stage('Phonons before / after VibroML (MACE-OMAT-0, paper Fig. S7)', fig);
    el.append(strip, h('div', { class: 'bench even' }, prose, stage));
    sel(cur);
  }

  /* =====================================================================
   * Chapter 7 — MEIDNet Prism: learn, benchmark, develop
   * ===================================================================== */
  function chPrism(el, W) {
    const h = W.h;
    // Studio blocks and colours: docs/use/studio.md
    const BLOCKS = [
      { k: 'Data', c: 'blue', d: 'The table of materials the model learns from: usable rows, skip reasons, property distributions. Upload CSV/Excel/JSON with CIFs.', cli: 'meidnet check meidnet.yaml      # → check_report.html' },
      { k: 'Model', c: 'orange', d: 'The trained network (published or yours): properties, units, training ranges, validation errors, loss and alignment curves.', cli: 'meidnet train meidnet.yaml      # → model.pt + training_report.html' },
      { k: 'Family', c: 'green', d: 'The crystal prototype and the elements allowed on each site, with charges. Click a chip to exclude an element.', cli: 'meidnet families perovskite_abx3' },
      { k: 'Rules', c: 'amber', d: 'The hard checks every candidate must pass, with pass counts, descriptor histograms and the funnel.', cli: 'meidnet space meidnet.yaml      # every composition, rule values, predictions → CSV' },
      { k: 'Targets', c: 'pink', d: 'The property values you want; the predicted-property scatter of all compositions; an extrapolation warning outside the training range.', cli: '# generation.targets in meidnet.yaml\n- {dir_gap: 1.5, heat_all: -0.10}' },
      { k: 'Search', c: 'dkgreen', d: 'The paper’s latent optimisation, run live: budget, progress, log.', cli: 'meidnet generate meidnet.yaml   # → CIFs + generation_report.html' },
      { k: 'Candidates', c: 'violet', d: 'One card per candidate: 3D cell, predicted values against the targets, the rule checklist, CIF links.', cli: 'meidnet score runs/demo/cifs --reference data/perov5' },
    ];
    let cur = 3;
    const strip = h('div', { class: 'mdn-blocks', role: 'tablist', 'aria-label': 'Studio blocks' });
    const bb = BLOCKS.map((b, i) => { const e = h('button', { type: 'button', role: 'tab', class: 'blk c-' + b.c, onclick: () => pick(i) }, b.k); strip.append(e); return e; });
    const det = h('div', { class: 'mdn-blkdet' });
    const chain = h('div', { class: 'mdn-chain' });
    let changed = false;
    const bChain = h('button', { class: 'btn ghost', type: 'button', onclick: () => { changed = !changed; drawChain(); } }, 'Lower the tolerance-factor max');
    function drawChain() {
      chain.innerHTML = changed
        ? '<span class="hint">Example flow chain from the Studio docs:</span><br><b class="c-amber">Rules:</b> Goldschmidt tolerance factor max 1.05 → 1 ➜ <b class="c-amber">Rules:</b> pass all rules 27 → 23 (−4) ➜ <b class="c-pink">Targets:</b> best match CsSnBr₃ → CsGeBr₃ ➜ <b class="c-violet">Candidates:</b> 1 of 3 found candidates would now be rejected'
        : '<span class="hint">Change a rule: every later block updates at once, and the flow chain says what changed.</span>';
      bChain.textContent = changed ? 'Undo' : 'Lower the tolerance-factor max';
      bb.forEach((e, i) => e.classList.toggle('flash', changed && i >= 3));
    }
    function pick(i) {
      cur = i;
      bb.forEach((e, j) => e.setAttribute('aria-selected', String(i === j)));
      det.innerHTML = '';
      det.append(h('p', { html: `<strong>${BLOCKS[i].k}.</strong> ${BLOCKS[i].d}` }), W.ui.code(BLOCKS[i].cli, BLOCKS[i].k === 'Targets' ? 'yaml' : 'bash'));
    }

    const LINKS = [
      ['MEIDNet Prism', 'Learn, benchmark, develop: the platform home', 'https://babu09-meidnet.hf.space/'],
      ['MEIDNet Studio', 'Hosted live workbench', 'https://babu09-meidnet.hf.space/studio/'],
      ['Docs', 'Course, architecture atlas, 31 databases', 'https://babu09-meidnet.hf.space/docs/'],
      ['MEIDNet Matter', '“What should I investigate next?”', 'https://babu09-meidnet-matter.hf.space/'],
      ['Model weights', 'Hugging Face Babu09/MEIDNet', 'https://huggingface.co/Babu09/MEIDNet'],
      ['Benchmarks', 'Perov-5 leaderboards with baselines', 'https://babu09-meidnet.hf.space/docs/benchmarks/perov5.html'],
      ['GitHub', 'ABnano/MEIDNet · MIT · v2.3.1', 'https://github.com/ABnano/MEIDNet'],
      ['Paper', 'npj Comput. Mater. 12, 287 (2026)', 'https://doi.org/10.1038/s41524-026-02153-3'],
    ];
    const cards = h('div', { class: 'mdn-links' }, LINKS.map(([t, d, u]) => h('a', { href: u, target: '_blank', rel: 'noopener', class: 'lk' }, h('b', null, t), h('span', null, d))));

    const SNIP = {
      demo: `pip install meidnet
meidnet demo                      # halide perovskites, band gap 2.0 eV → CIFs + report
meidnet demo --family oxide --band-gap 3 --enthalpy -0.2 -n 5`,
      own: `meidnet init --table materials.csv --properties band_gap dielectric --family perovskite_abx3 --variant oxide
meidnet check meidnet.yaml      # → check_report.html: what is usable, what was skipped and why
meidnet train meidnet.yaml      # → model.pt + training_report.html
meidnet generate meidnet.yaml   # → CIFs + generation_report.html
meidnet studio meidnet.yaml`,
      score: `meidnet score runs/demo/cifs --reference data/perov5   # validity, uniqueness, novelty, diversity of any CIF folder
meidnet score DIR --targets targets.csv --tolerance dir_gap=0.3
meidnet score DIR --mlip --out report.json`,
      api: `from huggingface_hub import hf_hub_download
from meidnet.checkpoint import load_checkpoint, describe

path = hf_hub_download("Babu09/MEIDNet", "dual_autoencoder_clip_earlyfusion_propertyaware_2k.pth")
lm = load_checkpoint(path)
print(describe(lm))                  # properties, units, training ranges

from meidnet.config import load_config
from meidnet.pipeline import check, train, generate
cfg = load_config("meidnet.yaml")
result = generate(cfg)               # GenerationResult: .saved (candidates), .targets (funnel logs)`,
      rule: `from meidnet.constraints import CONSTRAINTS

TOXIC = {"Pb", "Cd", "Hg", "Tl", "As"}

@CONSTRAINTS.register("no_toxic_elements", "Rejects compositions containing Pb, Cd, Hg, Tl or As.")
def no_toxic_elements(cand, extra=()):
    banned = TOXIC | set(extra)
    used = sorted(set(cand.elements.values()) & banned)
    return cand.result("no_toxic_elements", not used, None, None,
                       f"contains {', '.join(used)}" if used else "no toxic element")`,
    };
    const snipHost = h('div', null);
    const sseg = W.ui.seg([{ value: 'demo', label: 'Demo' }, { value: 'own', label: 'Your data' }, { value: 'score', label: 'Score any generator' }, { value: 'api', label: 'Python + HF weights' }, { value: 'rule', label: 'Custom rule' }], 'demo',
      (v) => { snipHost.innerHTML = ''; snipHost.append(W.ui.code(SNIP[v], v === 'rule' || v === 'api' ? 'python' : 'bash')); }, 'Snippets');
    snipHost.append(W.ui.code(SNIP.demo, 'bash'));

    const prose = h('div', { class: 'prose' },
      h('p', { html: '<code>pip install meidnet</code> (2.3.1). Families and rules are YAML data, every step writes a plain-language HTML report, and <code>meidnet score</code> grades the CIFs of <em>any</em> generator.' }),
      sseg.el, snipHost, cards,
      h('p', { class: 'hint', html: '<strong>Limits:</strong> prototype families only; the property modality is a vector of scalars (XRD, DOS planned); hosted Studio trains up to 30 epochs on ≤ 1,500 rows. Predictions outside Perov-5 chemistry (halides, selenides) are extrapolations: confirm with DFT.' }));
    const stage = W.ui.stage('MEIDNet Studio · seven blocks (click)', strip, det, h('div', { class: 'ctrl-row' }, bChain), chain,
      W.ui.fig(FIG + 'studio_tour_poster.jpg', 'Studio tour: “Tell MEIDNet the properties you want and it suggests crystals that should have them.”'));
    el.appendChild(h('div', { class: 'bench even' }, prose, stage));
    pick(cur); drawChain();
  }

  WELT.register({
    id: 'meidnet', order: 3, name: 'MEIDNet',
    logo: 'assets/logos/meidnet.png', logoDark: false,
    tagline: 'One latent space for a crystal and its properties, walked backwards: from the band gap you want to a crystal that should have it.',
    status: [
      { label: 'Published · npj Comput. Mater. 12, 287 (2026)', tone: 'good', href: 'https://doi.org/10.1038/s41524-026-02153-3' },
      { label: 'Lead: Anand Babu', tone: 'plain' },
      { label: 'MEIDNet Prism', tone: 'plain', href: 'https://babu09-meidnet.hf.space/' },
      { label: 'GitHub', tone: 'plain', href: 'https://github.com/ABnano/MEIDNet' },
    ],
    chapters: [
      { id: 'problem', title: 'Properties to crystals', kicker: 'The problem',
        lede: 'Generators usually learn from one kind of data. MEIDNet puts crystals and their properties in one space, then searches it.',
        render: chProblem },
      { id: 'align', title: 'Aligning two modalities', kicker: 'The core idea',
        lede: 'A CLIP-style contrastive loss pulls each crystal onto its own properties and pushes it away from everyone else’s.',
        render: chAlign },
      { id: 'network', title: 'The network', kicker: 'Architecture',
        lede: 'An equivariant graph encoder for the crystal, an MLP for the properties, one joint latent and two decoders.',
        render: chNet },
      { id: 'search', title: 'Latent search', kicker: 'Inverse design',
        lede: 'Start where the target properties land, optimise, decode, and keep only what passes the chemistry rules.',
        render: chSearch },
      { id: 'results', title: 'What came out', kicker: 'Results',
        lede: 'Four band-gap targets, 140 generated perovskites, 19 stable, unique and novel. And an open benchmark that does not flatter.',
        render: chResults },
      { id: 'repair', title: 'Generated, then repaired', kicker: 'Downstream · VibroML',
        lede: 'The SUN perovskites were thermodynamically plausible but had soft phonon modes. VibroML followed them to lower-energy polymorphs without soft modes.',
        render: chRepair },
      { id: 'prism', title: 'MEIDNet Prism', kicker: 'Use it · learn, benchmark, develop',
        lede: 'A pip package, a live Studio, a companion app and open benchmarks, all from one repository.',
        render: chPrism },
    ],
  });
})();
