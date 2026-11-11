/* Garden hub: overview cards linking to the toolbox explainers on rogeriog.github.io/garden/. */
(function () {
  'use strict';
  const W = window.WELT;
  const POSTS = [
    { id: 'mattervial', name: 'MatterVial', tag: 'GNN-learned features + symbolic formulas inside a readable model.', ch: 7 },
    { id: 'vibroml', name: 'VibroML', tag: 'Find imaginary phonons, follow them downhill to a stable polymorph.', ch: 7 },
    { id: 'protocsp', name: 'ProtoCSP', tag: 'Prototype + target composition → ranked, ordered crystal structures.', ch: 7 },
    { id: 'meidnet', name: 'MEIDNet', tag: 'Multimodal generative inverse design: target properties → crystals.', ch: 7 },
    { id: 'modnetpt', name: 'modnet-pt', tag: 'MODNet rewritten in PyTorch behind the scikit-learn contract.', ch: 6 },
  ];
  const LOGOS = { mattervial: 'mattervial.png', vibroml: 'vibroml.png', protocsp: 'protocsp.png', meidnet: 'meidnet.png', modnetpt: 'modnetpt.svg' };
  W.register({
    id: 'hub',
    render(el, W) {
      const h = W.h;
      const cards = h('div', { class: 'hub-cards' });
      POSTS.forEach((p) => {
        cards.appendChild(h('a', { class: 'hub-card', href: '/garden/' + p.id + '/', 'data-id': p.id },
          h('div', { class: 'hub-card-top' }, h('span', { class: 'hub-logo' }, h('img', { src: 'assets/logos/' + LOGOS[p.id], alt: '' }))),
          h('h3', null, p.name),
          h('p', { class: 'hub-card-tag', html: p.tag }),
          h('div', { class: 'hub-card-foot' }, h('span', { class: 'hub-card-ch' }, p.ch + ' chapters →'))));
      });
      el.appendChild(h('section', { class: 'hub-hero' }, h('div', { class: 'wrap' },
        h('div', { class: 'hub-hero-text' },
          h('div', { class: 'hub-kicker' }, 'Digital garden · interactive explainers'),
          h('h1', null, 'MODL toolbox'),
          h('p', { class: 'hub-thesis', html: 'Interactive notes on the tools behind my materials-informatics pipeline — each card opens a standalone explainer.' }),
          h('p', { class: 'hub-who' }, h('a', { class: 'btn ghost', href: '/garden/' }, '← Back to the garden'))))));
      el.appendChild(h('section', { class: 'hub-sec' }, h('div', { class: 'wrap' },
        h('div', { class: 'hub-sec-head' }, h('h2', null, 'The tools'), h('p', { class: 'hint' }, 'Click a card.')), cards)));
    },
  });
})();
