/* WELT core: registry, router, keyboard presenter controls, shared UI helpers.
 * Sections are classic scripts that call WELT.register({...}). No ES modules, no fetch():
 * the page must work from file:// and as a single bundled HTML. */
(function () {
  'use strict';
  const W = (window.WELT = {});
  const defs = {};       // id -> project definition
  let hubDef = null;
  let current = { id: null, ch: 0, cleanups: [] };
  const app = () => document.getElementById('app');
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  W.reduceMotion = reduceMotion;

  /* ---------------- DOM helper ----------------
   * h('div', {class:'x', onclick: fn, style:{...}, html:'<b>raw</b>'}, child, 'text', [more]) */
  function h(tag, attrs, ...kids) {
    const svgTags = /^(svg|g|path|circle|line|rect|text|polyline|polygon|ellipse|defs|marker|tspan|linearGradient|radialGradient|stop|clipPath|title)$/;
    const el = svgTags.test(tag) ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.setAttribute('class', v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    const add = (c) => {
      if (c == null || c === false) return;
      if (Array.isArray(c)) return c.forEach(add);
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    };
    kids.forEach(add);
    return el;
  }
  W.h = h;

  /* Read a CSS custom property as resolved on an element (theme + project aware). */
  W.css = function (name, el) {
    return getComputedStyle(el || document.querySelector('.proj') || document.documentElement).getPropertyValue(name).trim();
  };
  W.isDark = function () {
    const t = document.documentElement.getAttribute('data-theme');
    if (t) return t === 'dark';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  };

  /* ---------------- UI helpers ---------------- */
  const ui = (W.ui = {});

  // Minimal Python/YAML/bash highlighter. Returns <pre class="code">.
  ui.code = function (text, lang) {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let src = esc(text.replace(/^\n+|\s+$/g, ''));
    const tokens = [];
    // placeholders use private-use chars so later regexes (\d, \w) never match inside them
    const stash = (cls) => (m) => { tokens.push(`<span class="${cls}">${m}</span>`); return String.fromCharCode(0xE000, 0xE100 + tokens.length - 1); };
    if (lang === 'yaml') {
      src = src.replace(/#[^\n]*/g, stash('c')).replace(/("[^"\n]*"|'[^'\n]*')/g, stash('s'))
        .replace(/^(\s*-?\s*)([A-Za-z_][\w.-]*)(:)/gm, (m, a, b, c) => a + stash('f')(b) + c)
        .replace(/\b(-?\d+(?:\.\d+)?(?:e-?\d+)?)\b/g, stash('n'));
    } else if (lang === 'bash') {
      src = src.replace(/#[^\n]*/g, stash('c')).replace(/("[^"\n]*"|'[^'\n]*')/g, stash('s'))
        .replace(/(^|\s)(--?[\w-]+)/g, (m, a, b) => a + stash('n')(b))
        .replace(/^(\$?\s*)(\w[\w-]*)/gm, (m, a, b) => a + stash('f')(b));
    } else {
      src = src.replace(/#[^\n]*/g, stash('c'))
        .replace(/("""[\s\S]*?"""|f?"[^"\n]*"|f?'[^'\n]*')/g, stash('s'))
        .replace(/\b(from|import|as|def|class|return|for|in|if|else|elif|with|None|True|False|lambda|and|or|not|print)\b/g, stash('k'))
        .replace(/\b(\d+(?:\.\d+)?(?:e-?\d+)?)\b/g, stash('n'))
        .replace(/\b([A-Za-z_]\w*)(?=\()/g, stash('f'));
    }
    for (let pass = 0; pass < 3; pass++) src = src.replace(/([-])/g, (m, c) => tokens[c.charCodeAt(0) - 0xE100]);
    const pre = h('pre', { class: 'code' });
    pre.innerHTML = src;
    return pre;
  };

  // Range slider row. Returns {el, input, set(v), get()}
  let sid = 0;
  ui.slider = function ({ label, min = 0, max = 1, step = 0.01, value = 0, fmt = (v) => v, onInput, id }) {
    const iid = id || 'sl-' + ++sid;
    const out = h('output', { for: iid });
    const input = h('input', { type: 'range', id: iid, min, max, step, value });
    const lab = h('label', { for: iid }, label);
    const row = h('div', { class: 'slider' }, lab, input, out);
    const upd = () => { out.textContent = fmt(+input.value); onInput && onInput(+input.value); };
    input.addEventListener('input', upd);
    out.textContent = fmt(+value);
    return { el: row, input, get: () => +input.value, set: (v) => { input.value = v; upd(); } };
  };

  // Segmented control. options: [{value,label}] or strings. Returns {el, set(v), get()}
  ui.seg = function (options, value, onChange, ariaLabel) {
    const opts = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
    let cur = value ?? opts[0].value;
    const el = h('div', { class: 'seg', role: 'group', 'aria-label': ariaLabel || 'Options' });
    const btns = opts.map((o) => {
      const b = h('button', { type: 'button', 'aria-pressed': String(o.value === cur), onclick: () => set(o.value, true) }, o.label);
      el.appendChild(b);
      return b;
    });
    function set(v, fire) {
      cur = v;
      btns.forEach((b, i) => b.setAttribute('aria-pressed', String(opts[i].value === v)));
      if (fire && onChange) onChange(v);
    }
    return { el, set: (v) => set(v, true), get: () => cur };
  };

  ui.fig = function (src, caption, alt) {
    return h('figure', { class: 'fig' }, h('img', { src, alt: alt || caption || '', loading: 'lazy' }), caption ? h('figcaption', { html: caption }) : null);
  };
  ui.stats = function (items) { // [{v:'38%', k:'error reduction'}]
    return h('div', { class: 'stats' }, items.map((s) => h('div', { class: 'stat' }, h('div', { class: 'v', html: s.v }), h('div', { class: 'k', html: s.k }))));
  };
  ui.callout = function (html) { return h('div', { class: 'callout', html }); };
  ui.stage = function (title, ...kids) {
    return h('div', { class: 'stage' }, title ? h('div', { class: 'stage-title' }, title) : null, ...kids);
  };
  ui.table = function (headers, rows, numericCols = []) {
    return h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, headers.map((x, i) => h('th', { class: numericCols.includes(i) ? 'num' : null, html: x })))),
      h('tbody', null, rows.map((r) => h('tr', null, r.map((c, i) => h('td', { class: numericCols.includes(i) ? 'num' : null, html: String(c) })))))));
  };

  /* HiDPI canvas that tracks its CSS width. draw(ctx2d, w, h) is called on resize/theme change.
   * Returns {canvas, ctx, redraw(), w(), h()}. aspect = height/width (or fixed px height via opts.height). */
  W.canvas = function (parent, draw, opts = {}) {
    const canvas = h('canvas', { role: 'img', 'aria-label': opts.label || 'interactive figure' });
    parent.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    let cw = 0, ch = 0;
    function size() {
      const w = Math.max(50, canvas.parentElement ? canvas.parentElement.clientWidth : 300);
      const hh = opts.height ? opts.height : Math.round(w * (opts.aspect || 0.62));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cw = w; ch = hh;
      canvas.style.height = hh + 'px';
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(hh * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      redraw();
    }
    function redraw() { ctx.clearRect(0, 0, cw, ch); draw(ctx, cw, ch); }
    const ro = new ResizeObserver(() => size());
    requestAnimationFrame(() => { size(); ro.observe(canvas.parentElement || canvas); });
    W.onCleanup(() => ro.disconnect());
    W.onTheme(redraw);
    return { canvas, ctx, redraw, w: () => cw, h: () => ch };
  };

  /* Animation loop bound to the active chapter; stops automatically on navigation. */
  W.raf = function (fn) {
    let alive = true, last = performance.now();
    function tick(t) { if (!alive) return; const dt = Math.min(0.05, (t - last) / 1000); last = t; fn(dt, t / 1000); requestAnimationFrame(tick); }
    requestAnimationFrame(tick);
    const stop = () => { alive = false; };
    W.onCleanup(stop);
    return stop;
  };
  W.onCleanup = function (fn) { current.cleanups.push(fn); };
  W.interval = function (fn, ms) { const t = setInterval(fn, ms); W.onCleanup(() => clearInterval(t)); return t; };
  W.timeout = function (fn, ms) { const t = setTimeout(fn, ms); W.onCleanup(() => clearTimeout(t)); return t; };
  const themeSubs = new Set();
  W.onTheme = function (fn) { themeSubs.add(fn); W.onCleanup(() => themeSubs.delete(fn)); };
  function fireTheme() { requestAnimationFrame(() => themeSubs.forEach((f) => { try { f(); } catch (e) { console.error(e); } })); }

  /* Seeded RNG for reproducible demos. */
  W.rng = function (seed = 1) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

  /* ---------------- registry ---------------- */
  /* def = {
   *   id, order, name, logo, logoDark?(bool: logo has black ground), tagline, status:[{label, tone:'good'|'warn'|'plain', href?}],
   *   chapters: [{ id, title, kicker?, lede?, render(el, api) }]
   * } — render() fills `el`; use W.raf / W.onCleanup for anything that must stop on leave. */
  W.register = function (def) {
    if (def.id === 'hub') { hubDef = def; return; }
    defs[def.id] = def;
  };
  W.projects = () => Object.values(defs).sort((a, b) => (a.order || 0) - (b.order || 0));

  function runCleanups() { const c = current.cleanups; current.cleanups = []; c.forEach((f) => { try { f(); } catch (e) { console.error(e); } }); }

  function renderNav() {
    const nav = document.getElementById('proj-nav');
    nav.innerHTML = '';
    W.projects().forEach((p, i) => {
      nav.appendChild(h('a', { class: 'proj-tab', href: '#' + p.id, 'data-go': p.id, 'aria-current': current.id === p.id ? 'page' : null, title: `${p.name} (${i + 1})` },
        h('span', { class: 'num' }, String(i + 1)), h('img', { src: p.logo, alt: '' }), h('span', { class: 'label' }, p.name)));
    });
  }

  function renderHub() {
    runCleanups();
    current = { id: 'hub', ch: 0, cleanups: [] };
    const root = app(); root.innerHTML = '';
    const el = h('div', { class: 'hub' });
    root.appendChild(el);
    if (hubDef) try { hubDef.render(el, W); } catch (e) { console.error(e); el.appendChild(h('p', { class: 'wrap' }, 'Overview failed to load: ' + e.message)); }
    renderNav();
    window.scrollTo(0, 0);
  }

  function renderProject(id, chIdx) {
    const p = defs[id];
    if (!p) return renderHub();
    const sameProj = current.id === id;
    runCleanups();
    chIdx = Math.max(0, Math.min(p.chapters.length - 1, chIdx || 0));
    current = { id, ch: chIdx, cleanups: [] };
    const root = app();
    let page = root.querySelector('.proj');
    if (!sameProj || !page) {
      root.innerHTML = '';
      page = h('div', { class: 'proj', 'data-id': id });
      const hero = h('section', { class: 'proj-hero' }, h('div', { class: 'wrap' },
        h('img', { class: 'proj-logo' + (p.logoDark ? ' dark-ground' : ''), src: p.logo, alt: p.name + ' logo' }),
        h('div', { style: { minWidth: 0 } }, h('h1', null, p.name), h('p', { class: 'tagline', html: p.tagline })),
        h('div', { class: 'proj-meta' }, (p.status || []).map((s) => s.href
          ? h('a', { class: 'pill ' + (s.tone || ''), href: s.href, target: '_blank', rel: 'noopener' }, s.label)
          : h('span', { class: 'pill ' + (s.tone || '') }, s.label)))));
      const rail = h('nav', { class: 'rail', 'aria-label': p.name + ' chapters' }, h('div', { class: 'wrap', role: 'tablist' },
        p.chapters.map((c, i) => h('button', { class: 'ch-tab', role: 'tab', type: 'button', 'data-ch': i, onclick: () => go(id, i) },
          h('span', { class: 'n' }, String(i + 1).padStart(2, '0')), h('span', null, c.title)))));
      page.appendChild(hero); page.appendChild(rail);
      page.appendChild(h('section', { class: 'chapter' }, h('div', { class: 'wrap', id: 'ch-body' })));
      root.appendChild(page);
    }
    page.querySelectorAll('.ch-tab').forEach((b, i) => b.setAttribute('aria-selected', String(i === chIdx)));
    const tab = page.querySelector(`.ch-tab[data-ch="${chIdx}"]`);
    if (tab) tab.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
    const body = page.querySelector('#ch-body');
    body.innerHTML = '';
    const c = p.chapters[chIdx];
    body.appendChild(h('header', { class: 'ch-head' },
      h('div', { class: 'ch-kicker' }, c.kicker || `${p.name} · ${chIdx + 1} / ${p.chapters.length}`),
      h('h2', { html: c.title }), c.lede ? h('p', { class: 'lede', html: c.lede }) : null));
    const host = h('div', { class: 'ch-content' });
    body.appendChild(host);
    try { c.render(host, W); } catch (e) { console.error(e); host.appendChild(h('p', { class: 'callout' }, 'This chapter failed to render: ' + e.message)); }
    const prev = chIdx > 0 ? () => go(id, chIdx - 1) : null;
    const next = chIdx < p.chapters.length - 1 ? () => go(id, chIdx + 1) : null;
    body.appendChild(h('div', { class: 'ch-foot' },
      h('button', { class: 'btn ghost', type: 'button', disabled: !prev, onclick: prev }, '← ' + (prev ? p.chapters[chIdx - 1].title : 'Start')),
      h('button', { class: 'btn', type: 'button', onclick: next || (() => nextProject(1)) }, (next ? p.chapters[chIdx + 1].title : 'Next project') + ' →')));
    renderNav();
    if (!sameProj) window.scrollTo(0, 0);
    else { const rail = page.querySelector('.rail'); if (rail && window.scrollY > rail.offsetTop) window.scrollTo(0, page.querySelector('.proj-hero').offsetHeight); }
  }

  function go(id, ch) {
    const hash = id === 'hub' ? 'hub' : (ch ? `${id}-${ch + 1}` : id);
    if (location.hash.slice(1) !== hash) history.pushState(null, '', '#' + hash);
    route();
  }
  W.go = go;

  function parseHash() {
    const raw = (location.hash || '').slice(1);
    if (!raw || raw === 'hub') return { id: 'hub', ch: 0 };
    const m = raw.match(/^([a-z0-9]+)(?:-(\d+))?$/);
    if (m && defs[m[1]]) return { id: m[1], ch: m[2] ? +m[2] - 1 : 0 };
    return { id: 'hub', ch: 0 };
  }
  function route() {
    const r = parseHash();
    if (r.id === 'hub') renderHub(); else renderProject(r.id, r.ch);
  }

  function nextProject(dir) {
    const list = W.projects();
    const i = list.findIndex((p) => p.id === current.id);
    const j = i + dir;
    if (j < 0) return go('hub');
    if (j >= list.length) return go('hub');
    go(list[j].id, dir < 0 ? list[j].chapters.length - 1 : 0);
  }
  function step(dir) {
    const list = W.projects();
    if (current.id === 'hub') { if (dir > 0 && list[0]) go(list[0].id, 0); return; }
    const p = defs[current.id];
    const n = current.ch + dir;
    if (n >= 0 && n < p.chapters.length) go(p.id, n); else nextProject(dir);
  }

  function setTheme(next) {
    try { localStorage.setItem('welt-theme', next); } catch (e) { /* storage unavailable */ }
    document.documentElement.setAttribute('data-theme', next);
    fireTheme();
  }

  W.start = function () {
    try { const t = localStorage.getItem('welt-theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch (e) { /* ignore */ }
    document.addEventListener('click', (e) => {
      const a = e.target.closest('[data-go]');
      if (a) { e.preventDefault(); go(a.getAttribute('data-go'), 0); }
    });
    // After a mouse drag on a slider, hand focus back so ←/→ step chapters again.
    document.addEventListener('pointerup', (e) => {
      const t = e.target;
      if (t && t.tagName === 'INPUT' && t.type === 'range') setTimeout(() => t.blur(), 0);
    });
    window.addEventListener('hashchange', route);
    window.addEventListener('popstate', route);
    if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', fireTheme);
    const help = document.getElementById('help-pop');
    document.getElementById('help-btn').onclick = () => (help.hidden = false);
    document.getElementById('help-close').onclick = () => (help.hidden = true);
    help.addEventListener('click', (e) => { if (e.target === help) help.hidden = true; });
    document.getElementById('theme-btn').onclick = () => setTheme(W.isDark() ? 'light' : 'dark');
    const fs = () => { try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); } catch (e) { /* unsupported */ } };
    document.getElementById('fs-btn').onclick = fs;
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target.tagName || '').toLowerCase();
      const k = e.key;
      // Presentation clickers send PageUp/PageDown: always navigate, even from a focused slider.
      if ((k === 'PageDown' || k === 'PageUp') && tag !== 'textarea') { e.preventDefault(); step(k === 'PageDown' ? 1 : -1); return; }
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
      if (k === 'ArrowRight' || k === 'PageDown' || (k === ' ' && tag !== 'button')) { e.preventDefault(); step(1); }
      else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); step(-1); }
      else if (k === 'Escape' || k === '0') { if (!help.hidden) help.hidden = true; else go('hub'); }
      else if (/^[1-9]$/.test(k)) { const p = W.projects()[+k - 1]; if (p) go(p.id, 0); }
      else if (k === 'f' || k === 'F') fs();
      else if (k === 't' || k === 'T') setTheme(W.isDark() ? 'light' : 'dark');
      else if (k === '?') help.hidden = !help.hidden;
    });
    route();
  };
})();
