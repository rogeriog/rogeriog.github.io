/* ProtoCSP section: prototype-based crystal structure prediction for solid solutions, HEAs and
 * complex crystals. Facts come from briefs/protocsp.md (repo rogeriog/ProtoCSP, the revised VibroML
 * manuscript/SI, an internal screening run). Toy models are labelled as such on the page. */
(function () {
  'use strict';
  const FIG = 'assets/figs/protocsp/';
  const CAP = 200000; // core.py: MAX_COMBINATIONS = 200_000

  /* ---------- helpers ---------- */
  const tok = (W, n, f) => W.css(n) || f || '#888';
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
  const rgba = (c, a) => { const v = rgbOf(c); return `rgba(${v[0]},${v[1]},${v[2]},${a})`; };
  const font = (W, px, wgt) => `${wgt || 600} ${px}px ${W.css('--f-body') || 'system-ui, sans-serif'}`;
  const mono = (W, px, wgt) => `${wgt || 400} ${px}px ${W.css('--f-mono') || 'monospace'}`;
  const minus = (s) => String(s).replace(/-/g, '−');
  const commas = (s) => String(s).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const NARROW = () => (window.innerWidth || 1200) < 700;
  const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '.': '.' };
  const subf = (f) => f.replace(/(\d+(?:\.\d+)?)/g, (m) => m.split('').map((c) => SUB[c]).join(''));
  const subH = (f) => f.replace(/(\d+(?:\.\d+)?)/g, '<sub>$1</sub>'); // HTML subscripts for mono lines
  function log10Big(b) { const s = b.toString(); return s.length - 1 + Math.log10(+('0.' + s.slice(0, 15)) * 10); }
  function sci(b) { // BigInt → "3.6×10⁵⁶" style when large
    const s = b.toString();
    if (s.length <= 15) return commas(s);
    let m = Math.round(+s.slice(0, 4) / 10), e = s.length - 1; // 3 significant digits, rounded
    if (m >= 1000) { m = 100; e++; }
    const ms = String(m), sup = String(e).split('').map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c]).join('');
    return `${ms[0]}.${ms.slice(1, 3)}×10${sup}`;
  }
  function binom(n, k) { if (k < 0 || k > n) return 0n; let r = 1n; for (let i = 0; i < k; i++) r = r * BigInt(n - i) / BigInt(i + 1); return r; }

  /* ---------- square-lattice symmetry (toy) ----------
   * G = translations (Lx·Ly) × point operations. Square: D4 (8 ops). Rectangle: {E, C2, mx, my} (4 ops).
   * Site (x,y) → (a·x + b·y + tx mod Lx, c·x + d·y + ty mod Ly). */
  function groupPerms(Lx, Ly) {
    const N = Lx * Ly, pts = [[1, 0, 0, 1], [-1, 0, 0, -1], [-1, 0, 0, 1], [1, 0, 0, -1]];
    if (Lx === Ly) pts.push([0, -1, 1, 0], [0, 1, -1, 0], [0, 1, 1, 0], [0, -1, -1, 0]);
    const mod = (a, m) => ((a % m) + m) % m, perms = [];
    for (const [a, b, c, d] of pts) for (let tx = 0; tx < Lx; tx++) for (let ty = 0; ty < Ly; ty++) {
      const p = new Array(N);
      for (let x = 0; x < Lx; x++) for (let y = 0; y < Ly; y++) p[x + Lx * y] = mod(a * x + b * y + tx, Lx) + Lx * mod(c * x + d * y + ty, Ly);
      perms.push(p);
    }
    return perms;
  }
  function cycleLengths(p) {
    const seen = new Array(p.length).fill(false), out = [];
    for (let i = 0; i < p.length; i++) { if (seen[i]) continue; let j = i, n = 0; while (!seen[j]) { seen[j] = true; j = p[j]; n++; } out.push(n); }
    return out;
  }
  // Burnside: distinct = (1/|G|) Σ_g [t^k] Π_{cycles c of g} (1 + t^|c|)   (BigInt, exact)
  function burnside(perms, k) {
    let tot = 0n;
    for (const p of perms) {
      const poly = new Array(k + 1).fill(0n); poly[0] = 1n;
      for (const c of cycleLengths(p)) for (let d = k; d >= c; d--) poly[d] += poly[d - c];
      tot += poly[k];
    }
    return tot / BigInt(perms.length);
  }
  function canonKey(perms, sites) { // smallest sorted image of an occupied-site list
    let best = null;
    for (const p of perms) {
      const img = sites.map((s) => p[s]).sort((a, b) => a - b).join(',');
      if (best === null || img < best) best = img;
    }
    return best;
  }
  function orbitSize(perms, sites) { const s = new Set(); for (const p of perms) s.add(sites.map((i) => p[i]).sort((a, b) => a - b).join(',')); return s.size; }
  function combos(n, k, fn) { // calls fn(arrayOfIndices) for each k-subset
    const c = []; for (let i = 0; i < k; i++) c.push(i);
    if (k === 0) { fn([]); return; }
    for (;;) {
      fn(c);
      let i = k - 1; while (i >= 0 && c[i] === n - k + i) i--;
      if (i < 0) return;
      c[i]++; for (let j = i + 1; j < k; j++) c[j] = c[j - 1] + 1;
    }
  }
  function nnContacts(Lx, Ly, occ) { // periodic 4-neighbour dopant–dopant pairs
    let n = 0;
    for (let y = 0; y < Ly; y++) for (let x = 0; x < Lx; x++) {
      if (!occ[x + Lx * y]) continue;
      if (Lx > 2 || x === 0) if (occ[((x + 1) % Lx) + Lx * y]) n++;
      if (Ly > 2 || y === 0) if (occ[x + Lx * ((y + 1) % Ly)]) n++;
    }
    return n;
  }

  /* Draw a periodic decoration: cells, with faint periodic images around the supercell. */
  function drawLattice(ctx, W, ox, oy, cell, Lx, Ly, occ, opts) {
    const o = opts || {}, host = tok(W, '--surface-2'), line = tok(W, '--line'), dop = tok(W, '--p2'), fg = tok(W, '--fg');
    const ghost = o.ghost || 0;
    for (let gy = -ghost; gy <= ghost; gy++) for (let gx = -ghost; gx <= ghost; gx++) {
      const isMain = gx === 0 && gy === 0;
      if (!isMain && !(Math.abs(gx) <= 1 && Math.abs(gy) <= 1)) continue;
      ctx.globalAlpha = isMain ? 1 : 0.22;
      for (let y = 0; y < Ly; y++) for (let x = 0; x < Lx; x++) {
        const px = ox + (gx * Lx + x) * cell, py = oy + (gy * Ly + (Ly - 1 - y)) * cell;
        const r = cell * 0.36, cx = px + cell / 2, cy = py + cell / 2, on = occ[x + Lx * y];
        ctx.beginPath(); ctx.arc(cx, cy, on ? r : r * 0.82, 0, 7);
        ctx.fillStyle = on ? dop : host; ctx.fill();
        ctx.lineWidth = on ? 1.4 : 1; ctx.strokeStyle = on ? rgba(fg, 0.55) : line; ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.setLineDash([5, 4]); ctx.strokeStyle = rgba(fg, 0.6); ctx.lineWidth = 1.5;
    ctx.strokeRect(ox, oy, Lx * cell, Ly * cell); ctx.setLineDash([]);
  }

  /* =====================================================================
   * Chapter 1: ordering enumerator (Burnside, BigInt) with the ProtoCSP cap
   * ===================================================================== */
  function chEnum(el, W) {
    const h = W.h;
    const SIZES = [[3, 3], [4, 4], [5, 5], [6, 6], [8, 8], [3, 4], [4, 6]];
    const st = { L: [4, 4], k: 4, seed: 7, pick: null };
    let perms = groupPerms(4, 4), occ = [];

    const prose = h('div', { class: 'prose' },
      h('ul', null,
        h('li', { html: 'Screening and alloy design give <strong>formulas</strong>, e.g. ' + subf('Cs2(K0.9Na0.1)In(I0.5Br0.5)6') + '. An MLIP or a DFT code needs <strong>atoms in a cell</strong>.' }),
        h('li', { html: 'Which site gets which atom is unknown a priori. Each ordering is a different crystal, with a different energy.' }),
        h('li', { html: 'Symmetry removes duplicates, at most a factor |<i>G</i>|. The count still explodes with cell size.' })),
      W.ui.stats([
        { v: '100,627,800', k: 'orderings for 470,610 compositions of (111) perovskites (thesis screen)' },
        { v: '≈ 3.6×10<sup>56</sup>', k: 'ways to put I/Br 50:50 on the 192 X sites of a 2×2×2 K₂NaAlF₆ cell' },
      ]),
      W.ui.callout('<strong>ProtoCSP’s guard.</strong> Before <code>--symmetrize</code> calls enumlib, it counts the raw decorations of every mixed sublattice. If any exceeds <b>200,000</b> (<code>MAX_COMBINATIONS</code>), it skips enumeration and uses farthest-point sampling.'));

    const stage = W.ui.stage('Toy model · orderings on a periodic square lattice');
    const sizeSeg = W.ui.seg(SIZES.map(([a, b]) => ({ value: a + 'x' + b, label: a + '×' + b })), '4x4', (v) => {
      const [a, b] = v.split('x').map(Number), x = st.k / (st.L[0] * st.L[1]);
      st.L = [a, b]; perms = groupPerms(a, b);
      const N = a * b; st.k = Math.max(1, Math.min(N - 1, Math.round(x * N)));
      sl.input.max = String(N - 1); sl.set(st.k);
    }, 'Supercell size');
    const sl = W.ui.slider({ label: 'mixing fraction x', min: 1, max: 15, step: 1, value: st.k,
      fmt: (v) => `${(v / (st.L[0] * st.L[1])).toFixed(2)} · ${v} of ${st.L[0] * st.L[1]}`, onInput: (v) => { st.k = v; st.pick = null; upd(); } });
    const reroll = h('button', { class: 'btn ghost', type: 'button', onclick: () => { st.seed++; st.pick = null; upd(); } }, 'Random ordering');
    const grid = h('div', { class: 'pc-enum' });
    const latWrap = h('div', { class: 'pc-lat' }), side = h('div', { class: 'pc-enum-side' });
    grid.append(latWrap, side);
    const read = h('div', { class: 'pc-read' }), barWrap = h('div'), verdict = h('p', { class: 'pc-verdict' });
    side.append(read, barWrap, verdict);
    const gallery = h('div', { class: 'pc-gallery' });
    stage.append(h('div', { class: 'ctrl-row' }, sizeSeg.el), h('div', { class: 'ctrl-row pc-grow' }, sl.el, reroll), grid, gallery,
      h('p', { class: 'hint', html: 'Distinct = (1/|<i>G</i>|) ∑<sub><i>g</i></sub> [<i>t</i><sup><i>k</i></sup>] ∏<sub>cycles of <i>g</i></sub>(1 + <i>t</i><sup>|<i>c</i>|</sup>) (Burnside), exact integers. Toy: one fixed cell, translations + square point group. ProtoCSP also calls enumlib (Hart–Forcade) on one fixed supercell (<code>max_cell_size=1</code>).' }));
    el.appendChild(h('div', { class: 'bench' }, prose, stage));

    const cvL = W.canvas(latWrap, drawLat, { aspect: 1, label: 'Supercell with one ordering and its periodic images' });
    const cvB = W.canvas(barWrap, drawBars, { height: 104, label: 'Raw and symmetry-distinct counts on a log scale' });
    let raw = 0n, dist = 0n, curKey = '';

    function randomOcc() {
      const N = st.L[0] * st.L[1], r = W.rng(st.seed * 7919 + N * 31 + st.k), idx = [...Array(N).keys()];
      for (let i = N - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      const o = new Array(N).fill(0); idx.slice(0, st.k).forEach((i) => (o[i] = 1)); return o;
    }
    function upd() {
      const [Lx, Ly] = st.L, N = Lx * Ly;
      raw = binom(N, st.k); dist = burnside(perms, st.k);
      occ = st.pick ? st.pick.slice() : randomOcc();
      const sites = occ.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
      const m = orbitSize(perms, sites);
      read.innerHTML = '';
      read.append(
        h('div', null, h('span', { class: 'k' }, 'raw  C(N, k)'), h('span', { class: 'v tnum' }, sci(raw))),
        h('div', null, h('span', { class: 'k' }, 'symmetry-distinct'), h('span', { class: 'v tnum strong' }, sci(dist))),
        h('div', null, h('span', { class: 'k', html: '|<i>G</i>| = ' + perms.length }), h('span', { class: 'v tnum' }, 'ratio ' + (Number(raw) / Number(dist)).toFixed(1))),
        h('div', null, h('span', { class: 'k' }, 'shown ordering'), h('span', { class: 'v tnum' }, `1 of ${m} copies · ${nnContacts(Lx, Ly, occ)} contact${nnContacts(Lx, Ly, occ) === 1 ? '' : 's'}`)));
      const over = raw > BigInt(CAP);
      verdict.className = 'pc-verdict ' + (over ? 'over' : 'ok');
      verdict.innerHTML = over
        ? `Raw count above 200,000: ProtoCSP would <b>skip enumeration</b> and use farthest-point sampling.`
        : `Raw count ≤ 200,000: <code>--symmetrize</code> would <b>enumerate</b> this sublattice.`;
      curKey = canonKey(perms, sites);
      buildGallery();
      cvL.redraw(); cvB.redraw();
    }
    function buildGallery() {
      gallery.innerHTML = '';
      const [Lx, Ly] = st.L, N = Lx * Ly;
      if (raw > 13000n || dist > 400n) {
        gallery.appendChild(h('p', { class: 'hint' }, `Too many classes to list (${sci(dist)}). Pick 3×3 or 4×4 with a small x to see every distinct ordering.`));
        return;
      }
      const reps = new Map();
      combos(N, st.k, (c) => { const key = canonKey(perms, c); const r = reps.get(key); if (r) r.n++; else reps.set(key, { sites: c.slice(), n: 1 }); });
      const list = [...reps.entries()].map(([key, v]) => Object.assign({ key }, v)).sort((a, b) => b.n - a.n);
      const MAXS = 48;
      gallery.appendChild(h('div', { class: 'pc-gal-h' }, `All ${list.length} distinct orderings (number = equivalent copies, sums to ${commas(raw.toString())})`));
      const row = h('div', { class: 'pc-gal-row' });
      list.slice(0, MAXS).forEach((r) => {
        const o = new Array(N).fill(0); r.sites.forEach((i) => (o[i] = 1));
        const cv = h('canvas', { class: 'pc-thumb', width: 2 * (Lx * 7 + 2), height: 2 * (Ly * 7 + 2) });
        cv.style.width = (Lx * 7 + 2) + 'px'; cv.style.height = (Ly * 7 + 2) + 'px';
        const c = cv.getContext('2d'); c.scale(2, 2);
        for (let y = 0; y < Ly; y++) for (let x = 0; x < Lx; x++) {
          c.fillStyle = o[x + Lx * y] ? tok(W, '--p2') : tok(W, '--line');
          c.fillRect(1 + x * 7, 1 + (Ly - 1 - y) * 7, 6, 6);
        }
        const b = h('button', { type: 'button', class: 'pc-gal-item', 'aria-pressed': String(r.key === curKey), title: r.n + ' equivalent copies', onclick: () => { st.pick = o; upd(); } }, cv, h('span', { class: 'tnum' }, String(r.n)));
        row.appendChild(b);
      });
      if (list.length > MAXS) row.appendChild(h('span', { class: 'hint' }, `+${list.length - MAXS} more`));
      gallery.appendChild(row);
    }
    function drawLat(ctx, w, hh) {
      if (w < 40) return;
      const [Lx, Ly] = st.L, cell = Math.min((w - 8) / (Lx + 1.2), (hh - 8) / (Ly + 1.2));
      const ox = (w - Lx * cell) / 2, oy = (hh - Ly * cell) / 2;
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, hh); ctx.clip();
      drawLattice(ctx, W, ox, oy, cell, Lx, Ly, occ, { ghost: 1 });
      ctx.restore();
    }
    function drawBars(ctx, w, hh) {
      if (w < 40) return;
      const fg = tok(W, '--fg'), mu = tok(W, '--muted'), p = tok(W, '--p'), p2 = tok(W, '--p2'), bad = tok(W, '--bad');
      const L = 70, R = 10, maxE = Math.max(6, Math.ceil(log10Big(raw) + 0.3));
      const X = (e) => L + (w - L - R) * e / maxE;
      const rows = [['raw', raw, rgba(mu, 0.55)], ['distinct', dist, p]];
      ctx.font = font(W, 12, 700); ctx.textBaseline = 'middle';
      rows.forEach(([lab, v, col], i) => {
        const y = 14 + i * 28, e = v > 0n ? log10Big(v) : 0;
        ctx.fillStyle = mu; ctx.textAlign = 'right'; ctx.fillText(lab, L - 8, y);
        ctx.fillStyle = col; ctx.fillRect(L, y - 9, Math.max(2, X(e) - L), 18);
        ctx.fillStyle = fg; ctx.textAlign = 'left'; ctx.font = mono(W, 11, 600);
        const t = sci(v), tw = ctx.measureText(t).width;
        ctx.fillText(t, Math.min(X(e) + 6, w - R - tw), y); ctx.font = font(W, 12, 700);
      });
      // axis: decades
      const ay = 70;
      ctx.strokeStyle = rgba(mu, 0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L, ay); ctx.lineTo(w - R, ay); ctx.stroke();
      ctx.fillStyle = mu; ctx.font = font(W, 10, 600); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const stp = maxE > 12 ? 4 : 2;
      for (let e = 0; e <= maxE; e += stp) { ctx.fillText('10' + String(e).split('').map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c]).join(''), X(e), ay + 4); }
      // cap line
      const cx = X(Math.log10(CAP));
      ctx.strokeStyle = bad; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(cx, 2); ctx.lineTo(cx, ay); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = bad; ctx.font = font(W, 10, 700); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('cap 200,000', Math.min(cx + 4, w - R - 64), ay + 16);
      void p2;
    }
    upd();
  }

  /* =====================================================================
   * Chapter 2: cold start: LeMat-Bulk lookup → rank → χ-ordered transmutation → checks
   * ===================================================================== */
  // Pauling χ and periodic group as in pymatgen (Element.X, Element.group)
  const EL = { Li: [0.98, 1], Na: [0.93, 1], K: [0.82, 1], Rb: [0.82, 1], Cs: [0.79, 1], Sr: [0.95, 2], La: [1.10, 3], Ti: [1.54, 4], Nb: [1.6, 5],
    Mn: [1.55, 7], Fe: [1.83, 8], Co: [1.88, 9], Ag: [1.93, 11], Zn: [1.65, 12], Al: [1.61, 13], In: [1.78, 13], Bi: [2.02, 15], Sb: [2.05, 15],
    O: [3.44, 16], F: [3.98, 17], Cl: [3.16, 17], Br: [2.96, 17], I: [2.66, 17] };
  const ANIONS = new Set(['O', 'F', 'S', 'Cl', 'N', 'P', 'Br', 'I', 'Se', 'Te']);
  function parseF(f) { const out = []; f.replace(/([A-Z][a-z]?)(\d*\.?\d*)/g, (m, e, n) => { out.push([e, n ? +n : 1]); return m; }); return out; }
  function anon(f) { // pymatgen: letters by count ascending; LeMat: descending (core.py _pymatgen_to_lemat_anon)
    const cnt = parseF(f).map((x) => x[1]);
    if (cnt.some((c) => c % 1)) return null;
    const asc = cnt.slice().sort((a, b) => a - b), dsc = cnt.slice().sort((a, b) => b - a), L = 'ABCDEFGH';
    const s = (arr) => arr.map((c, i) => L[i] + (c > 1 ? c : '')).join('');
    return [s(asc), s(dsc)];
  }
  // _rank_prototypes_by_similarity, salt path (anion fraction ≥ 10%); energy tie-break −5·E_DB not shown
  function score(target, proto) {
    const T = parseF(target), P = parseF(proto);
    const tAn = T.filter(([e]) => ANIONS.has(e)).map(([e]) => e), tCat = new Set(T.filter(([e]) => !ANIONS.has(e)).map(([e]) => e));
    const pAn = new Set(P.filter(([e]) => ANIONS.has(e)).map(([e]) => e)), pCat = new Set(P.filter(([e]) => !ANIONS.has(e)).map(([e]) => e));
    const tG = new Set([...tCat].map((e) => EL[e][1])), pG = new Set([...pCat].map((e) => EL[e][1]));
    const terms = [];
    if (pAn.has(tAn[0])) terms.push(['anion ' + tAn[0] + ' matches', 1000]); else if (pAn.size) terms.push(['other anion', 50]); else terms.push(['no anion', -2000]);
    const ov = [...tCat].filter((e) => pCat.has(e)); if (ov.length) terms.push(['shared ' + ov.join(', '), 500 * ov.length]);
    const go = [...tG].filter((g) => pG.has(g)).length; if (go) terms.push([go + ' shared group' + (go > 1 ? 's' : ''), 200 * go]);
    if ([...tCat].every((e) => pCat.has(e))) terms.push(['cation subset', 1000]);
    const ex = [...pCat].filter((e) => !tCat.has(e)).length; if (ex) terms.push([ex + ' extra cation' + (ex > 1 ? 's' : ''), -100 * ex]);
    return { total: terms.reduce((s, t) => s + t[1], 0), terms };
  }
  const ELPA_PROTOS = ['Cs2NaBiI6', 'Cs2NaBiCl6', 'Cs2AgBiBr6', 'K2NaAlF6'];
  const PRESETS = {
    SrTiO3: { kind: 'exact', cls: '287,563', exact: 28, time: '22.0 s',
      top: [['oqmd-9181828', 'R-3', '−7.944'], ['oqmd-2612191', 'R-3c', '−7.944'], ['oqmd-2005719', 'Pnma', '−7.944']] },
    NaCl: { kind: 'exact', cls: '90,118', exact: 135, time: '7.8 s',
      top: [['oqmd-9183247', 'Fm-3m', '−3.388'], ['oqmd-3711479', 'Fm-3m', '−3.388'], ['oqmd-9184061', 'P31m', '−3.387']] },
    Na2BiNbI6: { kind: 'ws', cubic: [100, '−326.3', '39.88', '0.32'], proto: ['--', '--', '0.13', '0.13'] },
    Li2CoZnI6: { kind: 'ws', cubic: [76, '−380.1', '38.81', '0.07'], proto: ['--', '--', '0.53', '0.53'] },
    K2BiSbF6: { kind: 'ws', cubic: [83, '−332.1', '40.02', '1.05'], proto: [107, '−166.0', '1.33', '1.02'] },
    'La0.5Sr0.5MnO3': { kind: 'group' },
  };
  function chLookup(el, W) {
    const h = W.h;
    let cur = 'Na2BiNbI6', protoSel = null;
    const prose = h('div', { class: 'prose' },
      h('p', { html: 'No structure for your composition? Borrow one. ProtoCSP indexes <strong>LeMat-Bulk</strong> (MP + OQMD + Alexandria, PBE) by anonymous stoichiometry.' }),
      h('ol', { class: 'pc-steps-txt' },
        h('li', { html: '<b>Exact match</b> of the composition → return those entries, lowest DB energy first.' }),
        h('li', { html: '<b>Transmute</b> the 50 most similar prototypes of the same class: sort both element lists by Pauling χ and map in order, so cations land on cation sites.' }),
        h('li', { html: '<b>Group</b> (bucket fill) or <b>reduce</b> (strip minority elements, then dope) for fractional or many-element targets.' }),
        h('li', { html: '<b>Scale and check</b>: expand the cell if atoms overlap, reject any pair &lt; 0.5 Å and densities outside 0.1–60 g cm⁻³, deduplicate.' })),
      W.ui.code('python main.py SrTiO3 --top-k 10 --save-cif\npython main.py La0.5Sr0.5MnO3 --top-k 5 --verbose', 'bash'),
      h('p', { class: 'hint', html: 'Index build (Dec 2025): 5,005,017 entries. Default route: parquet files of <code>LeMaterial/LeMat-BulkUnique</code> (~3.2 GB), scanned lazily with Polars.' }));

    const seg = W.ui.seg(Object.keys(PRESETS).map((k) => ({ value: k, label: subf(k).replace(/₀\.₅/g, '₀.₅') })), cur, (v) => { cur = v; protoSel = null; show(); }, 'Target composition');
    const body = h('div', { class: 'pc-look' });
    const stage = W.ui.stage('Cold start · step through one target', seg.el, body);
    el.appendChild(h('div', { class: 'bench' }, prose, stage));

    function step(n, title, ...kids) { return h('div', { class: 'pc-lstep' }, h('div', { class: 'n' }, n), h('div', { class: 'b' }, h('div', { class: 't', html: title }), ...kids)); }
    function show() {
      body.innerHTML = '';
      const P = PRESETS[cur], an = anon(cur);
      // 1. class
      body.appendChild(step('1', 'Anonymous class',
        an ? h('p', { class: 'pc-mono', html: `${subH(cur)} → pymatgen <b>${an[0]}</b> → LeMat <b>${an[1]}</b>` })
          : h('p', { class: 'pc-mono', html: `${subH(cur)} → <b>A0.5B0.5CD3</b>: fractional, no class` })));
      if (P.kind === 'exact') {
        body.appendChild(step('2', 'Lookup', h('p', { html: `<b>${P.cls}</b> entries in class · Strategy 0: <b>${P.exact} exact matches</b>` })));
        body.appendChild(step('3', 'Return the lowest-energy entries (no transmutation)',
          W.ui.table(['Source', 'Space group', 'E<sub>DB</sub> (eV/atom)'], P.top, [2])));
        body.appendChild(h('p', { class: 'hint', html: `Older test run (<code>lemat_formula_indexed/</code>), ${P.time} total. LeMat merges polymorphs from several databases, hence the near-identical energies.` }));
      } else if (P.kind === 'group') {
        body.appendChild(step('2', 'Lookup', h('p', { class: 'pc-mono', html: 'Loaded 0 entries for A0.5B0.5CD3 → Strategy 2: generalized grouping' })));
        body.appendChild(step('3', 'Bucket fill: target sums to 5.00 atoms',
          h('p', { html: 'Tries the 5-site keys ABC3, A2B3, AB2C2. Elements sorted by χ pour into the prototype sites until each “bucket” is full; the partial occupancies are then ordered with enumlib.' }),
          h('p', { class: 'pc-mono', html: 'Result: <b>SrLaMn<sub>2</sub>O<sub>6</sub></b> · grouped_from_agm002938082 (Base: La<sub>2</sub>MnO<sub>2</sub>), 241.6 Å<sup>3</sup>' })));
        body.appendChild(h('p', { class: 'hint', html: 'Older test run (38.7 s). The odd base illustrates why ranking was later tightened (stricter anion matching, Mar 2026).' }));
      } else {
        // white-space elpasolite: rank illustrative prototypes, χ-map the chosen one
        const rows = ELPA_PROTOS.map((p) => ({ p, s: score(cur, p) })).sort((a, b) => b.s.total - a.s.total);
        if (!protoSel) protoSel = rows[0].p;
        body.appendChild(step('2', 'Lookup', h('p', { html: 'No exact entry: a <b>white-space</b> composition (no Alexandria entry). Rank prototypes of class A6B2CD.' })));
        const tbl = h('div', { class: 'pc-score' });
        rows.forEach((r) => {
          tbl.appendChild(h('button', { type: 'button', class: 'pc-score-row', 'aria-pressed': String(r.p === protoSel), onclick: () => { protoSel = r.p; show(); } },
            h('span', { class: 'f', html: subf(r.p) }),
            h('span', { class: 'terms', html: r.s.terms.map(([t, v]) => `${t} <b>${v > 0 ? '+' : '−'}${Math.abs(v)}</b>`).join(' · ') }),
            h('span', { class: 'tot tnum' }, minus(r.s.total))));
        });
        body.appendChild(step('3', 'Rank (real weights, illustrative prototypes, energy tie-break omitted) and transmute by χ', tbl, chiMap(cur, protoSel)));
        body.appendChild(step('4', 'What it buys (paper, 200 white-space elpasolites)',
          W.ui.table(['Start', 'unique phases', 'ΔE (meV/at)', 'soft modes, init → final (%)'], [
            ['forced cubic K₂NaAlF₆', P.cubic[0], P.cubic[1], `${P.cubic[2]} → ${P.cubic[3]}`],
            ['ProtoCSP retrieval', P.proto[0], P.proto[1], `${P.proto[2]} → ${P.proto[3]}`]], [1, 2, 3]),
          h('p', { class: 'hint', html: 'f<sub>soft</sub> = fraction of soft phonon modes. ΔE is relative to each start, so the two rows are not the same structure. “--” = no GA needed.' })));
      }
    }
    function chiMap(target, proto) {
      const T = parseF(target).sort((a, b) => EL[a[0]][0] - EL[b[0]][0]), P = parseF(proto).sort((a, b) => EL[a[0]][0] - EL[b[0]][0]);
      const n = T.length, rh = 30, Wd = 460, Ht = n * rh + 26;
      const svg = h('svg', { class: 'pc-chi', viewBox: `0 0 ${Wd} ${Ht}`, role: 'img', 'aria-label': 'Electronegativity-ordered mapping of target elements onto prototype sites' });
      svg.appendChild(h('text', { x: 8, y: 14, class: 'hd' }, 'target, sorted by χ'));
      svg.appendChild(h('text', { x: Wd - 8, y: 14, class: 'hd', 'text-anchor': 'end' }, 'prototype site, sorted by χ'));
      for (let i = 0; i < n; i++) {
        const y = 26 + i * rh + rh / 2, ok = T[i][1] === P[i][1];
        svg.appendChild(h('rect', { x: 4, y: y - 12, width: 150, height: 24, rx: 6, class: 'tg' }));
        svg.appendChild(h('text', { x: 14, y: y + 5, class: 'el' }, `${T[i][0]} ×${T[i][1]}`));
        svg.appendChild(h('text', { x: 146, y: y + 5, class: 'chi', 'text-anchor': 'end' }, 'χ ' + EL[T[i][0]][0].toFixed(2)));
        svg.appendChild(h('rect', { x: Wd - 154, y: y - 12, width: 150, height: 24, rx: 6, class: 'pr' }));
        svg.appendChild(h('text', { x: Wd - 144, y: y + 5, class: 'el' }, `${P[i][0]} site ×${P[i][1]}`));
        svg.appendChild(h('text', { x: Wd - 12, y: y + 5, class: 'chi', 'text-anchor': 'end' }, 'χ ' + EL[P[i][0]][0].toFixed(2)));
        svg.appendChild(h('line', { x1: 158, y1: y, x2: Wd - 162, y2: y, class: 'ar' + (ok ? '' : ' bad') }));
        svg.appendChild(h('path', { d: `M${Wd - 162},${y} l-8,-5 v10 z`, class: 'ah' + (ok ? '' : ' bad') }));
        if (!ok) svg.appendChild(h('text', { x: Wd / 2, y: y - 5, class: 'warn', 'text-anchor': 'middle' }, 'counts differ'));
      }
      return svg;
    }
    show();
  }

  /* =====================================================================
   * Chapter 3: decorate the supercell: enumerate vs farthest-point vs random shuffle (toy)
   * ===================================================================== */
  /* Toy ranking used for the enumerated list (illustrative stand-in for an MLIP energy):
   * E_toy(config) = number of periodic nearest-neighbour dopant–dopant pairs; lowest first. */
  function chDecorate(el, W) {
    const h = W.h;
    const st = { L: 5, k: 4, seed: 3 };
    const prose = h('div', { class: 'prose' },
      h('p', { html: 'Given a base (a VibroML polymorph, a CIF or a retrieved prototype) and target fractions:' }),
      h('div', { class: 'pc-eq', html: '<i>n</i><sub>need</sub> = ⌈1 / min<sub><i>i</i></sub> <i>x<sub>i</sub></i>⌉, &nbsp; <i>n</i><sub>target</sub> = min(max(<i>n</i><sub>need</sub>, <i>m</i>), 1200)' }),
      h('p', { class: 'hint', html: '<i>m</i> = <code>--min-atoms</code> (default 20); with <code>--symmetrize</code>, <i>m</i> = 1.' }),
      h('ul', null,
        h('li', { html: '<b>Supercell</b>: near-cubic multiples <i>s<sub>a</sub>s<sub>b</sub>s<sub>c</sub></i> until the cell holds <i>n</i><sub>target</sub> atoms; site counts <i>n<sub>i</sub></i> = round(<i>x<sub>i</sub></i><i>N</i>).' }),
        h('li', { html: '<b>Where dopants go</b>: same periodic group as a host → substitutional; radius ratio &lt; 0.65 → interstitial; else on the host with the closest χ.' }),
        h('li', { html: '<b>How they are arranged</b>: farthest-point sampling (default), <code>--symmetrize</code> (enumlib, one sublattice at a time, ranked top-k), or <code>--sqs</code> (sqsgenerator, first shell).' })),
      h('div', { class: 'code-label' }, 'Real HPC run: one of 25 grid points of Cs₂(K,Na)In(I,Br)₆'),
      W.ui.code('python protocsp/main.py "Cs2K0.9Na0.1InI3Br3" \\\n  --base-cif cs2kini6_phase_diagram/Cs2KInI6.cif \\\n  --top-k 20 --save-cif --symmetrize --mlip \\\n  --output-dir cs2kini6_phase_diagram/x_0p1/y_0p50', 'bash'));

    const stage = W.ui.stage('Toy model · three ways to place k dopants (top-k = 3)');
    const lSeg = W.ui.seg([4, 5, 6].map((v) => ({ value: v, label: v + '×' + v })), st.L, (v) => {
      const x = st.k / (st.L * st.L); st.L = v; sl.input.max = String(Math.floor(v * v / 2)); sl.set(Math.max(1, Math.min(Math.floor(v * v / 2), Math.round(x * v * v))));
    }, 'Lattice');
    const sl = W.ui.slider({ label: 'dopants k', min: 1, max: 12, step: 1, value: st.k, fmt: (v) => `${v} (x = ${(v / (st.L * st.L)).toFixed(2)})`, onInput: (v) => { st.k = v; run(); } });
    const reseed = h('button', { class: 'btn ghost', type: 'button', onclick: () => { st.seed++; run(); } }, 'New random seeds');
    const cols = h('div', { class: 'pc-cmp' });
    stage.append(h('div', { class: 'ctrl-row' }, lSeg.el, reseed), sl.el, cols,
      h('p', { class: 'hint', html: '“contacts” = dopant–dopant nearest-neighbour pairs (periodic). Toy ranking for the enumerated list: fewest contacts first (stand-in for an energy). Farthest-point: first site random, then max–min distance to placed atoms of the same species, as in <code>core.py</code>.' }));
    el.appendChild(h('div', { class: 'bench' }, prose, stage));

    function fps(L, k, r) {
      const N = L * L, d = (a, b) => { let dx = Math.abs((a % L) - (b % L)), dy = Math.abs(Math.floor(a / L) - Math.floor(b / L)); dx = Math.min(dx, L - dx); dy = Math.min(dy, L - dy); return Math.hypot(dx, dy); };
      let cand = [...Array(N).keys()]; const placed = [];
      for (let t = 0; t < k; t++) {
        let pick;
        if (!placed.length) pick = cand[Math.floor(r() * cand.length)];
        else { let best = cand[0], bd = -1; for (const s of cand) { const m = Math.min(...placed.map((p) => d(s, p))); if (m > bd) { bd = m; best = s; } } pick = best; }
        placed.push(pick); cand = cand.filter((s) => s !== pick);
      }
      return placed;
    }
    function shuffle(L, k, r) { const idx = [...Array(L * L).keys()]; for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; } return idx.slice(0, k); }
    function toOcc(N, s) { const o = new Array(N).fill(0); s.forEach((i) => (o[i] = 1)); return o; }

    function run() {
      const L = st.L, N = L * L, k = st.k, perms = groupPerms(L, L), raw = binom(N, k), dist = burnside(perms, k);
      const sets = { enum: null, fps: [], rnd: [] };
      for (let i = 0; i < 3; i++) {
        sets.fps.push(fps(L, k, W.rng(st.seed * 101 + i * 13 + 1)));
        sets.rnd.push(shuffle(L, k, W.rng(st.seed * 211 + i * 17 + 5)));
      }
      if (raw <= BigInt(CAP)) {
        const all = [];
        combos(N, k, (c) => { all.push([nnContacts(L, L, toOcc(N, c)), c.slice()]); });
        all.sort((a, b) => a[0] - b[0]);
        const seen = new Set(), pick = [];
        for (const [, c] of all) { const key = canonKey(perms, c); if (seen.has(key)) continue; seen.add(key); pick.push(c); if (pick.length === 3) break; }
        sets.enum = pick;
      }
      cols.innerHTML = '';
      const col = (title, sub, list, note) => {
        const c = h('div', { class: 'pc-cmp-col' }, h('div', { class: 'pc-cmp-h' }, h('b', { html: title }), h('span', { class: 'hint', html: sub })));
        if (!list) { c.appendChild(h('div', { class: 'pc-skip', html: note })); cols.appendChild(c); return; }
        const row = h('div', { class: 'pc-cmp-row' });
        list.forEach((s) => {
          const occ = toOcc(N, s), n = nnContacts(L, L, occ), wrap = h('div', { class: 'pc-mini' });
          row.appendChild(wrap);
          W.canvas(wrap, (ctx, w, hh) => { const cell = Math.min(w, hh) / L; drawLattice(ctx, W, (w - L * cell) / 2, (hh - L * cell) / 2, cell, L, L, occ); }, { aspect: 1, label: 'Decoration' });
          wrap.appendChild(h('div', { class: 'pc-mini-k tnum' + (n ? ' warm' : '') }, n + ' contact' + (n === 1 ? '' : 's')));
        });
        c.appendChild(row);
        if (note) c.appendChild(h('div', { class: 'hint', html: note }));
        cols.appendChild(c);
      };
      col('<code>--symmetrize</code>', `${sci(dist)} distinct of ${sci(raw)} raw`, sets.enum,
        sets.enum ? 'symmetry-distinct, ranked list' : `Raw ${sci(raw)} &gt; 200,000: enumeration skipped → falls back to farthest-point.`);
      col('default · farthest-point', 'spreads atoms of one species', sets.fps, 'spread out; contacts only when crowded');
      col('<code>--fast</code> · random shuffle', 'np.random.shuffle per sublattice', sets.rnd, 'clusters happen; duplicates possible');
    }
    run();
  }

  /* =====================================================================
   * Chapter 4: JSON config explorer (fast tensor mode), real example configs
   * ===================================================================== */
  const CFG = {
    hea: { file: 'example_hea_config.json', N: 128, nNote: '128 atoms assumes a 2-atom bcc cell (Fe_bcc.cif is not in the repo)', sites: { Fe: 128 },
      json: { _description: 'High-Entropy Alloy (HEA) composition sweep on BCC Fe structure. We explore how much Fe to substitute and in what ratios, keeping the BCC framework fixed.',
        experiment_name: 'FeCrNiCo_HEA_Partial_Substitution', base_structure: 'Fe_bcc.cif', supercell_target_atoms: 128,
        composition_ranges: { host: { _comment: 'Percentage of Fe sites to substitute. 0.35 = 35% of all sites become substitutional', Fe: [0.20, 0.50, 0.10] },
          substitutional: { _comment: 'Ratios among substitutional elements. These must sum to 1.0 (they fill the substituted sites)', Cr: [0.30, 0.50, 0.10], Ni: [0.30, 0.50, 0.10], Co: [0.20, 0.40, 0.10] } },
        samples_per_composition: 5 } },
    sites: { file: 'example_perovskite_sites.json', N: 320, nNote: 'target 160 → 2×2×2 of the 40-atom cell = 320 atoms (cubic rounding rule)', sites: { K: 64, Na: 32, Al: 32, F: 192 },
      json: { _description: 'Site-specific substitution in double perovskite K2NaAlF6. Each Wyckoff site type can be substituted independently.',
        experiment_name: 'DoublePerovskite_SiteSpecific_Substitution', base_structure: 'base_K2NaAlF6.cif', supercell_target_atoms: 160,
        site_substitutions: {
          K: { _comment: 'Substitute K sites with other large cations (A-site substitution)', substitution_fraction: [0.0, 0.5, 1.0], substituents: { Cs: 0.4, Rb: 0.3, Na: 0.3 } },
          Na: { _comment: 'Substitute Na sites (other cation position)', substitution_fraction: [0.0, 1.0], substituents: { K: 0.5, Li: 0.5 } },
          Al: { _comment: 'Substitute Al sites with other B-site cations', substitution_fraction: [0.0, 0.5, 1.0], substituents: { Ti: 0.5, Mn: 0.3, Fe: 0.2 } },
          F: { _comment: 'Substitute F sites with other halides (X-site)', substitution_fraction: [0.0, 0.3], substituents: { Cl: 0.6, Br: 0.4 } } },
        samples_per_composition: 5 } },
    grid: { file: 'test_double_perovskite.json', N: 320, nNote: 'supercell_dimensions [2, 2, 2] of the 40-atom cell = 320 atoms', sites: { K: 64, Na: 32, Al: 32, F: 192 },
      json: { _description: 'Cs2(K1-xNax)In(I1-yBry)6 grid with explicit supercell dimensions', experiment_name: 'Cs2KInI6_Explicit_Grid', base_structure: 'base_K2NaAlF6.cif',
        supercell_dimensions: [2, 2, 2],
        site_substitutions: {
          K: { _comment: 'A-site: 100% replacement with Cs', substitution_fraction: [1.0], substituents: { Cs: [1.0] } },
          Na: { _comment: 'B-site: Explicit 5-point list (x=0.0 to 0.4)', substitution_fraction: [1.0], substituents: { K: [1.0, 0.9, 0.8, 0.7, 0.6], Na: [0.0, 0.1, 0.2, 0.3, 0.4] } },
          Al: { _comment: 'B-site: 100% replacement with In', substitution_fraction: [1.0], substituents: { In: [1.0] } },
          F: { _comment: 'X-site: Explicit 5-point list (y=0 to 4/6)', substitution_fraction: [1.0], substituents: { I: [1.0, 0.8333, 0.6667, 0.5, 0.3333], Br: [0.0, 0.1667, 0.3333, 0.5, 0.6667] } } },
        samples_per_composition: 3 } },
    poly: { file: 'example_polyatomic.json', N: 320, nNote: 'supercell_dimensions [2, 2, 2] = 320 atoms', sites: { K: 64, Na: 32, Al: 32, F: 192 },
      json: { _description: 'Example polyatomic ion substitution: NH4+ for Fr dummy atoms', experiment_name: 'Polyatomic_NH4_Substitution', base_structure: 'base_K2NaAlF6.cif',
        supercell_dimensions: [2, 2, 2],
        site_substitutions: {
          K: { _comment: 'A-site: Substitute K with Fr (dummy for NH4+)', substitution_fraction: [0.0, 0.5, 1.0], substituents: { Fr: 1.0 } },
          Na: { _comment: 'B-site: Keep Na', substitution_fraction: [0.0], substituents: {} },
          Al: { _comment: 'B-site: Keep Al', substitution_fraction: [0.0], substituents: {} },
          F: { _comment: 'X-site: Keep F', substitution_fraction: [0.0], substituents: {} } },
        samples_per_composition: 2 } },
  };
  // Replays tensor_generator.py: _parse_range_spec, _fractions_to_discrete and the two composition models.
  const pyRound = (x) => { const f = Math.floor(x), d = x - f; if (Math.abs(d - 0.5) < 1e-12) return f % 2 === 0 ? f : f + 1; return Math.round(x); };
  function rangeSpec(r) {
    if (typeof r === 'number') return [r];
    if (r.length === 3) {
      const [a, b, s] = r;
      if (s > b - a && s > 0) return r.slice();
      const out = []; let c = a; while (c <= b + 1e-9) { out.push(Math.round(c * 1e6) / 1e6); c += s; } return out;
    }
    return r.slice();
  }
  function product(lists) { return lists.reduce((acc, l) => { const o = []; acc.forEach((a) => l.forEach((v) => o.push(a.concat([v])))); return o; }, [[]]); }
  function toDiscrete(fr, N) {
    const d = {}, rem = {};
    Object.entries(fr).forEach(([e, f]) => { const ex = f * N; d[e] = pyRound(ex); rem[e] = Math.abs(ex - d[e]); });
    let diff = N - Object.values(d).reduce((a, b) => a + b, 0);
    if (diff) { const s = Object.keys(rem).sort((a, b) => rem[b] - rem[a]); for (let i = 0; i < Math.abs(diff); i++) { const e = s[i % s.length]; if (diff > 0) d[e]++; else if (d[e] > 0) d[e]--; } }
    return d;
  }
  const noC = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_')));
  function compositions(cfg) {
    const j = cfg.json, N = cfg.N;
    if (j.site_substitutions) {
      const opts = {};
      Object.entries(noC(j.site_substitutions)).forEach(([site, spec]) => {
        opts[site] = []; const tot = cfg.sites[site], sub = noC(spec.substituents), names = Object.keys(sub);
        rangeSpec(spec.substitution_fraction).forEach((sf) => {
          const ns = pyRound(tot * sf);
          if (ns === 0) { opts[site].push({ [site]: tot }); return; }
          product(names.map((e) => rangeSpec(sub[e]))).forEach((fr) => {
            if (Math.abs(fr.reduce((a, b) => a + b, 0) - 1) > 0.01) return;
            const d = toDiscrete(Object.fromEntries(names.map((e, i) => [e, fr[i]])), ns);
            opts[site].push(Object.assign({ [site]: tot - ns }, d));
          });
        });
      });
      const sites = Object.keys(opts);
      return product(sites.map((s) => opts[s])).map((combo) => Object.fromEntries(sites.map((s, i) => [s, combo[i]])));
    }
    const host = noC(j.composition_ranges.host), sub = noC(j.composition_ranges.substitutional), he = Object.keys(host)[0], names = Object.keys(sub), out = [];
    rangeSpec(host[he]).forEach((hf) => {
      const ns = pyRound(N * hf);
      if (ns === 0) { out.push({ [he]: { [he]: N } }); return; }
      product(names.map((e) => rangeSpec(sub[e]))).forEach((fr) => {
        if (Math.abs(fr.reduce((a, b) => a + b, 0) - 1) > 0.01) return;
        const d = toDiscrete(Object.fromEntries(names.map((e, i) => [e, fr[i]])), ns);
        out.push({ [he]: Object.assign({ [he]: N - ns }, d) });
      });
    });
    return out;
  }
  const KEYDOC = {
    base_structure: { t: 'base_structure', d: 'The CIF is read once, oxidation states removed, and the geometry is <b>frozen</b>: positions [N,3] and cell [3,3] are shared by every configuration. Each site remembers its host element (the sublattice mask).' },
    supercell_target_atoms: { t: 'supercell_target_atoms', d: 'Near-cubic supercell with at least this many atoms (same rounding rule as the main pipeline). For K₂NaAlF₆ (40 atoms, a = 8.25 Å), 160 rounds to 2×2×2 = <b>320 atoms</b>.' },
    supercell_dimensions: { t: 'supercell_dimensions', d: 'Explicit repetition of the base cell. [2, 2, 2] on K₂NaAlF₆ gives <b>320 atoms</b>: 64 K, 32 Na, 32 Al, 192 F sites.' },
    composition_ranges: { t: 'composition_ranges', d: '<b>Partial substitution</b> model (one host element + substitutional elements). Uses global shuffling: all sites are equivalent.' },
    host: { t: 'host', d: 'Fraction of host sites to <b>substitute</b>, not the final composition. <code>[min, max, step]</code> expands to a grid.' },
    substitutional: { t: 'substitutional', d: 'Ratios among the substituted sites. Every Cartesian combination is tried; only those summing to 1 (±0.01) are kept.' },
    site_substitutions: { t: 'site_substitutions', d: '<b>Site-specific</b> model: each element of the base is a sublattice with its own substitution levels. Shuffling stays inside each sublattice (Cs only on K sites, …). Product over sublattices.' },
    substitution_fraction: { t: 'substitution_fraction', d: 'Levels of substitution for this sublattice. Three values with step &gt; range, like <code>[0.0, 0.5, 1.0]</code>, are read as an explicit list, not as [min, max, step].' },
    substituents: { t: 'substituents', d: 'What fills the substituted sites. A scalar is one ratio; a list is a set of ratios. Lists are combined as a Cartesian product and only sums of 1 (±0.01) are kept, so the two paired lists here give x = 0 … 0.4.' },
    samples_per_composition: { t: 'samples_per_composition', d: 'Random shuffles per composition. <b>B</b> = compositions × samples. Output tensors: <code>atomic_numbers [B,N]</code>, <code>positions [B,N,3]</code>, <code>cell [B,3,3]</code>.' },
    polyatomic: { t: 'Fr, At, Po dummies', d: 'Polyatomic ions ride on dummy elements: <code>"polyatomic_mapping": {"Fr": "NH4", "At": "CN", "Po": "SCN"}</code> in the screening configs, or <code>--polyatomic "Fr:NH4,At:SCN"</code> on <code>convert</code>. Each dummy becomes a randomly rotated molecule.' },
    comment: { t: 'keys starting with _', d: 'Comment keys. The parser ignores them.' },
    experiment_name: { t: 'experiment_name', d: 'Label written to <code>tensor_metadata.json</code>.' },
  };
  function chJson(el, W) {
    const h = W.h;
    let cur = 'grid', sel = 'site_substitutions', ci = -1, seed = 1, comps = [];
    const tabs = W.ui.seg(Object.keys(CFG).map((k) => ({ value: k, label: CFG[k].file.replace('.json', '') })), cur, (v) => { cur = v; ci = -1; render(); }, 'Config file');
    const view = h('pre', { class: 'pc-json', 'aria-label': 'JSON config, click a key' });
    const left = h('div', { class: 'prose' }, tabs.el, view,
      h('p', { class: 'hint', html: 'Real files from the repo; the long <code>_approach_explanation</code>, <code>_workflow</code> and <code>_note</code> comments are omitted. Click any underlined key.' }),
      W.ui.code('python main.py example_perovskite_sites.json --fast --output-dir ./output', 'bash'));
    const doc = h('div', { class: 'pc-doc' });
    const csl = W.ui.slider({ label: 'composition #', min: 1, max: 2, step: 1, value: 1, fmt: (v) => v + ' / ' + comps.length, onInput: (v) => { ci = v - 1; strip.redraw(); compLine(); } });
    const shuffleBtn = h('button', { class: 'btn ghost', type: 'button', onclick: () => { seed++; strip.redraw(); } }, 'Reshuffle');
    const stripWrap = h('div', { class: 'pc-strip' }), cline = h('p', { class: 'pc-mono pc-cline' }), count = h('div', { class: 'pc-count' });
    const stage = W.ui.stage('What the key controls · one row of atomic_numbers [B,N]', doc, count, h('div', { class: 'ctrl-row pc-grow' }, csl.el, shuffleBtn), stripWrap, cline);
    el.appendChild(h('div', { class: 'bench even' }, left, stage));
    const strip = W.canvas(stripWrap, drawStrip, { aspect: NARROW() ? 0.62 : 0.36, label: 'Atoms of one configuration grouped by sublattice' });

    function keyClass(k, parent) {
      if (k.startsWith('_')) return 'comment';
      if (parent === 'site_substitutions') return 'site:' + k;
      if (['Fr', 'At', 'Po'].includes(k)) return 'polyatomic';
      if (parent === 'host' || parent === 'substitutional' || parent === 'substituents') return parent === 'substituents' ? 'substituents' : parent;
      return KEYDOC[k] ? k : null;
    }
    function render() {
      comps = compositions(CFG[cur]);
      if (ci < 0 || ci >= comps.length) ci = cur === 'grid' ? 8 : Math.floor(comps.length / 2); // grid #9: x = 0.1, y = 0.5
      csl.input.max = String(Math.max(1, comps.length)); csl.set(Math.min(ci + 1, comps.length));
      if (!(sel in KEYDOC) && !sel.startsWith('site:')) sel = 'site_substitutions';
      if (cur === 'hea' && sel.startsWith('site')) sel = 'composition_ranges';
      if (cur !== 'hea' && ['composition_ranges', 'host', 'substitutional', 'supercell_target_atoms'].includes(sel) && !(cur === 'sites' && sel === 'supercell_target_atoms')) sel = 'site_substitutions';
      view.innerHTML = '';
      const ind = (n) => '  '.repeat(n);
      const short = (s) => (s.length > 70 ? s.slice(0, 68) + '…' : s);
      function val(v, depth, parent) {
        if (Array.isArray(v)) return '[' + v.map((x) => (Number.isInteger(x) ? x.toFixed(1).replace(/\.0$/, cur === 'grid' || parent === 'supercell_dimensions' ? '' : '.0') : String(x))).join(', ') + ']';
        if (typeof v === 'number') return Number.isInteger(v) && parent !== 'sub' ? String(v) : String(v);
        if (typeof v === 'string') return null;
        return undefined;
      }
      function emit(obj, depth, parent) {
        const keys = Object.keys(obj);
        if (!keys.length) { view.append('{}'); return; }
        view.append('{\n');
        keys.forEach((k, i) => {
          const v = obj[k], kc = keyClass(k, parent);
          view.append(ind(depth + 1));
          const ks = h('span', { class: 'jk' + (kc ? ' click' : '') + (kc && (kc === sel) ? ' on' : ''), 'data-k': kc || '' }, JSON.stringify(k));
          if (kc) ks.addEventListener('click', () => { sel = kc; render(); });
          view.append(ks, ': ');
          if (v && typeof v === 'object' && !Array.isArray(v)) emit(v, depth + 1, k);
          else if (typeof v === 'string') view.append(h('span', { class: k.startsWith('_') ? 'jc' : 'js' }, JSON.stringify(short(v))));
          else view.append(h('span', { class: 'jn' }, Array.isArray(v) ? '[' + v.map(fmtNum).join(', ') + ']' : fmtNum(v)));
          view.append(i < keys.length - 1 ? ',\n' : '\n');
        });
        view.append(ind(depth) + '}');
      }
      void val;
      emit(CFG[cur].json, 0, null);
      describe(); strip.redraw(); compLine();
    }
    function fmtNum(x) { return Number.isInteger(x) && String(x).indexOf('.') < 0 && Math.abs(x) >= 2 ? String(x) : (Number.isInteger(x) ? x.toFixed(1) : String(x)); }
    function describe() {
      const c = CFG[cur];
      let d;
      if (sel.startsWith('site:')) {
        const s = sel.slice(5), spec = c.json.site_substitutions[s], subs = Object.keys(noC(spec.substituents));
        d = { t: `sublattice ${s}`, d: `${c.sites[s]} ${s} sites in the ${c.N}-atom cell. Levels <code>${JSON.stringify(spec.substitution_fraction)}</code>${subs.length ? ' filled by ' + subs.join(', ') : ', nothing substituted'}. Highlighted in the strip below.` };
      } else d = KEYDOC[sel] || KEYDOC.comment;
      doc.innerHTML = '';
      doc.append(h('div', { class: 'pc-doc-t' }, h('code', null, d.t)), h('p', { html: d.d }));
      const B = comps.length * c.json.samples_per_composition;
      count.innerHTML = '';
      count.append(
        h('div', null, h('b', { class: 'tnum' }, String(comps.length)), h('span', null, 'compositions')),
        h('div', null, h('b', null, '×' + c.json.samples_per_composition), h('span', null, 'samples')),
        h('div', null, h('b', { class: 'tnum' }, commas(B)), h('span', { html: `configurations · <i>N</i> = ${c.N}` })));
      count.appendChild(h('p', { class: 'hint', html: 'Computed in the page by replaying the parser in <code>tensor_generator.py</code>. ' + c.nNote + '.' }));
    }
    function compLine() {
      const comp = comps[ci]; if (!comp) { cline.textContent = ''; return; }
      const tot = {}; Object.values(comp).forEach((sc) => Object.entries(sc).forEach(([e, n]) => { if (n) tot[e] = (tot[e] || 0) + n; }));
      cline.innerHTML = Object.entries(tot).map(([e, n]) => `${e}<sub>${n}</sub>`).join(' ');
    }
    function colorFor(e, site) {
      if (e === site) return null;
      const order = ['Cs', 'Rb', 'Na', 'K', 'Li', 'Ti', 'Mn', 'Fe', 'Cl', 'Br', 'In', 'I', 'Cr', 'Ni', 'Co', 'Fr'];
      const i = Math.max(0, order.indexOf(e)), dark = W.isDark();
      const hue = [28, 200, 140, 330, 90, 260, 10, 180, 300, 58, 230, 160, 0, 120, 210, 40][i % 16];
      return `hsl(${hue} ${dark ? 70 : 62}% ${dark ? 62 : 46}%)`;
    }
    function drawStrip(ctx, w, hh) {
      if (w < 40) return;
      const c = CFG[cur], comp = comps[ci]; if (!comp) return;
      const fg = tok(W, '--fg'), mu = tok(W, '--muted'), line = tok(W, '--line'), p = tok(W, '--p');
      const sites = Object.keys(c.sites), N = c.N;
      const selSite = sel.startsWith('site:') ? sel.slice(5) : null;
      const cols = NARROW() ? 20 : 32, legendH = 20;
      const rows = (s) => Math.ceil(c.sites[s] / cols), totRows = sites.reduce((t, s) => t + rows(s), 0);
      const cell = Math.max(4, Math.min((w - 70) / cols, 16, (hh - legendH - 8 - 6 * sites.length) / totRows));
      const r = W.rng(seed * 977 + ci * 13 + 1);
      let y = 4;
      const legend = new Map();
      sites.forEach((s) => {
        const sc = comp[s] || { [s]: c.sites[s] };
        const arr = []; Object.entries(sc).forEach(([e, n]) => { for (let i = 0; i < n; i++) arr.push(e); });
        for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
        const hi = !selSite || selSite === s;
        ctx.globalAlpha = hi ? 1 : 0.3;
        ctx.fillStyle = selSite === s ? p : mu; ctx.font = font(W, 12, 700); ctx.textAlign = 'right'; ctx.textBaseline = 'top';
        ctx.fillText(s + ' ×' + c.sites[s], 62, y);
        arr.forEach((e, i) => {
          const x = 68 + (i % cols) * cell, yy = y + Math.floor(i / cols) * cell, col = colorFor(e, s);
          ctx.fillStyle = col || tok(W, '--surface-2'); ctx.fillRect(x, yy, cell - 1.5, cell - 1.5);
          if (!col) { ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, yy + 0.5, cell - 2.5, cell - 2.5); }
          if (col) legend.set(e, col);
        });
        if (selSite === s) { ctx.strokeStyle = p; ctx.lineWidth = 2; ctx.strokeRect(66, y - 2, cols * cell + 2, rows(s) * cell + 2); }
        ctx.globalAlpha = 1;
        y += rows(s) * cell + 6;
      });
      // legend
      let lx = 68; const ly = Math.min(hh - legendH + 2, y + 2);
      ctx.font = font(W, 11, 700); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillStyle = tok(W, '--surface-2'); ctx.fillRect(lx, ly + 2, 10, 10); ctx.strokeStyle = line; ctx.strokeRect(lx + 0.5, ly + 2.5, 9, 9);
      ctx.fillStyle = mu; ctx.fillText('original element', lx + 14, ly + 7); lx += 14 + ctx.measureText('original element').width + 14;
      legend.forEach((col, e) => { ctx.fillStyle = col; ctx.fillRect(lx, ly + 2, 10, 10); ctx.fillStyle = fg; ctx.fillText(e, lx + 14, ly + 7); lx += 14 + ctx.measureText(e).width + 12; });
      void N;
    }
    render();
  }

  /* =====================================================================
   * Chapter 5: relax and rank (real energies: UMA orderings, HEA slab SQS + MACE)
   * ===================================================================== */
  // stage4_orderings.csv (internal screening run, UMA): [cell atoms, E (eV/atom), max force (eV/Å)]
  const MS = {
    'Cs3GaBiBr9': [[28, -2.980987866612547, 0.0412], [28, -2.980988002851735, 0.0412], [56, -3.010924725198449, 0.0503], [56, -3.0109243164808848, 0.0495], [112, -2.980702309274377, 0.0416], [112, -2.980703331068287, 0.0375]],
    'Cs3BiSbBr9': [[112, -3.054445142755698, 0.0402], [112, -3.0544001838236388, 0.0504], [28, -3.0546438476114806, 0.0357], [28, -3.0546435070135103, 0.0357], [56, -3.054628929420388, 0.0496], [56, -3.054628929420388, 0.0496]],
  };
  // log_test_protocsp.txt (2 Apr 2026): E_form (eV/atom), E_tot (eV/atom)
  const HEA = [['sqs_3', 0.2072, -7.4684], ['sqs_1', 0.2171, -7.4586], ['sqs_2', 0.2597, -7.4159]];
  function chRank(el, W) {
    const h = W.h;
    let mode = 'ms', hover = null, zoom = false;
    const prose = h('div', { class: 'prose' },
      h('ul', null,
        h('li', { html: '<b>Engines</b>: MACE (default <code>medium-omat-0</code>), eSEN, UMA, M3GNet through ASE; NEP via a native GPUMD run.' }),
        h('li', { html: '<b>Relaxation</b>: BFGS on a <code>UnitCellFilter</code>, <code>--fmax</code> 0.01 eV/Å. A stopper aborts runaway cells: energy jump &gt; 0.5 eV/atom, volume &gt; 2.5×.' }),
        h('li', { html: '<b>Formation energy</b> against the same MLIP’s elemental references, relaxed from the lowest-energy LeMat entry of each element:' })),
      h('div', { class: 'pc-eq', html: '<i>E</i><sub>f</sub> = <i>E</i>/<i>N</i> − ∑<sub><i>i</i></sub> <i>x<sub>i</sub></i> μ<sub><i>i</i></sub>' }),
      W.ui.callout('<strong>N → 1.</strong> Every composition–polymorph pair keeps its lowest ordering. That one goes on to phonons (VibroML) or DFT.'),
      h('div', { class: 'code-label' }, 'ProtoCSP CLI → MLIP relaxation → ranking'),
      W.ui.code('python protocsp/main.py "Cs3GaBiBr9" \\\n  --base-cif Cs3GaBiBr9.cif --top-k 8 --save-cif \\\n  --symmetrize --mlip --engine mace\n# ranked orderings by formation energy; lowest wins (N → 1)', 'bash'));

    const zoomSeg = W.ui.seg([{ value: 'full', label: '0–35 meV' }, { value: 'zoom', label: 'zoom 0–0.3 meV' }], 'full', (v) => { zoom = v === 'zoom'; hover = null; upd(); }, 'Energy scale');
    const seg = W.ui.seg([{ value: 'ms', label: 'Alloys · UMA · 2 formulas' }, { value: 'hea', label: 'HEA slab · SQS + MACE' }], mode, (v) => {
      mode = v; hover = null; zoomSeg.el.style.visibility = v === 'ms' ? 'visible' : 'hidden'; upd(); }, 'Dataset');
    const cvWrap = h('div'), read = h('div', { class: 'pc-read pc-read3' }), note = h('p', { class: 'hint' });
    const stage = W.ui.stage('Real energies of ProtoCSP orderings · ΔE to the lowest', h('div', { class: 'ctrl-row' }, seg.el, zoomSeg.el), cvWrap, read, note);
    el.appendChild(h('div', { class: 'bench' }, prose, stage));
    const cv = W.canvas(cvWrap, draw, { aspect: NARROW() ? 0.85 : 0.44, label: 'Energy ladder of orderings' });
    let hits = [];
    cv.canvas.addEventListener('pointermove', (e) => {
      const r = cv.canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const hit = hits.find((b) => x >= b.x0 && x <= b.x1 && Math.abs(y - b.y) <= 7) || null;
      if (hit !== hover) { hover = hit; cv.redraw(); info(); }
    });
    cv.canvas.addEventListener('pointerleave', () => { hover = null; cv.redraw(); info(); });

    function data() {
      if (mode === 'ms') return Object.entries(MS).map(([f, rows]) => {
        const mn = Math.min(...rows.map((r) => r[1]));
        return { name: subf(f), rows: rows.map((r, i) => ({ id: f + ' #' + i, cell: r[0], E: r[1], F: r[2], d: (r[1] - mn) * 1000 })) };
      });
      const mn = Math.min(...HEA.map((r) => r[1]));
      return [{ name: 'Fe₁₈Co₅Ni₅Mo₂Pt₂ slab', rows: HEA.map((r) => ({ id: r[0], cell: 32, E: r[2], Ef: r[1], d: (r[1] - mn) * 1000 })) }];
    }
    function info() {
      read.innerHTML = '';
      const D = data();
      if (mode === 'ms') {
        D.forEach((g) => { const s = Math.max(...g.rows.map((r) => r.d)); read.appendChild(h('div', null, h('span', { class: 'k', html: g.name + ' spread' }), h('span', { class: 'v tnum strong' }, (s < 1 ? s.toFixed(2) : s.toFixed(1)) + ' meV/atom'))); });
        read.appendChild(h('div', null, h('span', { class: 'k' }, hover ? hover.r.id.replace(/^\S+/, '') + ' · ' + hover.r.cell + ' atoms' : 'stage log'),
          h('span', { class: 'v tnum' }, hover ? `${minus(hover.r.E.toFixed(6))} eV/at · F ${hover.r.F} eV/Å` : '12 → 2 kept · 145 s')));
        note.innerHTML = 'Ga–Bi: the two 56-atom orderings sit 30 meV/atom below the 28- and 112-atom ones, so ordering matters. Bi–Sb: all within 0.24 meV/atom. These orderings come from farthest-point substitution (job log), relaxed with UMA.';
      } else {
        const r = hover ? hover.r : D[0].rows[0];
        read.append(
          h('div', null, h('span', { class: 'k' }, r.id + ' · E/N'), h('span', { class: 'v tnum' }, minus(r.E.toFixed(4)) + ' eV/atom')),
          h('div', null, h('span', { class: 'k', html: '∑ <i>x<sub>i</sub></i>μ<sub><i>i</i></sub>' }), h('span', { class: 'v tnum' }, '−7.6757 eV/atom')),
          h('div', null, h('span', { class: 'k', html: '<i>E</i><sub>f</sub> (log)' }), h('span', { class: 'v tnum strong' }, r.Ef.toFixed(4) + ' eV/atom')));
        note.innerHTML = 'μ (MACE): Fe −8.3033, Ni −5.4877, Co −6.9916, Mo −10.8225, Pt −6.0601 eV/atom. (18μ<sub>Fe</sub> + 5μ<sub>Co</sub> + 5μ<sub>Ni</sub> + 2μ<sub>Mo</sub> + 2μ<sub>Pt</sub>)/32 = −7.6757. Positive because this is a (001) slab: surface energy is included. 32 atoms, SQS with 5,000,000 iterations, 70 s on 1 GPU.';
      }
    }
    function draw(ctx, w, hh) {
      if (w < 40) return;
      const D = data(), fg = tok(W, '--fg'), mu = tok(W, '--muted'), line = tok(W, '--line'), p = tok(W, '--p'), p2 = tok(W, '--p2'), good = tok(W, '--good');
      const L = 52, R = 14, T = 46, B = 44;
      const zm = mode === 'ms' && zoom, ymax = mode === 'ms' ? (zm ? 0.3 : 35) : 60;
      const Y = (d) => T + (hh - T - B) * (Math.min(d, ymax) / ymax);
      // grid
      ctx.font = font(W, 11, 600); ctx.fillStyle = mu; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      const ticks = mode === 'ms' ? (zm ? [0, 0.1, 0.2, 0.3] : [0, 10, 20, 30]) : [0, 20, 40, 60];
      ticks.forEach((t) => { ctx.strokeStyle = rgba(line, 1); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L, Y(t)); ctx.lineTo(w - R, Y(t)); ctx.stroke(); ctx.fillText(String(t), L - 6, Y(t)); });
      ctx.save(); ctx.translate(12, T + (hh - T - B) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('ΔE above lowest (meV/atom)', 0, 0); ctx.restore();
      const gw = (w - L - R) / D.length; hits = [];
      const cellCol = { 28: mu, 56: p, 112: p2, 32: p };
      D.forEach((g, gi) => {
        const x0 = L + gi * gw + gw * 0.18, x1 = L + (gi + 1) * gw - gw * 0.18;
        ctx.fillStyle = fg; ctx.font = font(W, 13, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(g.name, (x0 + x1) / 2, T - 24);
        const sorted = g.rows.slice().sort((a, b) => a.d - b.d);
        // one sub-column per supercell size (28 / 56 / 112 atoms) so coinciding rungs stay visible
        const cellsIn = [...new Set(g.rows.map((r) => r.cell))].sort((a, b) => a - b), sw = (x1 - x0) / cellsIn.length;
        sorted.forEach((r, i) => {
          const isMin = i === 0, clipped = r.d > ymax, y = Y(r.d);
          const ci = cellsIn.indexOf(r.cell), a0 = x0 + ci * sw + 5, a1 = x0 + (ci + 1) * sw - 5;
          const col = mode === 'ms' ? cellCol[r.cell] : (isMin ? good : p);
          ctx.strokeStyle = col; ctx.lineWidth = hover && hover.r === r ? 6 : 4; ctx.lineCap = 'round';
          ctx.setLineDash(clipped ? [3, 4] : []);
          ctx.beginPath(); ctx.moveTo(a0, y); ctx.lineTo(a1, y); ctx.stroke(); ctx.setLineDash([]);
          if (clipped && i === sorted.length - 1 || (clipped && !sorted.slice(i + 1).some((q) => q.cell === r.cell))) {
            ctx.fillStyle = mu; ctx.font = font(W, 10, 600); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
            ctx.fillText(r.d.toFixed(1) + ' ↓ off scale', (a0 + a1) / 2, y - 5);
          }
          hits.push({ x0: a0, x1: a1, y, r });
          if (mode === 'hea') { ctx.fillStyle = mu; ctx.font = mono(W, 11, 600); ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(`${r.id}  E_f ${r.Ef.toFixed(4)} eV/atom`, a1, y - 5); }
          if (isMin) { ctx.fillStyle = good; ctx.font = font(W, 11, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText('kept (N → 1)', (a0 + a1) / 2, y - 5); }
        });
        if (mode === 'ms') {
          ctx.fillStyle = mu; ctx.font = font(W, 10, 600); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          cellsIn.forEach((c, ci) => ctx.fillText(c + " at.", x0 + (ci + 0.5) * sw, hh - B + 6));
        }
        // spread bracket
        const mx = Math.max(...g.rows.map((r) => r.d));
        ctx.strokeStyle = fg; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x1 + 4, Y(0)); ctx.lineTo(x1 + 10, Y(0)); ctx.lineTo(x1 + 10, Y(mx)); ctx.lineTo(x1 + 4, Y(mx)); ctx.stroke();
        ctx.fillStyle = fg; ctx.font = font(W, 12, 700); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        const lab = (mx < 1 ? mx.toFixed(2) : mx.toFixed(1)) + (mx > ymax ? ' (off scale)' : '');
        const vert = Y(mx) - Y(0) >= 30, lw = ctx.measureText(lab).width;
        ctx.save(); ctx.translate(vert ? x1 + 22 : Math.min(x1 + 16, w - lw - 2), (Y(0) + Y(mx)) / 2 + (vert ? 0 : 16)); if (vert) { ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; } ctx.fillText(lab, 0, 0); ctx.restore();
        // kept marker
      });
      // legend
      ctx.font = font(W, 11, 600); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      let lx = L; const ly = hh - 10;
      const items = mode === 'ms' ? [['28-atom cell', mu], ['56', p], ['112', p2]] : [['lowest', good], ['other SQS candidates', p]];
      items.forEach(([t, c]) => { ctx.strokeStyle = c; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 16, ly); ctx.stroke(); ctx.fillStyle = mu; ctx.fillText(t, lx + 22, ly); lx += 30 + ctx.measureText(t).width; });
      ctx.fillStyle = mu; ctx.textAlign = 'right'; ctx.fillText('hover a rung', w - R, ly);
    }
    upd();
    function upd() { cv.redraw(); info(); }
  }

  /* =====================================================================
   * Chapter 6: VibroML ↔ ProtoCSP loop (clickable), with the paper figures
   * ===================================================================== */
  const LOOP = {
    cs2: { label: 'Cs₂KInI₆', nodes: [
      { who: 'v', t: 'Unstable 3D base', s: 'Cs₂KInI₆ Fm-3m', d: 'Gap 1.24 eV, but f<sub>soft</sub> = <b>31.5%</b>, ω<sub>min</sub> = −0.75 THz. Goldschmidt <i>t</i> ≈ 0.877 looks fine; the octahedral factor μ = <i>r</i><sub>In</sub>/<i>r</i><sub>I</sub> ≈ <b>0.364</b> is below 0.414: In³⁺ is too small for the I⁻ cage.', fig: 'heat' },
      { who: 'v', t: 'Map polymorphs', s: 'VibroML GA', d: 'The VibroML GA finds <b>42</b> lower-symmetry phases. The most stable (I-42m, Cmc2₁) are non-perovskite, with tetrahedral In.', fig: 'heat' },
      { who: 'v', t: 'Frustration', s: '3D network collapses', d: 'The functional 3D framework is geometrically frustrated. Instead of dropping it, nudge the chemistry: smaller Na⁺ on the K site, smaller Br⁻ on the I site.', fig: 'heat' },
      { who: 'p', t: 'Alloy every polymorph', s: 'ProtoCSP', d: 'Grid x = 0 … 0.4 (Na), y = 0 … 2/3 (Br), 5 × 5 points in the run script, on Fm-3m and the 7 competing polymorphs. <code>--symmetrize --top-k 20</code> orderings, MLIP relaxation, formation energies, lowest ordering kept.', fig: 'contour' },
      { who: 'v', t: 'Phonons again', s: 'across the grid', d: 'Br alone is not enough (ω<sub>min</sub> −0.31 to −0.80 THz). Na does it: at <b>x = 0.1, any y</b>, ω<sub>min</sub> &gt; −0.11 THz; plateau near x = 0.2.', fig: 'heat' },
      { who: 'p', t: 'Energetics', s: 'phase diagram', d: 'Fm-3m vs the lowest of 7 polymorphs: <b>+36.6</b> meV/atom at x = y = 0, down to <b>−2.3</b> near x = 0.1, y = 0.5. Fm-3m “canyon” at x ≈ 0.1, y ≥ 0.5. The margin is below MLIP error: a window, not a ground state.', fig: 'phase' },
      { who: 'v', t: 'Candidate', s: 'Cs₂K₀.₉Na₀.₁InI₃Br₃', d: 'f<sub>soft</sub> 0.03%, ω<sub>min</sub> −0.0001 THz. 10 ps NPT MD at 300 K: RMSD 0.586 Å, volume fluctuation 2.6%. Next: DFT validation.', fig: 'cand' }] },
    kts: { label: 'KTaSe₃', nodes: [
      { who: 'v', t: 'Unstable 3D base', s: 'KTaSe₃ (MEIDNet)', d: 'A chalcogenide perovskite predicted with MEIDNet (Babu et al.). f<sub>soft</sub> 16.0%, ω<sub>min</sub> −2.32 THz; μ ≈ 0.323.', fig: 'kt' },
      { who: 'v', t: 'Map polymorphs', s: 'VibroML', d: '1D chain phases win: the 3D perovskite is <b>+188.3</b> meV/atom above the lowest 1D polymorph.', fig: 'kt' },
      { who: 'v', t: 'Frustration', s: '3D → 1D', d: 'Collapse into chains. Alloy: (K<sub>1−x</sub>Ba<sub>x</sub>)(Ta<sub>1−x</sub>Zr<sub>x</sub>)(Se<sub>1−y</sub>O<sub>y</sub>)₃.', fig: 'kt' },
      { who: 'p', t: 'Alloy every polymorph', s: 'ProtoCSP', d: 'Ordered superstructures over the x, y grid on the 3D, 2D and 1D bases; MLIP relaxation; lowest ordering per pair.', fig: 'kt' },
      { who: 'v', t: 'Phonons again', s: 'across the grid', d: 'O alone deepens the instability (−2.93 THz). x = 0.1–0.3 resolves the soft modes for all y; x = 0.4 brings them back (−2.89 THz).', fig: 'kt' },
      { who: 'p', t: 'Energetics', s: '2D beats 1D', d: '3D vs 1D: +188.3 → +9.2 meV/atom, so the 3D network is <b>not</b> recovered. 2D vs 1D: +54.9 → <b>−13.3</b> meV/atom: layered P-1 / R-3 phases win at x ≥ 0.3, y = 0.3.', fig: 'kt' },
      { who: 'v', t: 'Candidate', s: 'K₀.₆Ba₀.₄Ta₀.₆Zr₀.₄Se₂.₁O₀.₉', d: '2D layered phase at x = 0.4, y = 0.3. f<sub>soft</sub> 0.2%, ω<sub>min</sub> −0.0009 THz; MD RMSD 0.236 Å, volume 1.6%. With tighter forces (10⁻⁴ eV/Å) a 0.5% soft band at −0.63 THz remains: a candidate for first-principles validation.', fig: 'ktc' }] },
    cold: { label: 'Cold start', nodes: [
      { who: 'v', t: 'White space', s: '1,990 elpasolite gaps', d: 'Unmapped 4-element compositions (no Alexandria entry) with one alkali, two metals and one halogen. 200 sampled (seed 42). Analysis from the VibroML paper.', fig: 'table' },
      { who: 'p', t: 'Two starts each', s: '400 structures', d: 'Forced cubic K₂NaAlF₆ template vs ProtoCSP LeMat retrieval + χ transmutation.', fig: 'table' },
      { who: 'v', t: 'Phonons', s: 'VibroML screen', d: 'Cubic starts: f<sub>soft</sub> up to 40%. ProtoCSP starts: mostly lower-symmetry prototypes, several below 0.6% out of the box (Na₂BiNbI₆, Na₂CoCrBr₆ pass without remediation).', fig: 'table' },
      { who: 'v', t: 'GA remediation', s: 'where needed', d: '98% of 254 GA-completed runs reach f<sub>soft</sub> &lt; 2% (both starts). Median ΔE −272 (cubic) vs −182 meV/atom (retrieved): the cubic starts were more frustrated.', fig: 'table' }] },
  };
  const FIGS = {
    heat: ['cs2_heatmaps.jpg', 'f<sub>soft</sub> (left) and softest mode (right) of the Fm-3m phase over x (Na) and y (Br). VibroML paper, revised.'],
    contour: ['cs2_contour.jpg', 'ΔE = E(Fm-3m) − min over 7 polymorphs. Dashed: ΔE = 0. Max +36.6, min −2.3 meV/atom. Dots: sampled grid.'],
    phase: ['cs2_phase.jpg', 'Lowest-energy phase at each (x, y) from ProtoCSP orderings + MLIP. Legend offsets as printed on the figure.'],
    cand: ['cs2_candidate.jpg', 'Cs₂K₀.₉Na₀.₁InI₃Br₃: no imaginary branch.'],
    kt: ['ktase3_2d1d.jpg', 'KTaSe₃ alloys: min(2D) − min(1D). Dashed: ΔE = 0; min −13.3 meV/atom.'],
    ktc: ['ktase3_candidate.jpg', 'K₀.₆Ba₀.₄Ta₀.₆Zr₀.₄Se₂.₁O₀.₉: phonons and structure.'],
  };
  function chLoop(el, W) {
    const h = W.h;
    let cs = 'cs2', idx = 3;
    const seg = W.ui.seg(Object.entries(LOOP).map(([k, v]) => ({ value: k, label: v.label })), cs, (v) => { cs = v; idx = v === 'cold' ? 1 : 3; render(); }, 'Case');
    const svgWrap = h('div', { class: 'pc-loop' }), det = h('div', { class: 'pc-loop-det' });
    const left = W.ui.stage('VibroML ↔ ProtoCSP · click a step', seg.el, svgWrap, det);
    const figBox = h('div', { class: 'pc-figbox' });
    el.appendChild(h('div', { class: 'bench even' }, left, figBox));

    function render() {
      const nodes = LOOP[cs].nodes, n = nodes.length;
      // C-shaped track: top row left → right, down the right side, bottom row right → left
      const Wd = 600, Ht = 300, cx = Wd / 2, cy = Ht / 2, bw = 170, bh = 48;
      const pos = n === 7 ? [[100, 40], [300, 40], [500, 40], [500, 150], [500, 260], [300, 260], [100, 260]]
        : [[130, 50], [470, 50], [470, 250], [130, 250]];
      const svg = h('svg', { class: 'pc-loop-svg', viewBox: `0 0 ${Wd} ${Ht}`, role: 'img', 'aria-label': 'Loop between VibroML and ProtoCSP' });
      svg.appendChild(h('defs', null, h('marker', { id: 'pcArr', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, h('path', { d: 'M0,0 L10,5 L0,10 z', class: 'pc-ah' }))));
      const cut = (xa, ya, xb, yb) => { const dx = xb - xa, dy = yb - ya, t = Math.min((bw / 2 + 3) / Math.abs(dx || 1e-6), (bh / 2 + 3) / Math.abs(dy || 1e-6)); return [xa + dx * t, ya + dy * t]; };
      for (let i = 0; i < n - 1; i++) {
        const [x0, y0] = pos[i], [x1, y1] = pos[i + 1], [sx, sy] = cut(x0, y0, x1, y1), [ex, ey] = cut(x1, y1, x0, y0);
        const back = nodes[i].who === 'p' && nodes[i + 1].who === 'v';
        svg.appendChild(h('path', { d: `M${sx},${sy} L${ex},${ey}`, class: 'pc-edge' + (back ? ' back' : ''), 'marker-end': 'url(#pcArr)' }));
      }
      if (cs !== 'cold') {
        svg.appendChild(h('text', { x: 490, y: 203, class: 'pc-center', 'text-anchor': 'end' }, 'alloyed candidates'));
        svg.appendChild(h('text', { x: 490, y: 220, class: 'pc-center', 'text-anchor': 'end' }, 're-enter phonon screening'));
      } else {
        svg.appendChild(h('text', { x: cx, y: cy + 4, class: 'pc-center', 'text-anchor': 'middle' }, 'second entry point: no structure yet'));
      }
      nodes.forEach((nd, i) => {
        const [x, y] = pos[i];
        const g = h('g', { class: 'pc-node ' + (nd.who === 'p' ? 'pp' : 'vv') + (i === idx ? ' on' : ''), tabindex: '0', role: 'button', 'aria-label': nd.t });
        g.appendChild(h('rect', { x: x - bw / 2, y: y - bh / 2, width: bw, height: bh, rx: 9 }));
        g.appendChild(h('text', { x, y: y - 4, 'text-anchor': 'middle', class: 't' }, (i + 1) + '  ' + nd.t));
        g.appendChild(h('text', { x, y: y + 13, 'text-anchor': 'middle', class: 's' }, nd.s));
        g.addEventListener('click', () => { idx = i; render(); });
        g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); idx = i; render(); } });
        svg.appendChild(g);
      });
      svgWrap.innerHTML = ''; svgWrap.appendChild(svg);
      svgWrap.appendChild(h('div', { class: 'pc-legend' }, h('span', { class: 'sw vv' }), h('span', null, 'VibroML'), h('span', { class: 'sw pp' }), h('span', null, 'ProtoCSP')));
      const nd = nodes[idx];
      det.innerHTML = '';
      det.append(h('h3', null, (idx + 1) + ' · ' + nd.t), h('p', { html: nd.d }));
      figBox.innerHTML = '';
      if (nd.fig === 'table') {
        figBox.appendChild(W.ui.stage('Elpasolite white space · soft-mode fraction, init → final (%)',
          W.ui.table(['Composition', 'Cubic start', 'ProtoCSP start'], [
            ['Cs₂GaNbF₆', '0.02 → 0.02', '0.20 → 0.20'], ['K₂BiSbF₆', '40.02 → 1.05', '1.33 → 1.02'], ['K₂ZnFeI₆', '14.48 → 0.20', '0.38 → 0.38'],
            ['Li₂CdFeBr₆', '38.54 → 0.47', '0.20 → 0.20'], ['Li₂CoZnI₆', '38.81 → 0.07', '0.53 → 0.53'], ['Li₂CuCrCl₆', '32.98 → 0.47', '3.37 → 0.50'],
            ['Li₂PdZnCl₆', '35.97 → 0.90', '1.40 → 0.87'], ['Na₂BiNbI₆', '39.88 → 0.32', '0.13 → 0.13'], ['Na₂CoCrBr₆', '31.03 → 0.20', '0.05 → 0.05'],
            ['Na₂CrFeCl₆', '29.79 → 0.20', '0.50 → 0.13']], [1, 2]),
          h('p', { class: 'hint', html: 'Representative rows of the SI table (f<sub>soft</sub> in %; equal values = no GA needed). Screening cutoff: 2%.' })));
      } else {
        const [src, cap] = FIGS[nd.fig];
        figBox.appendChild(h('figure', { class: 'fig pc-fig' }, h('a', { href: FIG + src, target: '_blank', rel: 'noopener', title: 'Open full size' }, h('img', { src: FIG + src, alt: cap.replace(/<[^>]+>/g, '') })), h('figcaption', { html: cap })));
      }
    }
    render();
  }

  /* =====================================================================
   * Chapter 7: run it: terminal replay of real runs, flags, status
   * ===================================================================== */
  const RUNS = {
    cold: { label: 'Cold start · SrTiO3', cmd: 'python main.py SrTiO3 --top-k 10 --save-cif',
      note: 'Command from the README. Output: older test-suite run of the same target (top 3).',
      out: ['[DEBUG] Starting guess for SrTiO3 (Anon: ABC3)', '[DEBUG] Loaded 287563 entries for ABC3 in 9.3241s', '[DEBUG] Exact string match failed. Trying robust chemical comparison...',
        '[DEBUG] Strategy 0: Found 28 exact matches.', '[DEBUG] Finalizing 6 candidates...', '[SUCCESS] 3 candidates (22.04s)',
        '  [1] SrTiO3  Source: oqmd-9181828  Energy: -7.944 eV/atom  Volume: 120.2 A^3  SpaceG: R-3',
        '  [2] SrTiO3  Source: oqmd-2612191  Energy: -7.944 eV/atom  Volume: 120.0 A^3  SpaceG: R-3c',
        '  [3] SrTiO3  Source: oqmd-2005719  Energy: -7.944 eV/atom  Volume: 240.3 A^3  SpaceG: Pnma'] },
    hea: { label: 'HEA slab · SQS + MACE', cmd: 'python main.py Fe0.6Ni0.15Co0.15Mo0.05Pt0.05 --base-cif fe_bcc_001_surface.cif \\\n  --top-k 3 --save-cif --sqs --sqs-iterations 5000000 --mlip --engine mace --verbose',
      note: 'log_test_protocsp.txt, 2 Apr 2026, 1 GPU (excerpt; repeated and noise lines removed). Base: 32-atom bcc Fe (001) slab, 15 Å vacuum.',
      out: ['[INFO] ProtoCSP initialized in Parquet Lazy-Scan mode: lemat_parquet_files/unique_pbe/*.parquet', '[DEBUG] Strategy: Bypassing database to use manual base structure...',
        '[DEBUG] Doping: Mapping Target Major [Element Fe] -> Base Sites [Element Fe]', '[DEBUG] Doping: Scaling base [1, 1, 1] to approx 20 atoms.',
        '[DEBUG] Doping: Element Ni is SUBSTITUTIONAL. Target: Fe (closest electronegativity).', '[DEBUG] Doping: Applying SQS generation (5,000,000 iterations)...',
        '# ... 9 SQS attempts (32- or 128-atom cells), 3 structures each ...', '[DEBUG] Successfully generated 27 structures from manual base.', 'GENERATION COMPLETE (3 candidates in 40.37s)', '[INFO] Initializing MACE MLIP calculator...',
        '  [INFO] Reference energy (μ) for Fe: -8.3033 eV/atom', '  [INFO] Reference energy (μ) for Ni: -5.4877 eV/atom', '  [INFO] Reference energy (μ) for Co: -6.9916 eV/atom',
        '  [INFO] Reference energy (μ) for Mo: -10.8225 eV/atom', '  [INFO] Reference energy (μ) for Pt: -6.0601 eV/atom',
        '  [MACE] Candidate 1 E_form: 0.2171 eV/atom (E_tot: -7.4586)', '  [MACE] Candidate 2 E_form: 0.2597 eV/atom (E_tot: -7.4159)', '  [MACE] Candidate 3 E_form: 0.2072 eV/atom (E_tot: -7.4684)',
        '[INFO] MLIP Evaluation finished in 25.08s', '[1] Formula: Fe18Co5Ni5(MoPt)2   Source ID: doped_from_provided_fe_bcc_001_surface_sqs_3',
        '    Initial Space Group (Parent): P4/nmm   Formation Energy: 0.2072 eV/atom   Space Group: P1', '[SUCCESS] 3 candidates evaluated with MLIP (69.93s)'] },
    fast: { label: 'Fast mode · JSON', cmd: 'python main.py example_perovskite_sites.json --fast --output-dir ./output\npython protocsp/tensor_generator.py convert output/tensor_data.npz \\\n  --output-dir ./cif --metadata output/tensor_metadata.json --max-structures 10',
      note: 'No logged run exists: outputs as documented, counts from replaying the parser (chapter 4).',
      out: ['# output/tensor_data.npz', '#   atomic_numbers  [180, 320]     36 compositions x 5 samples', '#   positions       [180, 320, 3]  frozen geometry, broadcast', '#   cell            [180, 3, 3]',
        '# output/tensor_metadata.json', '# ./cif/  first 10 structures as CIF (dummies Fr/At/Po -> NH4/CN/SCN with --polyatomic)'] },
  };
  function chRun(el, W) {
    const h = W.h;
    let cur = 'hea', stopT = null;
    const seg = W.ui.seg(Object.entries(RUNS).map(([k, v]) => ({ value: k, label: v.label })), cur, (v) => { cur = v; show(false); }, 'Run');
    const term = h('pre', { class: 'pc-term', 'aria-live': 'polite' }), noteP = h('p', { class: 'hint' });
    const replay = h('button', { class: 'btn ghost', type: 'button', onclick: () => show(true) }, 'Replay');
    const stage = W.ui.stage('Terminal · real commands and logs', h('div', { class: 'ctrl-row' }, seg.el, replay), term, noteP);
    const flagsEl = h('div', { class: 'pc-flags' },
        [['--base-cif', 'use your own base (a VibroML polymorph)'], ['--symmetrize', 'enumlib orderings, ranked top-k, capped'], ['--sqs', 'special quasirandom structures'],
          ['--mlip --engine', 'mace · esen · uma · m3gnet · gpumd / nep'], ['--fast', 'JSON config → batched tensors'], ['--top-k', 'candidates kept (default 5)']]
          .map(([f, d]) => h('div', { class: 'pc-flag' }, h('code', null, f), h('span', null, d))));
    const prose = h('div', { class: 'prose' },
      W.ui.code('git clone https://github.com/rogeriog/ProtoCSP.git\ncd ProtoCSP && pip install -r requirements.txt\npip install mace-torch            # or fairchem, m3gnet\ncd lemat_database_scripts/ && python lemat_parquet_download.py', 'bash'),
      h('ul', null,
        h('li', { html: '<b>Status</b>: open source (MIT), by R. A. Gouvêa and G.-M. Rignanese. No standalone paper: it is presented in the <b>VibroML paper</b> (under revision, Nat. Commun.).' }),
        h('li', { html: '<b>Plugs into</b>: VibroML (alloying rescue, cold start) and downstream MLIP relaxation + DFT validation.' }),
        h('li', { html: '<b>Limits</b>: fast mode makes random shuffles, not symmetry-distinct orderings, and has no batched MLIP yet. A missing elemental reference falls back to μ = 0. Several energy margins are within MLIP error and need DFT.' })),
      flagsEl,
      h('p', { class: 'pc-links', html: 'Code: <a href="https://github.com/rogeriog/ProtoCSP" target="_blank" rel="noopener">github.com/rogeriog/ProtoCSP</a> · in this garden: <a href="/garden/vibroml/">VibroML</a>, <a href="/garden/vibroml/">VibroML GA remediation</a>' }));
    el.appendChild(h('div', { class: 'bench' }, prose, stage));

    function show(anim) {
      if (stopT) { clearInterval(stopT); stopT = null; }
      const R = RUNS[cur];
      noteP.textContent = R.note;
      const lines = R.out;
      const paint = (n) => {
        term.innerHTML = '';
        term.appendChild(h('span', { class: 'cmd' }, '$ ' + R.cmd + '\n'));
        lines.slice(0, n).forEach((l) => term.appendChild(h('span', { class: l.startsWith('#') ? 'c' : /SUCCESS|COMPLETE|E_form|Formation/.test(l) ? 'ok' : '' }, l + '\n')));
      };
      if (!anim || W.reduceMotion) { paint(lines.length); return; }
      let n = 0; paint(0);
      stopT = W.interval(() => { n++; paint(n); if (n >= lines.length) { clearInterval(stopT); stopT = null; } }, 180);
    }
    show(false);
  }

  WELT.register({
    id: 'protocsp', order: 5, name: 'ProtoCSP',
    logo: 'assets/logos/protocsp.png', logoDark: false,
    tagline: 'From a prototype and a target composition to ranked, ordered crystal structures that a machine-learned potential can relax.',
    status: [
      { label: 'In revision · within the VibroML paper (Nat. Commun.)', tone: 'warn' },
      { label: 'Open source · MIT', tone: 'good' },
      { label: 'GitHub', tone: 'plain', href: 'https://github.com/rogeriog/ProtoCSP' },
    ],
    chapters: [
      { id: 'problem', title: 'One formula, many crystals', kicker: 'The problem',
        lede: 'Screening gives formulas. MLIPs and DFT need atoms in a cell, and an alloy has many possible orderings.', render: chEnum },
      { id: 'coldstart', title: 'Borrow a prototype', kicker: 'Cold start · LeMat-Bulk',
        lede: 'No known structure? Find one with the same anonymous stoichiometry and swap the elements in by electronegativity.', render: chLookup },
      { id: 'decorate', title: 'Decorate the supercell', kicker: 'Alloys and orderings',
        lede: 'Make the smallest supercell that fits the fractions, then decide where the minority atoms go.', render: chDecorate },
      { id: 'json', title: 'One JSON, many configs', kicker: 'Fast tensor mode',
        lede: 'For a fixed topology, freeze the geometry once and generate batched arrays of atomic numbers.', render: chJson },
      { id: 'rank', title: 'Relax and rank', kicker: 'MLIP evaluation',
        lede: 'Relax every ordering with a universal MLIP, compute formation energies, keep the lowest.', render: chRank },
      { id: 'rescue', title: 'Rescue by alloying', kicker: 'With VibroML',
        lede: 'When a wanted framework collapses, alloy it across all competing polymorphs and track which one wins.', render: chLoop },
      { id: 'run', title: 'Run it', kicker: 'How to use · status',
        lede: 'One CLI, a LeMat download, and an optional MLIP engine.', render: chRun },
    ],
  });
})();
