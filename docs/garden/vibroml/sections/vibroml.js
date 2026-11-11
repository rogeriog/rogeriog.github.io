/* VibroML section: automated phonon analysis and dynamical-instability remediation with MLIPs.
 * Every number comes from the revised manuscript / SI (Nov 2026) or the 2025 WelT talk runs
 * (briefs/vibroml.md). Toy models are labelled as such on the page. */
(function () {
  'use strict';
  const FIG = 'assets/figs/vibroml/';

  /* ---------- small helpers ---------- */
  function tok(W, name, fallback) { return W.css(name) || fallback || '#888'; }
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
  function mixRGB(a, b, t) { return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)); }
  function rgba(c, a) { const v = rgbOf(c); return `rgba(${v[0]},${v[1]},${v[2]},${a})`; }
  function font(W, px, wgt) { return `${wgt || 600} ${px}px ${W.css('--f-body') || 'system-ui, sans-serif'}`; }
  function mono(W, px, wgt) { return `${wgt || 400} ${px}px ${W.css('--f-mono') || 'monospace'}`; }
  function arrow(ctx, x0, y0, x1, y1, head) {
    const a = Math.atan2(y1 - y0, x1 - x0), hl = head || 6;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - hl * Math.cos(a - 0.45), y1 - hl * Math.sin(a - 0.45));
    ctx.lineTo(x1 - hl * Math.cos(a + 0.45), y1 - hl * Math.sin(a + 0.45));
    ctx.closePath(); ctx.fill();
  }
  // Spread label y-positions so they are at least `gap` px apart, staying within [lo, hi].
  function spread(items, gap, lo, hi) {
    items.sort((a, b) => a.y - b.y);
    items.forEach((it) => (it.ly = it.y));
    for (let pass = 0; pass < 40; pass++) {
      let moved = false;
      for (let i = 1; i < items.length; i++) {
        const d = items[i].ly - items[i - 1].ly;
        if (d < gap) { const s = (gap - d) / 2; items[i].ly += s; items[i - 1].ly -= s; moved = true; }
      }
      items.forEach((it) => { it.ly = Math.max(lo, Math.min(hi, it.ly)); });
      if (!moved) break;
    }
    return items;
  }
  const NARROW = () => (window.innerWidth || 1200) < 700;
  const minus = (s) => String(s).replace(/-/g, '−');
  const fmtE = (v) => (v > 0 ? '+' : '') + minus(v.toFixed(1));

  /* =====================================================================
   * Chapter 1 — saddle point, imaginary mode, octahedral tilt (linked toy)
   * ===================================================================== */
  function chSaddle(el, W) {
    const h = W.h;
    // Toy Landau double well along the soft-mode coordinate Q (in units of the minimum Q*):
    //   E(Q) = ΔE (Q^4 − 2 Q^2)          minima at Q = ±1 with depth −ΔE, saddle at Q = 0
    //   ω^2 ∝ E''(Q) = 4ΔE (3Q^2 − 1)    so  ω(Q) = |ω_min| · sgn(3Q^2 − 1) · sqrt|3Q^2 − 1|
    // ΔE = 29.3 meV/atom (CsPbI3 Pm-3m → Pnma, MACE-OMAT-0, Table 1); |ω_min| = 0.73 THz (Pm-3m, Table S1).
    const dE = 29.3, wmin = 0.73, thMax = 12; // tilt angle at Q* is illustrative
    const E = (q) => dE * (q ** 4 - 2 * q * q);
    const dEdQ = (q) => dE * (4 * q ** 3 - 4 * q);
    const omega = (q) => { const c = 3 * q * q - 1; return Math.sign(c) * wmin * Math.sqrt(Math.abs(c)); };
    let Q = 0.45, stopAnim = null, note = '', modeSign = -1;

    const prose = h('div', { class: 'prose' },
      h('ul', null,
        h('li', { html: 'A low E<sub>hull</sub> is not enough. The crystal must also be <strong>dynamically stable</strong>: no imaginary phonon in the Brillouin zone.' }),
        h('li', { html: 'Generative models are not there yet: <strong>PhononBench</strong> reports an average dynamical stability rate of <strong>30.7%</strong>.' }),
        h('li', { html: 'Unstable structures are typically discarded. Tools such as phonopy find soft modes but do not automate the repair.' }),
        h('li', { html: 'An imaginary mode is a <strong>direction</strong>: displace along its eigenvector and the energy goes down.' })),
      W.ui.callout('<strong>Try it.</strong> Q = 0 is the cubic saddle. The forces vanish there, so a plain relaxation never leaves it. Push along the eigenvector, then press <em>Relax</em>.'),
      h('figure', { class: 'fig vml-pair' },
        h('div', { class: 'imgs' },
          h('img', { src: FIG + 'bahfse3_cubic.png', alt: 'Cubic perovskite BaHfSe3', loading: 'lazy' }),
          h('img', { src: FIG + 'bahfse3_vibroml.png', alt: 'BaHfSe3 after the VibroML workflow', loading: 'lazy' })),
        h('figcaption', { html: 'Real case: BaHfSe₃ from <a href="/garden/meidnet/">MEIDNet</a>, before and after VibroML. DFT E<sub>hull</sub> 98.7 → 0 meV.' })));

    const stage = W.ui.stage('Toy model · CsPbI₃-like soft mode');
    const duo = h('div', { class: 'vml-duo' });
    const cE = h('div', { class: 'vml-cv' }), cX = h('div', { class: 'vml-cv' });
    duo.append(cE, cX);
    stage.appendChild(duo);

    const cvE = W.canvas(cE, drawE, { aspect: 0.6, label: 'Energy along the soft-mode coordinate' });
    const cvX = W.canvas(cX, drawX, { aspect: 0.9, label: 'Octahedral tilt pattern in projection' });

    const sl = W.ui.slider({ label: 'Displacement Q / Q*', min: -1.5, max: 1.5, step: 0.01, value: Q,
      fmt: (v) => minus(v.toFixed(2)), onInput: (v) => { stop(); Q = v; note = ''; refresh(); } });
    const read = h('div', { class: 'vml-read' });
    const btnRelax = h('button', { class: 'btn', type: 'button', onclick: relax }, 'Relax');
    const btnSaddle = h('button', { class: 'btn ghost', type: 'button', onclick: () => { stop(); setQ(0); note = ''; refresh(); } }, 'Back to saddle');
    const btnMode = h('button', { class: 'btn ghost', type: 'button', onclick: toggleMode }, 'Show eigenvector');
    stage.append(sl.el, h('div', { class: 'ctrl-row' }, btnRelax, btnSaddle, btnMode), read,
      h('p', { class: 'hint', html: 'E(Q) = ΔE(Q⁴ − 2Q²). Depth ΔE = 29.3 meV/atom (Pnma, MACE-OMAT-0, Table 1); ω<sub>min</sub> = −0.73 THz at Pm-3m (Table S1). Shape and tilt angle are illustrative.' }));

    el.appendChild(h('div', { class: 'bench' }, prose, stage));

    function setQ(v) { Q = v; sl.input.value = String(v); sl.el.querySelector('output').textContent = minus(v.toFixed(2)); }
    function stop() { if (stopAnim) { stopAnim(); stopAnim = null; } btnMode.textContent = 'Show eigenvector'; }
    function relax() {
      stop();
      if (Math.abs(Q) < 1e-6) { note = 'Forces vanish at the saddle: relaxation alone stays there.'; refresh(); return; }
      note = '';
      if (W.reduceMotion) { setQ(Math.sign(Q)); refresh(); return; }
      stopAnim = W.raf(() => {
        for (let i = 0; i < 3; i++) Q -= 0.0012 * dEdQ(Q); // steepest descent, η·E''(Q*) ≈ 0.28 < 2 (stable)
        setQ(Q);
        refresh();
        if (Math.abs(dEdQ(Q)) < 0.05) { setQ(Math.sign(Q)); refresh(); stop(); }
      });
    }
    function toggleMode() {
      if (stopAnim) { stop(); return; }
      if (W.reduceMotion) { // no looping animation: one static step along the eigenvector per click
        modeSign = -modeSign; note = ''; setQ(Math.max(-1.5, Math.min(1.5, Q + 0.35 * modeSign))); refresh(); return;
      }
      const q0 = Q; let t = 0;
      btnMode.textContent = 'Stop';
      stopAnim = W.raf((dt) => {
        t += dt;
        setQ(Math.max(-1.5, Math.min(1.5, q0 + 0.35 * Math.sin(2 * Math.PI * 0.6 * t))));
        refresh();
      });
    }
    function refresh() {
      cvE.redraw(); cvX.redraw();
      const w = omega(Q), e = E(Q);
      const state = Math.abs(Q) < 0.02 ? 'saddle: unstable' : (Math.abs(Math.abs(Q) - 1) < 0.02 ? 'minimum: stable' : (3 * Q * Q < 1 ? 'downhill, still soft' : 'curvature positive'));
      read.innerHTML = '';
      read.append(
        h('div', null, h('span', { class: 'k' }, 'E(Q)'), h('span', { class: 'v tnum' }, minus(e.toFixed(1)) + ' meV/atom')),
        h('div', null, h('span', { class: 'k' }, 'local ω (toy)'), h('span', { class: 'v tnum', style: { color: w < 0 ? tok(W, '--bad') : tok(W, '--good') } },
          w < 0 ? `${Math.abs(w).toFixed(2)}i THz` : `${w.toFixed(2)} THz`)),
        h('div', null, h('span', { class: 'k' }, 'tilt'), h('span', { class: 'v tnum' }, minus((thMax * Q).toFixed(1)) + '°')),
        h('div', null, h('span', { class: 'k' }, 'state'), h('span', { class: 'v' }, note || state)));
    }

    function drawE(ctx, w, hh) {
      if (w < 40 || hh < 40) return;
      const fg = tok(W, '--fg'), mu = tok(W, '--muted'), line = tok(W, '--line'), p = tok(W, '--p'), bad = tok(W, '--bad'), good = tok(W, '--good');
      const L = 44, R = 10, T = 14, B = 30, x0 = -1.6, x1 = 1.6, y0 = -46, y1 = 30;
      const X = (q) => L + (q - x0) / (x1 - x0) * (w - L - R);
      const Y = (e) => T + (y1 - e) / (y1 - y0) * (hh - T - B);
      ctx.save();
      ctx.beginPath(); ctx.rect(L, T, w - L - R, hh - T - B); ctx.clip();
      // zero line
      ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L, Y(0)); ctx.lineTo(w - R, Y(0)); ctx.stroke();
      // harmonic approximation at the saddle: E ≈ ½E''(0)Q² = −2ΔE Q²
      ctx.setLineDash([5, 4]); ctx.strokeStyle = bad; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let i = 0; i <= 120; i++) { const q = -0.62 + 1.24 * i / 120; const yy = Y(-2 * dE * q * q); i ? ctx.lineTo(X(q), yy) : ctx.moveTo(X(q), yy); }
      ctx.stroke(); ctx.setLineDash([]);
      // energy curve
      ctx.strokeStyle = p; ctx.lineWidth = 3; ctx.beginPath();
      for (let i = 0; i <= 300; i++) { const q = x0 + (x1 - x0) * i / 300; const yy = Y(E(q)); i ? ctx.lineTo(X(q), yy) : ctx.moveTo(X(q), yy); }
      ctx.stroke();
      // local curvature parabola at the ball
      const c2 = dE * (6 * Q * Q - 2); // ½E''(Q)
      ctx.strokeStyle = c2 < 0 ? bad : good; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i <= 40; i++) { const d = -0.28 + 0.56 * i / 40; const yy = Y(E(Q) + dEdQ(Q) * d + c2 * d * d); i ? ctx.lineTo(X(Q + d), yy) : ctx.moveTo(X(Q + d), yy); }
      ctx.stroke();
      ctx.restore();
      // ball
      ctx.fillStyle = c2 < 0 ? bad : good; ctx.strokeStyle = tok(W, '--surface'); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(X(Q), Y(E(Q)) - 8, 8, 0, 7); ctx.fill(); ctx.stroke();
      // axes + labels
      ctx.fillStyle = mu; ctx.font = font(W, 12, 600); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      [-30, -15, 0, 15, 30].forEach((e) => ctx.fillText(minus(e), L - 6, Y(e)));
      ctx.save(); ctx.translate(12, T + (hh - T - B) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('E (meV/atom)', 0, 0); ctx.restore();
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      [-1, 0, 1].forEach((q) => ctx.fillText(minus(q), X(q), hh - B + 6));
      ctx.textAlign = 'right'; ctx.fillText('Q / Q*', w - R, hh - B + 6);
      ctx.fillStyle = fg; ctx.font = font(W, 12, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText('Pm-3m saddle', X(0), Y(0) - 22);
      ctx.textBaseline = 'top';
      ctx.fillText('tilted minimum', X(1), Y(-dE) + 6); ctx.fillText('tilted minimum', X(-1), Y(-dE) + 6);
      // legend for the harmonic approximation
      ctx.setLineDash([5, 4]); ctx.strokeStyle = bad; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(L + 30, T + 8); ctx.lineTo(L + 52, T + 8); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = bad; ctx.font = font(W, 11, 600); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('harmonic at saddle: ω² < 0', L + 58, T + 8);
    }

    function drawX(ctx, w, hh) {
      if (w < 40 || hh < 40) return;
      const p = tok(W, '--p'), p2 = tok(W, '--p2'), fg = tok(W, '--fg'), mu = tok(W, '--muted'), bad = tok(W, '--bad');
      const n = 4, th = (thMax * Q) * Math.PI / 180;
      const ah = hh - 20;                          // keep a strip for the legend
      const r = Math.min(w, ah) / (2 * n + 1.4);   // B–X distance (rigid octahedron)
      const d = 2 * r * Math.cos(th);              // rigid tilts shrink the B–B spacing: d = 2r cos θ
      const cx = w / 2, cy = ah / 2, off = (n - 1) / 2;
      const B = (i, j) => [cx + (i - off) * d, cy + (j - off) * d];
      // A cations in the voids
      ctx.fillStyle = rgba(p2, 0.85);
      for (let i = -1; i < n; i++) for (let j = -1; j < n; j++) { const [x, y] = B(i + 0.5, j + 0.5); ctx.beginPath(); ctx.arc(x, y, r * 0.32, 0, 7); ctx.fill(); }
      // octahedra, alternating rotation sense (M-point checkerboard tilt; the cell doubles)
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const s = (i + j) % 2 ? -1 : 1, a = s * th, [bx, by] = B(i, j);
        const V = [0, 1, 2, 3].map((k) => [bx + r * Math.cos(a + k * Math.PI / 2), by + r * Math.sin(a + k * Math.PI / 2)]);
        ctx.fillStyle = rgba(p, 0.22); ctx.strokeStyle = p; ctx.lineWidth = 1.5;
        ctx.beginPath(); V.forEach((v, k) => (k ? ctx.lineTo(v[0], v[1]) : ctx.moveTo(v[0], v[1]))); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(bx, by, r * 0.16, 0, 7); ctx.fill();
        V.forEach((v, k) => {
          ctx.fillStyle = mu; ctx.beginPath(); ctx.arc(v[0], v[1], r * 0.13, 0, 7); ctx.fill();
          // eigenvector: dX/dθ of the anion, perpendicular to the B–X bond (sense alternates)
          if ((i + j) % 2 === 0 && k < 4) {
            const tx = -Math.sin(a + k * Math.PI / 2) * s, ty = Math.cos(a + k * Math.PI / 2) * s, L = r * 0.55;
            ctx.strokeStyle = bad; ctx.fillStyle = bad; ctx.lineWidth = 2;
            arrow(ctx, v[0], v[1], v[0] + tx * L, v[1] + ty * L, 6);
          }
        });
      }
      // parent cell (dashed) and doubled √2×√2 cell (solid)
      const [ox, oy] = B(1, 1);
      ctx.setLineDash([4, 4]); ctx.strokeStyle = mu; ctx.lineWidth = 1.5; ctx.strokeRect(ox, oy, d, d); ctx.setLineDash([]);
      if (Math.abs(th) > 0.004) {
        ctx.strokeStyle = bad; ctx.lineWidth = 2; ctx.beginPath();
        ctx.moveTo(ox, oy); ctx.lineTo(ox + d, oy + d); ctx.lineTo(ox, oy + 2 * d); ctx.lineTo(ox - d, oy + d); ctx.closePath(); ctx.stroke();
      }
      ctx.fillStyle = mu; ctx.font = font(W, 11, 600); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(Math.abs(th) > 0.004 ? 'dashed: cubic cell · red: doubled cell' : 'dashed: cubic cell', w / 2, hh - 2);
    }
    refresh();
  }

  /* =====================================================================
   * Chapter 2 — the pipeline (clickable Fig. 1)
   * ===================================================================== */
  function chPipeline(el, W) {
    const h = W.h;
    // regions as fractions of the figure (x0, y0, x1, y1)
    const steps = [
      { n: '1', t: 'Input structure', box: [0.03, 0.05, 0.653, 0.153],
        d: 'Any crystal: a high-symmetry prototype, a screening hit, a generative-model output.',
        code: 'vibroml --cif CsPbI3.cif --auto --method traditional' },
      { n: '2', t: 'MLIP phonons', box: [0.03, 0.177, 0.653, 0.349],
        d: 'Finite-displacement phonons with a universal MLIP as force calculator (ASE). Engines: MACE, M3GNet, eSEN, UMA, NEP-based potentials, PET-MAD. Adaptive q-mesh (0.30 Å⁻¹, at least 6×6×6). <code>--auto</code> sweeps supercell 2→3→4, displacement 0.05→0.01 Å and force tolerance.',
        code: '# stability metrics live in vibroml.utils.stability_metrics\nvibroml --cif LiFsimplecubic.cif --auto --method traditional' },
      { n: '3', t: 'Unstable?', box: [0.155, 0.378, 0.528, 0.471],
        d: 'Imaginary modes with f<sub>soft</sub> &gt; 2%. The high-symmetry points of the band path are checked too: they catch instabilities that a uniform mesh can miss. Stable inputs bypass remediation.' },
      { n: '4', t: 'Remediation', box: [0.03, 0.5, 0.653, 0.672],
        d: 'Search for a lower-symmetry, dynamically stable polymorph: soft-mode following (TRAD, ALL), genetic algorithm (GA) or stochastic search (RAND).',
        code: 'vibroml --cif CsPbI3.cif --auto --method traditional\nvibroml --cif CsPbI3.cif --auto --method traditional_all\nvibroml --cif CsPbI3.cif --auto --method ga\n# also: --method opt_random' },
      { n: '5', t: 'MD at T > 0 K', box: [0.03, 0.7, 0.653, 0.844],
        d: 'NVT equilibration, NPT equilibration, then NPT production. Stable if ≥ 3 of 4 pass: RMSD &lt; 1.0 Å, volume fluctuation &lt; 6%, RDF correlation &gt; 0.5, symmetry retained.',
        code: '--method md_stability   # with --temp, --pressure, --time' },
      { n: '6', t: 'Stable polymorph', box: [0.03, 0.872, 0.653, 0.982],
        d: 'All phonon frequencies real and the structure retained at finite temperature. Transition paths between parent and product: variable-cell NEB.',
        code: '--method neb\n--method ci-neb' },
      { n: '↺', t: 'ProtoCSP loop', box: [0.725, 0.372, 0.984, 0.781],
        d: 'If MD shows a collapse from geometric frustration (e.g. 3D → 1D), <a href="/garden/protocsp/">ProtoCSP</a> (separate package) proposes ordered alloys by targeted site substitution. They re-enter phonon screening.' },
      { n: '✓', t: 'DFT check', box: [0.725, 0.873, 0.984, 0.979],
        d: 'Optional first-principles verification: DFT phonons and energetics beyond the MLIP surrogate.' },
    ];
    let cur = 1;
    const list = h('div', { class: 'vml-steps', role: 'tablist', 'aria-label': 'Pipeline steps' });
    const detail = h('div', { class: 'vml-step-detail' });
    const btns = steps.map((s, i) => {
      const b = h('button', { type: 'button', class: 'vml-step', role: 'tab', onclick: () => sel(i) }, h('span', { class: 'n' }, s.n), h('span', null, s.t));
      list.appendChild(b); return b;
    });
    const figWrap = h('div', { class: 'vml-pipe-fig' });
    const img = h('img', { src: FIG + 'workflow_fig1.jpg', alt: 'VibroML workflow (Fig. 1 of the manuscript)' });
    const hl = h('div', { class: 'vml-hl', 'aria-hidden': 'true' });
    figWrap.append(img, hl);
    steps.forEach((s, i) => {
      const [x0, y0, x1, y1] = s.box;
      figWrap.appendChild(h('button', { type: 'button', class: 'vml-hot', 'aria-label': 'Show step: ' + s.t, onclick: () => sel(i),
        style: { left: x0 * 100 + '%', top: y0 * 100 + '%', width: (x1 - x0) * 100 + '%', height: (y1 - y0) * 100 + '%' } }));
    });
    function sel(i) {
      cur = i;
      btns.forEach((b, k) => b.setAttribute('aria-selected', String(k === i)));
      const s = steps[i], [x0, y0, x1, y1] = s.box;
      Object.assign(hl.style, { left: x0 * 100 + '%', top: y0 * 100 + '%', width: (x1 - x0) * 100 + '%', height: (y1 - y0) * 100 + '%' });
      detail.innerHTML = '';
      detail.append(h('h3', null, s.t), h('p', { html: s.d }));
      if (s.code) detail.appendChild(W.ui.code(s.code, 'bash'));
    }
    const prose = h('div', { class: 'prose' }, list, detail,
      h('p', { class: 'hint', html: 'Click a step, or a box in the figure. Figure: Fig. 1 of the revised manuscript.' }));
    el.appendChild(h('div', { class: 'bench even' }, prose, h('div', { class: 'stage vml-pipe-stage' }, figWrap)));
    sel(cur);
  }

  /* =====================================================================
   * Chapter 3 — detection: toy phonon dispersion, f_soft, I_curv, ω_min
   * ===================================================================== */
  function chDetect(el, W) {
    const h = W.h;
    // Toy 1D chains (lattice constant a = 1, toy units):
    //  before (aristotype, 1 atom/cell, nearest K1 and next-nearest K2 springs):
    //     ω²(q) = (4/m) [K1 sin²(q/2) + K2 sin²(q)],  q ∈ [0, π]
    //     K1 < 0 with K2 > −K1/4 → stable near Γ, ω² < 0 at the zone boundary (cell-doubling instability).
    //  after (dimerised chain, 2 atoms/cell of length 2, springs Ka ≠ Kb > 0):
    //     ω²±(k) = (Ka+Kb)/m ± (1/m) sqrt(Ka² + Kb² + 2 Ka Kb cos 2k),  k ∈ [0, π/2]  (all ω² ≥ 0)
    //  plotted as sign(ω²)·sqrt|ω²| (VibroML convention: imaginary modes drawn below zero).
    //  Mesh: even Monkhorst–Pack points (2j−1)·q_ZB/N, j = 1…N/2 (Γ is never sampled).
    //  f_soft = n(ω²<0)/N_modes ;  I_curv = (1/N_modes) Σ_{ω²<0} |ω²| ;  ω_min = min signed ω.
    const K2 = 1.0, Ka = 1.6, Kb = 0.6;
    const st = { mode: 'before', K1: -1, m: 1, N: 24, art: false };
    const ART_A = 30, ART_S = 0.006, ART_X = 0.6; // narrow spurious dip (an "MLIP artifact") in ω²·m

    function bands(x) { // x = q/q_ZB ∈ [0,1] → array of ω² values
      if (st.mode === 'before') {
        const q = x * Math.PI;
        return [(4 / st.m) * (st.K1 * Math.sin(q / 2) ** 2 + K2 * Math.sin(q) ** 2)];
      }
      const k = x * Math.PI / 2, s = Math.sqrt(Ka * Ka + Kb * Kb + 2 * Ka * Kb * Math.cos(2 * k));
      return [(Ka + Kb - s) / st.m, (Ka + Kb + s) / st.m];
    }
    function artX() { // put the artifact on the mesh point closest to ART_X so the mesh sees it
      const xs = meshX(); let best = xs[0];
      xs.forEach((x) => { if (Math.abs(x - ART_X) < Math.abs(best - ART_X)) best = x; });
      return best;
    }
    function meshX() { const xs = []; for (let j = 1; j <= st.N / 2; j++) xs.push((2 * j - 1) / st.N); return xs; }
    function w2(x) {
      const b = bands(x);
      if (st.art) b[0] -= (ART_A / st.m) * Math.exp(-((x - ax) ** 2) / (2 * ART_S * ART_S));
      return b;
    }
    let ax = artX();
    const sw = (v) => Math.sign(v) * Math.sqrt(Math.abs(v));

    const seg = W.ui.seg([{ value: 'before', label: 'Aristotype (before)' }, { value: 'after', label: 'Remediated (after)' }], st.mode, (v) => { st.mode = v; upd(); }, 'Structure');
    const sK = W.ui.slider({ label: 'K₁ (nearest spring)', min: -1.5, max: 1, step: 0.05, value: st.K1, fmt: (v) => minus(v.toFixed(2)), onInput: (v) => { st.K1 = v; upd(); } });
    const sM = W.ui.slider({ label: 'mass m', min: 0.5, max: 4, step: 0.05, value: st.m, fmt: (v) => v.toFixed(2), onInput: (v) => { st.m = v; upd(); } });
    const sN = W.ui.slider({ label: 'q-mesh N', min: 6, max: 48, step: 2, value: st.N, fmt: (v) => String(v), onInput: (v) => { st.N = v; ax = artX(); upd(); } });
    const bArt = h('button', { class: 'btn ghost', type: 'button', 'aria-pressed': 'false', onclick: () => { st.art = !st.art; bArt.setAttribute('aria-pressed', String(st.art)); bArt.textContent = st.art ? 'Remove artifact' : 'Add MLIP artifact (narrow dip)'; upd(); } }, 'Add MLIP artifact (narrow dip)');
    const statsBox = h('div', { class: 'vml-metrics' });
    const msg = h('p', { class: 'hint' });

    const stage = W.ui.stage('Toy model · 1D chain dispersion', seg.el);
    const cvWrap = h('div');
    stage.appendChild(cvWrap);
    const cv = W.canvas(cvWrap, draw, { aspect: NARROW() ? 0.72 : 0.4, label: 'Toy phonon dispersion with mesh points' });
    stage.append(statsBox, sK.el, sM.el, sN.el, h('div', { class: 'ctrl-row' }, bArt), msg);

    const prose = h('div', { class: 'prose' },
      h('p', { html: 'The eigenvalues of <i>D</i> = <i>M</i><sup>−1/2</sup>Φ<i>M</i><sup>−1/2</sup> are ω². A negative ω² gives an imaginary ω, plotted below zero.' }),
      h('div', { class: 'vml-eq', html: '<i>f</i><sub>soft</sub> = <i>n</i><sub>ω&lt;0</sub> / <i>N</i> &nbsp;&nbsp;·&nbsp;&nbsp; <i>I</i><sub>curv</sub> = (1/<i>N</i>) ∑<sub>ω<sub>i</sub>&lt;0</sub> ω<sub>i</sub><sup>2</sup>' }),
      h('ul', null,
        h('li', { html: '<strong>No frequency threshold.</strong> The boundary is ω = 0. An even mesh skips Γ, so the acoustic zeros are never sampled.' }),
        h('li', { html: '<strong>Mass-independent count.</strong> <i>D</i> is a congruence of Φ (Sylvester’s law of inertia): masses move ω, not the number of negative ω².' }),
        h('li', { html: '<strong>Breadth beats depth.</strong> 24 reference structures, five MLIPs: ROC AUC f<sub>soft</sub> 0.95–1.00, I<sub>curv</sub> 0.80–0.96, ω<sub>min</sub> 0.73–0.79.' }),
        h('li', { html: 'Operational cutoff for screening: <strong>f<sub>soft</sub> &lt; 2%</strong>.' })));
    el.appendChild(h('div', { class: 'bench' }, prose, stage));

    function metrics() {
      let n = 0, tot = 0, ic = 0, wmn = Infinity;
      meshX().forEach((x) => w2(x).forEach((v) => { tot++; if (v < 0) { n++; ic += -v; } wmn = Math.min(wmn, sw(v)); }));
      return { n, tot, f: n / tot, I: ic / tot, wmin: wmn };
    }
    function upd() {
      sK.el.classList.toggle('vml-off', st.mode === 'after');
      sK.input.disabled = st.mode === 'after';
      const m = metrics();
      statsBox.innerHTML = '';
      const bad = m.n > 0;
      statsBox.append(
        h('div', null, h('span', { class: 'k', html: 'f<sub>soft</sub>' }), h('span', { class: 'v tnum' + (bad ? ' bad' : ' good') }, (100 * m.f).toFixed(1) + '%'), h('span', { class: 'k2' }, `${m.n} / ${m.tot} modes`)),
        h('div', null, h('span', { class: 'k', html: 'I<sub>curv</sub>' }), h('span', { class: 'v tnum' }, m.I.toFixed(3)), h('span', { class: 'k2' }, 'toy units²')),
        h('div', null, h('span', { class: 'k', html: 'ω<sub>min</sub>' }), h('span', { class: 'v tnum' + (m.wmin < 0 ? ' bad' : '') }, minus(m.wmin.toFixed(2))), h('span', { class: 'k2' }, 'toy units')));
      msg.innerHTML = st.mode === 'before'
        ? (st.K1 < 0 ? 'Zone-boundary instability: displacing along it doubles the cell. Change m: ω rescales by 1/√m, f<sub>soft</sub> does not move.' : 'K₁ ≥ 0: every mode is real, so the aristotype is stable.')
        : 'Dimerised chain (Ka = 1.6, Kb = 0.6): doubled cell, two branches, all ω² ≥ 0.';
      if (st.art) msg.innerHTML += ' The artifact drags ω<sub>min</sub> down while f<sub>soft</sub> changes by one mode.';
      cv.redraw();
    }
    function draw(ctx, w, hh) {
      if (w < 40 || hh < 40) return;
      const fg = tok(W, '--fg'), mu = tok(W, '--muted'), line = tok(W, '--line'), p = tok(W, '--p'), bad = tok(W, '--bad');
      const L = 40, R = 10, T = 12, B = 26, y0 = -3.5, y1 = 4.2;
      const X = (x) => L + x * (w - L - R);
      const Y = (v) => T + (y1 - v) / (y1 - y0) * (hh - T - B);
      ctx.fillStyle = rgba(bad, 0.08); ctx.fillRect(L, Y(0), w - L - R, Y(y0) - Y(0));
      ctx.fillStyle = bad; ctx.font = font(W, 11, 600); ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText('imaginary (plotted as −|ω|)', L + 6, Y(y0) - 4);
      ctx.strokeStyle = line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(L, Y(0)); ctx.lineTo(w - R, Y(0)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, hh - B); ctx.stroke();
      ctx.save(); ctx.beginPath(); ctx.rect(L, T, w - L - R, hh - T - B); ctx.clip();
      const nb = st.mode === 'before' ? 1 : 2, S = 700;
      for (let b = 0; b < nb; b++) {
        let prev = null;
        for (let i = 0; i <= S; i++) {
          const x = i / S, v = sw(w2(x)[b]);
          if (prev) {
            ctx.strokeStyle = (v < 0 || prev.v < 0) ? bad : p; ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.moveTo(X(prev.x), Y(prev.v)); ctx.lineTo(X(x), Y(v)); ctx.stroke();
          }
          prev = { x, v };
        }
      }
      // mesh points
      meshX().forEach((x) => w2(x).forEach((v) => {
        const yv = Math.max(y0 + 0.05, sw(v));
        ctx.beginPath(); ctx.arc(X(x), Y(yv), 4, 0, 7);
        ctx.fillStyle = v < 0 ? bad : tok(W, '--surface'); ctx.strokeStyle = v < 0 ? bad : fg; ctx.lineWidth = 1.5; ctx.fill(); ctx.stroke();
      }));
      ctx.restore();
      if (st.art) {
        const v = sw(w2(ax)[0]);
        if (v < y0) {
          ctx.fillStyle = bad; ctx.strokeStyle = bad; ctx.lineWidth = 2;
          arrow(ctx, X(ax) + 18, Y(y0 + 0.9), X(ax) + 18, Y(y0) - 2, 6);
          ctx.font = font(W, 11, 700); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillText('ω = ' + minus(v.toFixed(1)), X(ax) + 24, Y(y0 + 0.6));
        }
      }
      ctx.fillStyle = mu; ctx.font = font(W, 12, 600); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      [-3, -2, -1, 0, 1, 2, 3, 4].forEach((v) => ctx.fillText(minus(v), L - 6, Y(v)));
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('Γ', X(0), hh - B + 6); ctx.fillText('zone boundary', X(1) - 40, hh - B + 6);
      ctx.fillText('q (mesh points: dots)', X(0.5), hh - B + 6);
      ctx.save(); ctx.translate(11, T + (hh - T - B) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('ω (toy units)', 0, -4); ctx.restore();
    }
    upd();
  }

  /* =====================================================================
   * Chapter 4 — soft-mode following on a 2D toy PES (TRAD vs ALL trial grids)
   * ===================================================================== */
  function chFollow(el, W) {
    const h = W.h;
    // Toy 2D energy surface in two soft-mode coordinates (Q1 softest, Q2 second soft mode):
    //   E(Q1,Q2) = κ (Q1²+Q2²)² − Σ_i A_i exp(−|Q − c_i|² / 2s_i²)
    // Origin = parent saddle (both curvatures negative, Q1 softer). Wells: on the Q1 axis, on the Q2 axis,
    // and deeper "coupled" wells on the diagonals. Relaxation = steepest descent (finite-difference gradient).
    // Trial grids are the real benchmark settings: displacement scales {0.25, 1, 4} (TRAD) and, for ALL,
    // × mode-2 ratios {−0.25, 0, 0.25} × swapped primary mode (Table S settings). Cell strains are not shown.
    const K = 0.12;
    const wells = [[1.2, 0, 1.0, 0.4], [-1.2, 0, 1.0, 0.4], [0, 1.2, 0.75, 0.4], [0, -1.2, 0.75, 0.4],
      [0.9, 0.9, 1.25, 0.36], [-0.9, 0.9, 1.25, 0.36], [0.9, -0.9, 1.25, 0.36], [-0.9, -0.9, 1.25, 0.36]];
    const E = (x, y) => { let e = K * (x * x + y * y) ** 2; for (const [cx, cy, A, s] of wells) e -= A * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * s * s)); return e; };
    const grad = (x, y) => { const d = 1e-4; return [(E(x + d, y) - E(x - d, y)) / (2 * d), (E(x, y + d) - E(x, y - d)) / (2 * d)]; };
    const E0 = E(0, 0);
    function relax(x, y) {
      const path = [[x, y]];
      for (let i = 0; i < 3000; i++) {
        const g = grad(x, y); x -= 0.02 * g[0]; y -= 0.02 * g[1];
        if (i % 6 === 0) path.push([x, y]);
        if (Math.hypot(g[0], g[1]) < 1e-5) break;
      }
      path.push([x, y]);
      return path;
    }
    const A0 = 0.35, SC = [0.25, 1, 4], RAT = [-0.25, 0, 0.25];
    function trials(method) {
      const t = [];
      if (method === 'trad') SC.forEach((s) => t.push([s * A0, 0]));
      else [0, 1].forEach((prim) => SC.forEach((s) => RAT.forEach((r) => t.push(prim ? [s * A0 * r, s * A0] : [s * A0, s * A0 * r]))));
      return t;
    }
    function basinOf(x, y) {
      if (Math.abs(y) < 0.05) return 'q1';
      if (Math.abs(x) < 0.05) return 'q2';
      return 'mix';
    }
    const BASIN = { q1: { name: 'single-mode distortion (Q₁)', c: '--p' }, q2: { name: 'single-mode distortion (Q₂)', c: '--warn' }, mix: { name: 'coupled distortion (Q₁ + Q₂)', c: '--good' } };
    let method = 'trad', runs = [], prog = 1, stopAnim = null;

    // energy-surface image (recomputed only on theme change / resize)
    const D = 1.8, G = 320;
    let surf = null, surfKey = '';
    function surface() {
      const key = tok(W, '--p2') + tok(W, '--surface');
      if (surf && key === surfKey) return surf;
      surfKey = key;
      const c = document.createElement('canvas'); c.width = G; c.height = G;
      const cx = c.getContext('2d'), im = cx.createImageData(G, G);
      const mid = rgbOf(tok(W, '--p2')), hi = rgbOf(tok(W, '--surface')), lo = mixRGB(mid, rgbOf(tok(W, '--p')), 0.7), emin = -1.12, emax = 0.35, nb = 12;
      for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
        const x = -D + 2 * D * (i + 0.5) / G, y = D - 2 * D * (j + 0.5) / G;
        let t = (E(x, y) - emin) / (emax - emin); t = Math.max(0, Math.min(1, t));
        t = Math.floor(t * nb) / nb; // banded = contour look
        const col = t < 0.45 ? mixRGB(lo, mid, t / 0.45) : mixRGB(mid, hi, (t - 0.45) / 0.55);
        const k = 4 * (j * G + i); im.data[k] = col[0]; im.data[k + 1] = col[1]; im.data[k + 2] = col[2]; im.data[k + 3] = 255;
      }
      cx.putImageData(im, 0, 0);
      surf = c; return c;
    }

    const seg = W.ui.seg([{ value: 'trad', label: 'traditional (TRAD)' }, { value: 'all', label: 'traditional_all (ALL)' }], method, (v) => { method = v; run(true); }, 'Method');
    const replay = h('button', { class: 'btn ghost', type: 'button', onclick: () => run(true) }, 'Replay');
    const found = h('div', { class: 'vml-found' });
    const stage = W.ui.stage('Toy model · two soft modes', h('div', { class: 'ctrl-row' }, seg.el, replay));
    const cvWrap = h('div', { class: 'vml-pes' });
    stage.appendChild(cvWrap);
    const cv = W.canvas(cvWrap, draw, { aspect: NARROW() ? 0.95 : 0.62, label: 'Toy energy surface with relaxation paths' });
    stage.append(found, h('p', { class: 'hint', html: 'Toy surface, illustrative energies. Trial grids follow the benchmark settings: displacement scales {0.25, 1, 4}; ALL adds mode-2 ratios {−0.25, 0, 0.25} and swaps the primary mode.' }));

    const prose = h('div', { class: 'prose' },
      h('p', { html: 'Inspired by the automatic phase-transition-pathway search of Togo and Tanaka (2013): distort along the soft mode, relax, recompute phonons, repeat.' }),
      h('ul', null,
        h('li', { html: '<strong>traditional</strong>: the softest mode (or a chosen one: <code>--yaml-input</code>, <code>--band_idx</code>, <code>--q</code>) in the smallest commensurate supercell, over a grid of amplitudes × cell strains.' }),
        h('li', { html: '<strong>traditional_all</strong>: pairs the softest mode with every other soft mode, scans their ratio, swaps the primary.' }),
        h('li', { html: 'Iterates up to <code>soft_mode_max_iterations</code> (5 in the benchmark, 4 for Bi₂Sn₂O₇) or until no soft mode is left at the special points.' })),
      W.ui.code('vibroml --cif CsPbI3.cif --auto --method traditional\nvibroml --cif CsPbI3.cif --auto --method traditional_all', 'bash'),
      W.ui.callout('A single mode keeps the symmetry of that mode. Coupled modes reach the <strong>deeper, lower-symmetry</strong> basin.'));
    el.appendChild(h('div', { class: 'bench' }, prose, stage));

    function run(animate) {
      if (stopAnim) { stopAnim(); stopAnim = null; }
      runs = trials(method).map(([x, y]) => { const p = relax(x, y); const e = p[p.length - 1]; return { start: [x, y], path: p, end: e, basin: basinOf(e[0], e[1]), E: E(e[0], e[1]) }; });
      // unique structures by energy (as in the paper's 0.2 meV/atom criterion)
      const uniq = [];
      runs.forEach((r) => { if (!uniq.some((u) => Math.abs(u.E - r.E) < 1e-3)) uniq.push(r); });
      uniq.sort((a, b) => a.E - b.E);
      found.innerHTML = '';
      found.append(h('div', { class: 'vml-found-h' }, `${runs.length} trial structures → ${uniq.length} distinct minim${uniq.length > 1 ? 'a' : 'um'}`),
        ...uniq.map((u) => h('div', { class: 'vml-found-row' },
          h('span', { class: 'sw', style: { background: tok(W, BASIN[u.basin].c) } }),
          h('span', null, BASIN[u.basin].name), h('span', { class: 'tnum' }, 'ΔE = ' + minus((u.E - E0).toFixed(2)) + ' (toy)'))));
      if (!animate || W.reduceMotion) { prog = 1; cv.redraw(); return; }
      prog = 0;
      stopAnim = W.raf((dt) => { prog = Math.min(1, prog + dt / 1.6); cv.redraw(); if (prog >= 1) { stopAnim(); stopAnim = null; } });
    }
    function halo(ctx, t, x, y) { ctx.save(); ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.strokeStyle = tok(W, '--surface'); ctx.strokeText(t, x, y); ctx.restore(); ctx.fillText(t, x, y); }
    function draw(ctx, w, hh) {
      if (w < 40 || hh < 40) return;
      const fg = tok(W, '--fg'), mu = tok(W, '--muted'), bad = tok(W, '--bad');
      const S = Math.min(w - 20, hh - 24), ox = (w - S) / 2, oy = 4;
      const X = (x) => ox + (x + D) / (2 * D) * S, Y = (y) => oy + (D - y) / (2 * D) * S;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(surface(), ox, oy, S, S);
      ctx.strokeStyle = rgba(fg, 0.35); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ox, Y(0)); ctx.lineTo(ox + S, Y(0)); ctx.moveTo(X(0), oy); ctx.lineTo(X(0), oy + S); ctx.stroke();
      ctx.fillStyle = fg; ctx.font = font(W, 12, 700); ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      halo(ctx, 'Q₁ (softest mode)', ox + S - 4, Y(-0.55));
      ctx.save(); ctx.translate(X(0) + 14, oy + 6); ctx.rotate(Math.PI / 2); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; halo(ctx, 'Q₂ (second soft mode)', 0, 0); ctx.restore();
      // parent saddle
      ctx.fillStyle = bad; ctx.beginPath(); ctx.arc(X(0), Y(0), 6, 0, 7); ctx.fill();
      ctx.font = font(W, 11, 700); ctx.textAlign = 'right'; ctx.textBaseline = 'top'; halo(ctx, 'parent (saddle)', X(0) - 8, Y(0) + 8);
      // paths
      runs.forEach((r) => {
        const col = tok(W, BASIN[r.basin].c), n = Math.max(2, Math.round(r.path.length * prog));
        ctx.beginPath();
        for (let i = 0; i < n; i++) { const [x, y] = r.path[i]; i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)); }
        ctx.strokeStyle = tok(W, '--surface'); ctx.lineWidth = 5; ctx.stroke();
        ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.strokeStyle = fg; ctx.fillStyle = tok(W, '--surface'); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(X(r.start[0]), Y(r.start[1]), 4, 0, 7); ctx.fill(); ctx.stroke();
        if (prog >= 1) { ctx.fillStyle = col; ctx.strokeStyle = fg; ctx.beginPath(); ctx.arc(X(r.end[0]), Y(r.end[1]), 7, 0, 7); ctx.fill(); ctx.stroke(); }
      });
      ctx.fillStyle = mu; ctx.font = font(W, 11, 600); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('○ trial structure   ● relaxed minimum   ·   stronger colour = lower energy', ox, oy + S + 6);
    }
    run(false);
  }

  /* =====================================================================
   * Chapter 5 — method race on the real benchmark (Table 1) + terminal replay
   * ===================================================================== */
  // [label, ΔE MACE-OMAT-0, ΔE DFT relaxed (meV/atom), methods found, flag]
  const T1 = {
    LiF: { atoms: 2, parent: 'Pm-3m', parentDFT: 0, rows: [
      ['Pnma', -276.8, -275.4, 'G'], ['F-43m', -292.5, -289.9, 'G'], ['P4₂/mnm', -296.4, -294.5, 'G'],
      ['Fm-3m', -297.2, -296.1, 'GTAR', 'exp. GS'], ['P6₃mc', -303.1, -300.6, 'GAR']],
      artifacts: 'RAND also finds P1, Pm, Cm at −4088, −7348, −14043 meV/atom: steric-clash structures that PBE itself reproduces (DFT single points −3121, −7692, −15171). MD shows they explode.' },
    'CsPbI₃': { atoms: 5, parent: 'Pm-3m', parentDFT: -5.4, rows: [
      ['C2/m', -18.1, -21.5, 'T'], ['Cm', -23.0, -23.5, 'TA'], ['Pnma', -29.3, -27.9, 'GA'], ['P-1', -29.9, -28.5, 'R'],
      ['P2₁/m', -33.3, -46.7, 'G'], ['Cmcm', -34.9, -26.8, 'G'], ['δ-Pnma', -44.2, -38.0, 'G', 'exp. GS']] },
    'HfO₂': { atoms: 12, parent: 'Fm-3m', parentDFT: -5.4, rows: [
      ['P4₂/nmc', -12.2, -39.7, 'TAR'], ['P2₁/m', -18.5, -68.8, 'GR'], ['Pnma', -21.7, -66.4, 'GR'], ['Pbcn', -38.5, -79.7, 'GT'],
      ['P2₁/c', -48.5, -95.1, 'GR', 'exp. GS']] },
    'Bi₂Sn₂O₇': { atoms: 88, parent: 'Fd-3m', parentDFT: -10.2, rows: [
      ['P2₁2₁2₁ a', 20.7, 5.4, 'G'], ['P2₁ a', 12.7, 0.5, 'GR'], ['Cc a', -12.6, -24.1, 'TA'], ['Pna2₁', -12.7, -24.0, 'GA'],
      ['P2₁ b', -13.1, -24.4, 'GA'], ['P2₁2₁2₁ b', -13.7, -24.8, 'GAR'], ['Cc', -14.1, -25.8, 'GTA', 'exp. GS']] },
  };
  const UNIQ = { LiF: [38, 2, 10, 465], 'CsPbI₃': [134, 3, 10, 505], 'HfO₂': [39, 2, 2, 929], 'Bi₂Sn₂O₇': [186, 3, 5, 5] };
  const HOURS = { LiF: [1.03, 0.03, 0.08, 0.06], 'CsPbI₃': [0.25, 0.65, 1.17, 2.46], 'HfO₂': [1.39, 0.18, 0.43, 3.97], 'Bi₂Sn₂O₇': [19.73, 63.31, 4.16, 1.93] };
  const METH = [{ k: 'G', v: 'ga', label: 'GA', i: 0 }, { k: 'T', v: 'traditional', label: 'TRAD', i: 1 }, { k: 'A', v: 'traditional_all', label: 'ALL', i: 2 }, { k: 'R', v: 'opt_random', label: 'RAND', i: 3 }];

  function terminalLines(cmp, m) {
    const cif = cmp === 'LiF' ? 'LiFsimplecubic.cif' : (cmp === 'CsPbI₃' ? 'CsPbI3.cif' : null);
    const L = [];
    if (cif && m.k !== 'R') L.push('$ vibroml --cif ' + cif + ' --auto --method ' + m.v);
    else { L.push('# --method ' + m.v + ' · Table 1 benchmark run (no terminal log in the sources)'); }
    if (cmp === 'LiF' && m.k === 'A') {
      L.push('# 2025 talk run (MACE), unique relaxed structures:',
        'Num Atoms  Int. Symbol  Crystal System  Energy (eV/atom)  Status',
        '8          Fm-3m        cubic           -4.820459         SUCCESS',
        '8          P6_3/mmc     hexagonal       -4.778778         SUCCESS',
        '4          Cmc2_1       orthorhombic    -4.777282         SUCCESS',
        '8          F-43m        cubic           -4.815802         SUCCESS',
        '4          P6_3/mmc     hexagonal       -4.821212         SUCCESS',
        '4          Cmmm         orthorhombic    -4.699697         SUCCESS',
        '4          P2_1/m       monoclinic      -4.693287         SUCCESS',
        '# (repeated rows removed; parent Pm-3m: -4.5232 eV/atom)');
    } else if (cmp === 'LiF' && m.k === 'G') {
      L.push('# 2025 talk run (MACE); parent Pm-3m: -4.5232 eV/atom',
        'final_LiFsimplecubic_top_1_energy_m4p8212   P6_3/mmc  -4.8212 eV/atom',
        'Fm-3m (rocksalt)                            -4.8205 eV/atom');
    } else if (cmp === 'LiF' && m.k === 'T') {
      L.push('# 2025 talk run: reported Fm-3m (rocksalt)');
    } else if (cmp === 'CsPbI₃' && m.k === 'T') {
      L.push('# 2025 talk run; parent Pm-3m: -2.7961 eV/atom', 'P1 (as labelled in the talk)   -2.8191 eV/atom   (-23 meV/atom)');
    } else if (cmp === 'CsPbI₃' && m.k === 'A') {
      L.push('# 2025 talk run; parent Pm-3m: -2.7961 eV/atom', 'Pnma   -2.8254 eV/atom   (-29.3 meV/atom)');
    } else if (cmp === 'CsPbI₃' && m.k === 'G') {
      L.push('# 2025 talk run; parent Pm-3m: -2.7961 eV/atom',
        'Pnma        -2.8254 eV/atom   (-29.3 meV/atom)',
        'Pnma        -2.8243 eV/atom',
        'P2_1/m      -2.8293 eV/atom',
        'final_CsPbI3_top_1_energy_m2p8403   delta-Pnma  -2.8402 eV/atom   (-44.1 meV/atom)');
    }
    const f = T1[cmp].rows.filter((r) => r[3].includes(m.k)).map((r) => r[0].replace(/ [ab]$/, '') + ' ' + minus(r[1].toFixed(1)));
    L.push('# Table 1 (MACE-OMAT-0, meV/atom vs parent):');
    if (!f.length) L.push('#   none');
    for (let i = 0; i < f.length; i += 3) L.push('#   ' + f.slice(i, i + 3).join(', '));
    return L;
  }

  function chRace(el, W) {
    const h = W.h;
    let cmp = 'LiF', meth = METH[0], stopType = null;
    const segC = W.ui.seg(Object.keys(T1).map((k) => ({ value: k, label: k })), cmp, (v) => { cmp = v; upd(true); }, 'Compound');
    const segM = W.ui.seg(METH.map((m) => ({ value: m.k, label: m.label })), meth.k, (v) => { meth = METH.find((m) => m.k === v); upd(true); }, 'Method');
    const side = h('div', { class: 'vml-side' });
    const note = h('p', { class: 'hint' });
    const term = h('pre', { class: 'vml-term', 'aria-live': 'polite' });
    const stage = W.ui.stage('Benchmark · Table 1 (MACE-OMAT-0 vs DFT)', h('div', { class: 'ctrl-row' }, segC.el, segM.el));
    const cvWrap = h('div');
    stage.appendChild(cvWrap);
    const cv = W.canvas(cvWrap, draw, { aspect: NARROW() ? 0.95 : 0.44, label: 'Energy ladder of polymorphs found by each method' });
    stage.append(side, note, term);

    const prose = h('div', { class: 'prose' },
      h('ul', null,
        h('li', { html: '<strong>GA</strong> (<code>--method ga</code>): a population of random soft-mode combinations + cell strains. Fitness = low energy. Crossover merges coordinates and lattice vectors; mutation adds displacements, strains, or another soft mode. The best structure’s phonons seed the next round.' }),
        h('li', { html: 'Benchmark settings: population 100, 3 generations, 50 new points per iteration, 5 soft-mode iterations (4 for Bi₂Sn₂O₇).' }),
        h('li', { html: '<strong>RAND</strong> (<code>--method opt_random</code>): random displacements, no soft-mode guidance.' }),
        h('li', { html: 'The GA recovers <strong>all four experimental ground states</strong>. For Bi₂Sn₂O₇ Cc it needs a 352-atom cell; ALL needs 704, TRAD 1408.' })),
      h('p', { class: 'hint', html: 'Left column: MLIP ΔE. Right column: fully relaxed DFT ΔE (meV/atom vs parent). Highlighted = found by the selected method.' }));
    el.appendChild(h('div', { class: 'bench' }, prose, stage));

    function upd(animate) {
      const d = T1[cmp], n = d.rows.filter((r) => r[3].includes(meth.k)).length;
      side.innerHTML = '';
      const u = UNIQ[cmp][meth.i], t = HOURS[cmp][meth.i];
      const items = [{ v: String(n) + ' / ' + d.rows.length, k: 'Table 1 polymorphs found' }, { v: String(u), k: 'unique structures (> 0.2 meV/atom)' }, { v: t + ' h', k: 'wall time, one A100' }];
      if (cmp === 'Bi₂Sn₂O₇') items.push({ v: ({ G: '352', T: '1408', A: '704', R: '—' })[meth.k], k: 'atoms in the cell that gives Cc' });
      side.appendChild(W.ui.stats(items));
      note.innerHTML = d.artifacts && meth.k === 'R' ? d.artifacts : (cmp === 'LiF' ? 'LiF ordering is reproduced exactly: Pm-3m &gt; Pnma &gt; F-43m &gt; P4₂/mnm &gt; Fm-3m &gt; P6₃mc.' : (cmp === 'HfO₂' ? 'The GA found Pnma HfO₂ in Aug–Sep 2025, before an independent hybrid-DFT report (Zhao, Zhou &amp; Rappe, 2026).' : (cmp === 'CsPbI₃' ? 'δ-Pnma (edge-sharing) is reconstructive: no single tilt mode reaches it. After DFT relaxation, P2₁/m (also edge-sharing) ends 8.7 meV/atom below it.' : 'Reproduces the Rahim et al. landscape, including α<sub>new</sub> Cc.')));
      cv.redraw();
      typeOut(terminalLines(cmp, meth), animate && !W.reduceMotion);
    }
    function typeOut(lines, animate) {
      if (stopType) { clearInterval(stopType); stopType = null; }
      const render = (k) => {
        term.innerHTML = '';
        lines.slice(0, k).forEach((ln) => term.appendChild(h('span', { class: ln.startsWith('#') ? 'c' : (ln.startsWith('$') ? 'cmd' : '') }, ln + '\n')));
      };
      if (!animate) { render(lines.length); return; }
      let k = 1; render(k);
      stopType = W.interval(() => { k++; render(k); if (k >= lines.length) { clearInterval(stopType); stopType = null; } }, 90);
    }
    function draw(ctx, w, hh) {
      if (w < 40 || hh < 40) return;
      const d = T1[cmp], fg = tok(W, '--fg'), mu = tok(W, '--muted'), line = tok(W, '--line'), p = tok(W, '--p'), p2 = tok(W, '--p2');
      const narrow = w < 520;
      const T = 30, B = 14, colA = narrow ? w * 0.36 : w * 0.38, colB = narrow ? w * 0.64 : w * 0.62;
      const vals = []; d.rows.forEach((r) => vals.push(r[1], r[2]));
      let lo = Math.min(...vals), hi = Math.max(...vals);
      const brk = (hi - lo) < 0.3 * (0 - lo); // LiF: polymorphs far below the parent → broken axis
      if (!brk) hi = Math.max(hi, 0, d.parentDFT);
      const pad = (hi - lo) * 0.06 + 1;
      lo -= pad; hi += pad;
      const top = brk ? T + 34 : T;
      const Y = (v) => top + (hi - v) / (hi - lo) * (hh - top - B);
      ctx.font = font(W, 11, 700); ctx.fillStyle = mu; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('MLIP (MACE-OMAT-0)', colA, 4); ctx.fillText('DFT relaxed', colB, 4);
      ctx.strokeStyle = line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(colA, T - 6); ctx.lineTo(colA, hh - B); ctx.moveTo(colB, T - 6); ctx.lineTo(colB, hh - B); ctx.stroke();
      // parent
      const py = brk ? T + 6 : Y(0), pyB = brk ? T + 6 : Y(d.parentDFT);
      ctx.setLineDash([3, 3]); ctx.strokeStyle = mu; ctx.beginPath(); ctx.moveTo(colA, py); ctx.lineTo(colB, pyB); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = mu; ctx.beginPath(); ctx.arc(colA, py, 4, 0, 7); ctx.arc(colB, pyB, 4, 0, 7); ctx.fill();
      ctx.font = font(W, 11, 600); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(d.parent + ' parent 0', colA - 8, py);
      ctx.textAlign = 'left'; ctx.fillText(minus(d.parentDFT.toFixed(1)), colB + 8, pyB);
      if (brk) { // axis break marks
        ctx.strokeStyle = mu; ctx.lineWidth = 1.5;
        [colA, colB].forEach((x) => { ctx.beginPath(); ctx.moveTo(x - 6, T + 20); ctx.lineTo(x + 6, T + 16); ctx.moveTo(x - 6, T + 26); ctx.lineTo(x + 6, T + 22); ctx.stroke(); });
      }
      // rows: faint first, lit on top
      const rows = d.rows.map((r) => ({ r, on: r[3].includes(meth.k) }));
      rows.sort((a, b) => a.on - b.on);
      rows.forEach(({ r, on }) => {
        ctx.strokeStyle = on ? p : rgba(mu, 0.35); ctx.lineWidth = on ? 2.5 : 1;
        ctx.beginPath(); ctx.moveTo(colA, Y(r[1])); ctx.lineTo(colB, Y(r[2])); ctx.stroke();
        ctx.fillStyle = on ? p : rgba(mu, 0.45);
        ctx.beginPath(); ctx.arc(colA, Y(r[1]), on ? 5 : 3, 0, 7); ctx.fill();
        ctx.fillStyle = on ? p2 : rgba(mu, 0.45);
        ctx.beginPath(); ctx.arc(colB, Y(r[2]), on ? 5 : 3, 0, 7); ctx.fill();
      });
      const fs = narrow ? 11 : 13;
      const labA = spread(d.rows.map((r) => ({ y: Y(r[1]), r, on: r[3].includes(meth.k) })), fs + 3, top, hh - B);
      const labB = spread(d.rows.map((r) => ({ y: Y(r[2]), r, on: r[3].includes(meth.k) })), fs + 3, top, hh - B);
      labA.forEach((it) => {
        ctx.font = font(W, fs, it.on ? 700 : 500); ctx.fillStyle = it.on ? fg : rgba(mu, 0.75); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        const name = it.r[0].replace(/ [ab]$/, '') + (it.r[4] && !narrow ? ' (' + it.r[4] + ')' : '');
        ctx.fillText(name + '  ' + fmtE(it.r[1]), colA - 12, it.ly);
        if (Math.abs(it.ly - it.y) > 1) { ctx.strokeStyle = rgba(mu, 0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(colA - 10, it.ly); ctx.lineTo(colA - 5, it.y); ctx.stroke(); }
      });
      labB.forEach((it) => {
        ctx.font = font(W, fs, it.on ? 700 : 500); ctx.fillStyle = it.on ? fg : rgba(mu, 0.75); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(fmtE(it.r[2]), colB + 12, it.ly);
        if (Math.abs(it.ly - it.y) > 1) { ctx.strokeStyle = rgba(mu, 0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(colB + 10, it.ly); ctx.lineTo(colB + 5, it.y); ctx.stroke(); }
      });
      ctx.font = font(W, 10, 600); ctx.fillStyle = mu; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.fillText('ΔE, meV/atom', w - 2, hh - 1);
    }
    upd(false);
  }

  /* =====================================================================
   * Chapter 6 — validation: real before/after dispersions + MD verdicts
   * ===================================================================== */
  const DISP = {
    LiF: { file: 'lif', before: 'Pm-3m (CsCl-type): f<sub>soft</sub> 24.8%, I<sub>curv</sub> 4.74 THz², ω<sub>min</sub> −6.32 THz.',
      after: 'P6₃mc, the lowest-energy polymorph: ΔE −303.1 meV/atom (MLIP), −300.6 (DFT relaxed); f<sub>soft</sub> 1.0%, I<sub>curv</sub> 0.02 THz². PBE puts it 4.5 meV/atom below rocksalt, the experimental ground state.' },
    'CsPbI₃': { file: 'cspbi3', before: 'Pm-3m: f<sub>soft</sub> 20.2%, I<sub>curv</sub> 0.04 THz², ω<sub>min</sub> −0.73 THz.',
      after: 'δ-Pnma (edge-sharing, experimental ground state; lowest in the MLIP): ΔE −44.2 meV/atom (MLIP), −38.0 (DFT relaxed); f<sub>soft</sub> 1.6%. In DFT, edge-sharing P2₁/m relaxes 8.7 meV/atom lower.' },
    'HfO₂': { file: 'hfo2', before: 'Fm-3m: f<sub>soft</sub> 4.5%, I<sub>curv</sub> 0.23 THz², ω<sub>min</sub> −4.88 THz.',
      after: 'P2₁/c (experimental ground state): ΔE −48.5 meV/atom (MLIP), −95.1 (DFT relaxed); f<sub>soft</sub> 2.6%, I<sub>curv</sub> 0.11 THz².' },
    'Bi₂Sn₂O₇': { file: 'bi2sn2o7', before: 'Fd-3m (88 atoms): f<sub>soft</sub> 7.7%, I<sub>curv</sub> 0.30 THz², ω<sub>min</sub> −4.40 THz.',
      after: 'Cc (experimental ground state): ΔE −14.1 meV/atom (MLIP), −25.8 (DFT relaxed); f<sub>soft</sub> 4.1%, I<sub>curv</sub> 0.12 THz².' },
  };
  // Table 2 (MACE-OMAT-0, 300 K NPT): phase, published verdict, confidence, RMSD Å, Vol %, RDF, retained
  const MD = {
    LiF: [['Pm-3m', 'Unstable', 'HIGH', '1.579', '28.3', '−0.011', 'No (F-43m)'], ['Fm-3m', 'Stable', 'MOD.', '0.174', '2.9', '0.281', 'Yes'],
      ['P6₃mc', 'Unstable', 'HIGH', '0.333', '17.7', '0.034', 'No (P6₃/mmc)'], ['P1 / Pm / Cm', 'Unstable', 'HIGH', 'explodes', '', '', 'N/A']],
    'CsPbI₃': [['Pm-3m', 'Unstable', 'LOW', '0.793', '4.9', '0.332', 'No (P1)'], ['Pnma', 'Unstable', 'LOW', '1.176', '12.4', '0.335', 'Yes'],
      ['Pm', 'Stable', 'MOD.', '0.834', '3.8', '0.692', 'Yes'], ['P2₁/m', 'Unstable', 'LOW', '5.136', '12.9', '0.539', 'Yes']],
    'HfO₂': [['Fm-3m', 'Unstable', 'MOD.', '0.453', '3.1', '0.189', 'No (Pca2₁)'], ['Pnma', 'Stable', 'MOD.', '0.101', '9.9', '0.772', 'Yes'],
      ['P2₁/c', 'Stable', 'MOD.', '1.216', '4.0', '0.511', 'Yes']],
    'Bi₂Sn₂O₇': [['Fd-3m', 'Stable', 'MOD.', '0.423', '4.5', '0.463', 'Yes'], ['Cc', 'Stable', 'HIGH', '0.242', '0.7', '0.874', 'No (Fd-3m)'],
      ['P2₁', 'Unstable', 'LOW', '6.865', '9.8', '0.705', 'No (P1)']],
  };
  const MDNOTE = {
    LiF: 'MD removes the steric-clash artifacts and keeps rocksalt Fm-3m.',
    'CsPbI₃': 'Anharmonic halide perovskite: the engines disagree, a known difficulty.',
    'HfO₂': 'Cubic HfO₂ distorts on its own into ferroelectric Pca2₁; P2₁/c is kept (its RMSD is a constant reference offset, frame-to-frame ≈ 0.05 Å).',
    'Bi₂Sn₂O₇': 'The low-symmetry basins are shallow: at 300 K they return to Fd-3m.',
  };
  function chVerify(el, W) {
    const h = W.h;
    let cmp = 'LiF', state = 'before';
    const segC = W.ui.seg(Object.keys(DISP).map((k) => ({ value: k, label: k })), cmp, (v) => { cmp = v; upd(); }, 'Compound');
    const segS = W.ui.seg([{ value: 'before', label: 'Before (aristotype)' }, { value: 'after', label: 'After VibroML' }], state, (v) => { state = v; upd(); }, 'State');
    const img = h('img', { alt: '' });
    const cap = h('figcaption');
    const fig = h('figure', { class: 'fig vml-dispfig' }, img, cap);
    const mdBox = h('div');
    const stage = W.ui.stage('Real phonon dispersions · MACE-OMAT-0', h('div', { class: 'ctrl-row' }, segC.el, segS.el), fig, mdBox);
    const prose = h('div', { class: 'prose' },
      h('ul', null,
        h('li', { html: '<strong>DFT energies.</strong> For most polymorphs, MLIP geometries sit within about 1 meV/atom of the relaxed DFT minimum. Exceptions: CsPbI₃ P2₁/m (−26.2 → −46.7) and the high-symmetry parents (5.4–10.2 meV/atom drop).' }),
        h('li', { html: '<strong>MD at 300 K.</strong> Stable if ≥ 3 of 4 pass: RMSD &lt; 1.0 Å, volume &lt; 6%, RDF &gt; 0.5, symmetry kept.' }),
        h('li', { html: '<strong>NEB.</strong> Variable-cell (CI-)NEB against DFT: no single engine dominates; MLIP barriers are screening-level.' }),
        h('li', { html: '<strong>Uncertainty.</strong> PET-MAD 128-member ensemble: σ &lt; 0.2 THz near stable phases, 1.44 THz for Pm-3m LiF.' })),
      W.ui.callout('Experimental ground states of CsPbI₃, HfO₂ and Bi₂Sn₂O₇ keep f<sub>soft</sub> at 1.6–4.1%: the numerical floor of MLIP finite-displacement phonons. Only f<sub>soft</sub> = 0 is a cell-size-independent statement of harmonic stability.'));
    el.appendChild(h('div', { class: 'bench' }, prose, stage));
    function upd() {
      const d = DISP[cmp];
      img.src = FIG + `disp_${d.file}_${state}.jpg`;
      img.alt = `Phonon band structure of ${cmp}, ${state === 'before' ? 'unstable aristotype' : 'remediated polymorph'}`;
      cap.innerHTML = d[state] + ' Source: SI dispersion figure; metrics from Tables 1 and S1.';
      mdBox.innerHTML = '';
      mdBox.append(h('div', { class: 'stage-title' }, 'MD 300 K · published verdicts (Table 2, subset)'),
        W.ui.table(['Phase', 'Verdict', 'Conf.', 'RMSD Å', 'Vol %', 'RDF', 'Phase kept'],
          MD[cmp].map((r) => [r[0], `<span class="vml-v ${r[1] === 'Stable' ? 'good' : 'bad'}">${r[1]}</span>`, r[2], r[3], r[4], r[5], r[6]]), [3, 4, 5]),
        h('p', { class: 'hint' }, MDNOTE[cmp]));
    }
    upd();
  }

  /* =====================================================================
   * Chapter 7 — results at scale + status
   * ===================================================================== */
  function chScale(el, W) {
    const h = W.h;
    const stats = W.ui.stats([
      { v: '6,574', k: 'abandoned Alexandria systems (quaternary + quinary)' },
      { v: '3,225', k: 'GA-completed; <b>96%</b> end with f<sub>soft</sub> &lt; 2%' },
      { v: '156,671', k: 'unique low-symmetry polymorphs (mean 49 per system)' },
      { v: '104', k: 'meV/atom mean energy lowering (median 83)' },
      { v: '95.4%', k: 'still lower in DFT (166 of 174 clash-free)' },
      { v: '≈ 4,080', k: 'GPU-hours, 1.3 h per system' },
    ]);
    const panel = h('div', { class: 'vml-panel' });
    const tabs = W.ui.seg([{ value: 'ws', label: 'White space' }, { value: 'dft', label: 'Benchmark vs DFT' }, { value: 'auc', label: 'Stability metric' }, { value: 'meid', label: 'MEIDNet perovskites' }], 'ws', show, 'Result');
    const stage = W.ui.stage('Results', tabs.el, panel);

    const prose = h('div', { class: 'prose' },
      h('p', { html: 'Alexandria holds thousands of quaternary and quinary systems with a single high-symmetry entry above the hull. They may simply never have been relaxed into lower symmetry: possible <strong>false negatives</strong>.' }),
      h('p', { html: 'All got MACE-OMAT-0 phonons. 3,137 (47.7%) were already below 2% after relaxation; the other 3,437 entered the GA.' }),
      h('h3', null, 'Status'),
      h('ul', null,
        h('li', { html: 'Resubmission to <strong>Nature Communications</strong> after “reject and resubmit”; npj Computational Materials next.' }),
        h('li', { html: 'Open: <a href="https://github.com/rogeriog/VibroML" target="_blank" rel="noopener">code</a> (MIT), <a href="https://github.com/rogeriog/VibroML_SupportData" target="_blank" rel="noopener">support data + explorer</a>, <a href="https://doi.org/10.6084/m9.figshare.34790283" target="_blank" rel="noopener">83,562 GA minima on Figshare</a>.' }),
        h('li', { html: 'Limits: PBE artifacts are inherited, no LO–TO splitting, MLIP-level dynamics in the white-space campaign.' })),
      W.ui.code('vibroml --cif LiFsimplecubic.cif --auto --method ga \\\n        --max_workers=4  # 1 A100: 1.80x GA, 1.49x phonons\npython launch_explorer.py  # SupportData explorer', 'bash'));
    el.appendChild(stats);
    el.appendChild(h('div', { class: 'bench vml-scale' }, prose, stage));

    function dumbbell() {
      const rows = [
        { k: 'GA-completed with f<sub>soft</sub> &lt; 2%', a: 31.0, b: 96.0, sa: '31.0', sb: '96.0', max: 100, u: '%' },
        { k: 'median f<sub>soft</sub>', a: 3.75, b: 0.17, sa: '3.75', sb: '0.17', max: 4, u: '%' },
        { k: 'median E<sub>hull</sub> (meV/atom)', a: 181, b: 86.5, sa: '181', sb: '86.5', max: 200, u: '' },
      ];
      return h('div', { class: 'vml-dumb' }, rows.map((r) => {
        const pa = 100 * r.a / r.max, pb = 100 * r.b / r.max;
        return h('div', { class: 'row' },
          h('div', { class: 'lab', html: r.k }),
          h('div', { class: 'track' },
            h('span', { class: 'bar', style: { left: Math.min(pa, pb) + '%', width: Math.abs(pb - pa) + '%' } }),
            h('span', { class: 'dot a', style: { left: pa + '%' }, title: 'before GA' }),
            h('span', { class: 'dot b', style: { left: pb + '%' }, title: 'after GA' })),
          h('div', { class: 'val tnum', html: `${r.sa}${r.u} → <b>${r.sb}${r.u}</b>` }));
      }));
    }
    function show(v) {
      panel.innerHTML = '';
      if (v === 'ws') {
        panel.append(h('div', { class: 'vml-legend' }, h('span', { class: 'dot a' }), h('span', null, 'before GA'), h('span', { class: 'dot b' }), h('span', null, 'after GA')), dumbbell(),
          h('ul', { class: 'vml-list' },
            h('li', { html: 'E<sub>hull</sub>: 4.2% on the hull, 20.9% within 50 meV/atom (Alexandria DFT hull + MLIP ΔE).' }),
            h('li', { html: '56 systems reach f<sub>soft</sub> = 0 exactly (all in 4–6-atom cells).' }),
            h('li', { html: 'Examples: Cs₂ZrAsF₆, 127 polymorphs, −347 meV/atom; BaYScGeO₆, 81 polymorphs, −139 meV/atom.' }),
            h('li', { html: 'Elpasolites: 98% of 254 GA-completed runs reach f<sub>soft</sub> &lt; 2% (both initializations).' })));
      } else if (v === 'dft') {
        panel.append(
          h('div', { class: 'vml-funnel' }, [['200', 'random systems'], ['187', 'DFT converged'], ['174', 'clash-free'], ['166', 'still lower in DFT']].map(([n, k], i) =>
            h('div', { class: 'f' + (i === 3 ? ' last' : '') }, h('b', null, n), h('span', null, k)))),
          h('p', { class: 'hint', html: 'White-space DFT check: median ΔE −96 (DFT) vs −89 meV/atom (MLIP); Pearson r ≈ 0.7.' }),
          W.ui.table(['Experimental GS', 'ΔE MLIP', 'DFT init', 'DFT relax', 'f<sub>soft</sub> %'], [
            ['LiF Fm-3m', '−297.2', '−296.1', '−296.1', '0.0'], ['CsPbI₃ δ-Pnma', '−44.2', '−37.9', '−38.0', '1.6'],
            ['HfO₂ P2₁/c', '−48.5', '−94.4', '−95.1', '2.6'], ['Bi₂Sn₂O₇ Cc', '−14.1', '−25.7', '−25.8', '4.1']], [1, 2, 3, 4]),
          h('p', { class: 'hint', html: 'ΔE in meV/atom vs the parent (Table 1, MACE-OMAT-0). “init” = DFT single point on the MLIP geometry.' }));
      } else if (v === 'auc') {
        panel.append(W.ui.table(['Metric (ROC AUC)', 'MACE-OMAT', 'PET-MAD', 'MACE-MP', 'eSEN', 'UMA'], [
          ['<b>f<sub>soft</sub></b>', '<b>0.988</b>', '<b>1.000</b>', '<b>0.950</b>', '<b>1.000</b>', '<b>0.988</b>'],
          ['Ω<sub>0.5</sub>', '0.963', '1.000', '0.938', '1.000', '0.963'],
          ['I<sub>curv</sub>', '0.812', '0.963', '0.800', '0.875', '0.837'],
          ['Ω<sub>2</sub>', '0.750', '0.825', '0.775', '0.800', '0.787'],
          ['ω<sub>min</sub>', '0.725', '0.788', '0.725', '0.762', '0.750']], [1, 2, 3, 4, 5]),
        h('p', { class: 'hint', html: '24 structures (4 unstable aristotypes, 20 literature-stable polymorphs). With only 4 unstable cases the AUC shows ranking, not calibration. Youden optimum ≈ 4.5% (descriptive); screening uses 2%.' }));
      } else {
        panel.append(W.ui.table(['Formula', 'E<sub>hull</sub> before', 'E<sub>hull</sub> after', 'E<sub>g</sub> before', 'E<sub>g</sub> after'], [
          ['KTaSe₃', '0', '0', '0', '0.68'], ['LaScSe₃', '95.6', '58', '0.72', '1.05'], ['YbScSe₃', '0', '0', '0.63', '1.68'],
          ['LaBiTe₃', '0', '0', '0.14', '1.38'], ['YbFeSe₃', '0', '0', '0', '0.79*'], ['YbMnSe₃', '0', '0', '0', '1.98*'],
          ['YbCoSe₃', '0', '0', '0', '0.67*'], ['TmMnSe₃', '88.6', '41', '0', '0.79*'], ['BaHfSe₃', '98.7', '0', '0.21', '0.22']], [1, 2, 3, 4]),
        h('p', { class: 'hint', html: 'SUN perovskites from <a href="/garden/meidnet/">MEIDNet</a> (Babu <i>et al.</i>, <i>npj Comput. Mater.</i> 2026, Table S2) treated by VibroML (DFT; E<sub>hull</sub> in meV, E<sub>g</sub> in eV). * Predicted metallic; gap estimated assuming a 1–2 eV Fermi-level shift.' }));
      }
    }
    show('ws');
  }

  WELT.register({
    id: 'vibroml', order: 6, name: 'VibroML',
    logo: 'assets/logos/vibroml.png', logoDark: false,
    tagline: 'Find the imaginary phonons, then follow them downhill to a stable crystal, automatically.',
    status: [
      { label: 'In revision · Nat. Commun. (npj Comput. Mater. next)', tone: 'warn' },
      { label: 'GitHub', tone: 'plain', href: 'https://github.com/rogeriog/VibroML' },
    ],
    chapters: [
      { id: 'problem', title: 'Unstable is not useless', kicker: 'The problem',
        lede: 'Screening and generative models propose crystals that sit on saddle points of the energy surface. VibroML finds the imaginary phonons and follows them downhill to a stable polymorph.',
        render: chSaddle },
      { id: 'pipeline', title: 'One pipeline', kicker: 'Workflow',
        lede: 'MLIP phonons, a stability decision, remediation, then MD and DFT checks.',
        render: chPipeline },
      { id: 'detect', title: 'Reading instability', kicker: 'Detection',
        lede: 'Count the imaginary modes on the q-mesh instead of trusting the single lowest frequency.',
        render: chDetect },
      { id: 'follow', title: 'Following soft modes', kicker: 'Remediation I · TRAD and ALL',
        lede: 'Displace along the soft eigenvector, relax, recompute phonons, repeat.',
        render: chFollow },
      { id: 'ga', title: 'GA vs single paths', kicker: 'Remediation II · GA',
        lede: 'The genetic algorithm explores more of the energy surface than soft-mode following, and finds the experimental ground states.',
        render: chRace },
      { id: 'verify', title: 'Repaired, then checked', kicker: 'Validation',
        lede: 'Each repaired structure is checked again: phonons, DFT energies and finite-temperature MD.',
        render: chVerify },
      { id: 'scale', title: 'At database scale', kicker: 'Results and status',
        lede: '6,574 abandoned Alexandria systems went through the VibroML pipeline with MACE-OMAT-0.',
        render: chScale },
    ],
  });
})();
