#!/usr/bin/env node
// Construit des versions autonomes en un seul fichier HTML (sans serveur) :
//   dist/lexinode.html       → complète : moteur local + appels IA directs depuis le navigateur
//   dist/lexinode-demo.html  → démo : moteur local uniquement (aucune clé, aucun appel réseau)
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const pub = (p) => fs.readFileSync(path.join(ROOT, 'public', p), 'utf8');
const html = pub('index.html');
const css = pub('css/app.css');
const scripts = Array.from(html.matchAll(/<script src="([^"]+)"><\/script>/g)).map((m) => m[1]);
const lexDir = path.join(ROOT, 'data', 'lexicons');
const lexicons = fs.readdirSync(lexDir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(lexDir, f), 'utf8')));
const exDir = path.join(ROOT, 'data', 'examples');
const examples = fs.readdirSync(exDir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(exDir, f), 'utf8')));
const topDir = path.join(ROOT, 'data', 'topics');
const topics = fs.existsSync(topDir) ? fs.readdirSync(topDir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(topDir, f), 'utf8'))) : [];
const safe = (s) => s.replace(/<\/script/gi, '<\\/script');

function build(demo) {
  // NB : fonctions de remplacement (le code contient des « $& », « $1 »… que String.replace interpréterait)
  let out = html.replace('<link rel="stylesheet" href="css/app.css">', () => `<style>\n${css}\n</style>`);
  const data = `<script>\nwindow.LEXINODE_STANDALONE = true;\nwindow.LEXINODE_DEMO = ${demo};\nwindow.LEXINODE_LEXICONS = ${safe(JSON.stringify(lexicons))};\nwindow.LEXINODE_EXAMPLES = ${safe(JSON.stringify(examples))};\nwindow.LEXINODE_TOPICS = ${safe(JSON.stringify(topics))};\n</script>`;
  const code = scripts.map((s) => `<script>\n/* ${s} */\n${safe(pub(s))}\n</script>`).join('\n');
  out = out.replace(/(\s*<script src="[^"]+"><\/script>)+/, () => '\n' + data + '\n' + code + '\n');
  return out;
}
fs.mkdirSync(path.join(ROOT, 'dist', 'artifact'), { recursive: true });
// Variante « page publiée » (claude.ai) : le squelette html/head/body est fourni par l'hébergeur
const artifact = build(true)
  .replace(/<!doctype html>\s*/i, '').replace(/<html[^>]*>\s*/i, '').replace(/<\/html>\s*$/i, '')
  .replace(/<head>\s*/i, '').replace(/\s*<\/head>/i, '').replace(/<body>\s*/i, '').replace(/\s*<\/body>/i, '')
  .replace(/\s*<meta charset="utf-8">/i, '').replace(/\s*<meta name="viewport"[^>]*>/i, '').replace(/\s*<link rel="icon"[^>]*>/i, '');
fs.writeFileSync(path.join(ROOT, 'dist', 'artifact', 'lexinode.html'), artifact);
console.log('✓ dist/artifact/lexinode.html (page publiable)');
for (const [name, demo] of [['lexinode.html', false], ['lexinode-demo.html', true]]) {
  const file = path.join(ROOT, 'dist', name);
  fs.writeFileSync(file, build(demo));
  console.log(`✓ dist/${name}  (${Math.round(fs.statSync(file).size / 1024)} Ko, ${lexicons.length} lexiques, ${examples.length} exemples)`);
}
