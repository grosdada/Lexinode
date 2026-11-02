#!/usr/bin/env node
// Test sans navigateur : exécute les projets d'exemple avec le moteur local et vérifie que chaque node produit un résultat.
// Usage : node scripts/selftest.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

const sandbox = { console, performance, setTimeout, clearTimeout, URL, fetch: async () => { throw new Error('réseau désactivé'); } };
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.window.LEXINODE_STANDALONE = true;
sandbox.window.LEXINODE_DEMO = true; // moteur local uniquement
sandbox.window.LEXINODE_LEXICONS = fs.readdirSync(path.join(ROOT, 'data/lexicons')).filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data/lexicons', f), 'utf8')));
sandbox.window.LEXINODE_TOPICS = fs.existsSync(path.join(ROOT, 'data/topics')) ? fs.readdirSync(path.join(ROOT, 'data/topics')).filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data/topics', f), 'utf8'))) : [];
const mem = {};
sandbox.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } };
vm.createContext(sandbox);
for (const f of ['util', 'providers', 'lexicons', 'nodes', 'local-engine', 'topics', 'correlation', 'short', 'video-models', 'animatic', 'ai-engine', 'engine', 'render']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/js', f + '.js'), 'utf8'), sandbox, { filename: f + '.js' });
}
const LX = sandbox.LX;
LX.settings = { engine: 'local', concurrency: 3, roles: {}, keys: {}, baseUrls: {} };

function fakeEditor(graph) {
  const N = LX.nodes;
  const ed = { graph, status: {} };
  ed.node = (id) => graph.nodes.find((n) => n.id === id);
  ed.inputsOf = (id) => graph.links.filter((l) => l.to === id);
  ed.outputType = (n, port) => (N.DEFS[n.type].outputs.find((o) => o.key === port) || {}).type;
  ed.setStatus = (id, state, msg) => { ed.status[id] = { state, msg }; };
  ed.drawLinks = () => {};
  for (const n of graph.nodes) n.data = Object.assign(N.defaults(n.type), n.data);
  return ed;
}

(async () => {
  await LX.lex.load();
  await LX.topics.load();
  const ts = LX.topics.stats();
  console.log(`${LX.lex.all.length - 1} lexiques · banque de topics : ${ts.sujets} sujets, ${ts.paires} paires, ${ts.combinaisons.toLocaleString('fr-FR')} combinaisons générées`);
  // tirages : pas de doublon sur 200 tirages
  const seen = new Set();
  let dup = 0;
  for (let i = 0; i < 200; i++) { const t = LX.topics.draw({ mode: 'un', source: 'mixte' }).a.t; if (seen.has(t)) dup++; seen.add(t); }
  console.log(`${dup ? '✗' : '✓'} 200 tirages, ${dup} doublon(s) — ex. : « ${Array.from(seen).slice(0, 3).join(' » · « ')} »`);
  let fail = 0;
  const exDir = path.join(ROOT, 'data/examples');
  for (const f of fs.readdirSync(exDir).filter((x) => x.endsWith('.json')).sort()) {
    const ed = fakeEditor(JSON.parse(fs.readFileSync(path.join(exDir, f), 'utf8')));
    const st = await LX.engine.run(ed, {});
    const errs = Object.entries(ed.status).filter(([, s]) => s.state !== 'done');
    fail += errs.length;
    console.log(`${errs.length ? '✗' : '✓'} ${f} — ${st.computed} nodes calculés en ${st.ms} ms`);
    for (const [id, s] of errs) console.log(`   ${id} : ${s.msg}`);
    const short = ed.graph.nodes.find((n) => n.type === 'short');
    if (short && short.out) console.log(`   short : ${short.out.scenes.length} scènes, ${short.out.duree} s, « ${short.out.titre} »`);
  }
  process.exit(fail ? 1 : 0);
})();
