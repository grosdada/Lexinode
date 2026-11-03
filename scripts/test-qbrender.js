#!/usr/bin/env node
/* Test du lancement des rendus (node Sortie Queue Builder) : faux Q-Builder, fausses machines ComfyUI, faux script de file.
 * Rien n'est envoyé à une vraie machine. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '✓ ' : '✕ ') + msg); if (!cond) fails++; };
const GB = 1073741824;
const serve = (handler) => new Promise((resolve) => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => resolve(s)); });
const json = (res, obj, code) => { res.writeHead(code || 200, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-qbr-'));
const root = path.join(tmp, 'qb');
fs.mkdirSync(root);
fs.writeFileSync(path.join(root, 'h3_t2v_api.json'), '{}');
fs.writeFileSync(path.join(root, 'ltx25_t2v_api.json'), '{}');
const calls = path.join(tmp, 'calls.jsonl');
// faux « queue_ltx_multishot.py » : du JavaScript que node exécute (l'extension n'y change rien)
fs.writeFileSync(path.join(root, 'queue_ltx_multishot.py'), `
const fs = require('fs');
const a = process.argv.slice(2);
const val = (k) => { const i = a.indexOf(k); return i < 0 ? null : a[i + 1]; };
const rows = JSON.parse(fs.readFileSync(val('--prompts'), 'utf-8-sig'.replace('-sig', '')));
fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify({ args: a, rows }) + '\\n');
if (a.includes('--dry-run')) rows.forEach((r, i) => console.log('DRY RUN: ' + String(i + 1).padStart(2, '0') + ' ' + r.name));
else rows.forEach((r) => console.log('QUEUED ' + r.name));
`);

(async () => {
  const frees = [];
  const mk = (name, state) => serve((req, res) => {
    if (req.url === '/queue') return json(res, { queue_running: state.running ? [[1, 'p', {}, {}, []]] : [], queue_pending: [] });
    if (req.url === '/system_stats') return json(res, { devices: [{ vram_total: 34 * GB, vram_free: state.free }] });
    if (req.url === '/free' && req.method === 'POST') { frees.push(name); if (state.frees) state.free = 32 * GB; return json(res, {}); }
    json(res, {}, 404);
  });
  const st = { M1: { free: 32 * GB }, M2: { free: 32 * GB, running: true }, M3: { free: 5 * GB, frees: true }, M4: { free: 4 * GB, frees: false } };
  const servers = {};
  for (const n of Object.keys(st)) servers[n] = await mk(n, st[n]);
  const url = (n) => `http://127.0.0.1:${servers[n].address().port}`;
  const qb = await serve((req, res) => {
    if (req.url === '/api/env') return json(res, { root, python: process.execPath });
    if (req.url === '/api/cluster-status') return json(res, { nodes: Object.keys(st).map((n) => ({ name: n, url: url(n), auto: true, online: true })) });
    json(res, {}, 404);
  });

  const PORT = 20000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(PORT), HOST: '127.0.0.1', QBUILDER_URL: `http://127.0.0.1:${qb.address().port}`, LEXINODE_HOME: path.join(tmp, 'home'), LEXINODE_FREE_POLL_MS: '30', FAL_KEY: '', LEXINODE_PASSWORD: '' }), stdio: 'ignore',
  });
  const post = (body, headers) => new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, path: '/api/qbuilder/render', method: 'POST', headers: headers || { 'content-type': 'application/json' } }, (res) => {
      let t = '';
      res.on('data', (c) => { t += c; });
      res.on('end', () => { let j = {}; try { j = JSON.parse(t); } catch (e) { /* texte */ } resolve({ status: res.statusCode, j, text: t }); });
    });
    r.on('error', reject);
    r.end(typeof body === 'string' ? body : JSON.stringify(body));
  });
  const readCalls = () => (fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
  const row = (n, t) => ({ name: n, positive: t || `Prompt ${n}` });
  const base = { engine: 'h3', aspect: '16:9 (Widescreen)', groups: [{ seconds: 7, rows: [row('a_01'), row('a_02')] }, { seconds: 10, rows: [row('b_01')] }] };

  try {
    for (let i = 0; i < 60; i++) { try { await post({}); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); } }
    ok((await post(JSON.stringify(base), { 'content-type': 'text/plain' })).status === 415, 'envoi « simple » inter-sites refusé (415)');
    ok((await post(Object.assign({}, base, { aspect: '5:4' }))).status === 400, 'format inconnu refusé');
    ok((await post(Object.assign({}, base, { groups: [{ seconds: 7, rows: [row('mauvais nom!')] }] }))).status === 400, 'nom de plan invalide refusé');
    ok((await post({ engine: 'ltx25', aspect: '16:9 (Widescreen)', groups: [{ frames: 100, rows: [row('x_01')] }] })).status === 400, 'LTX : images hors 8n+1 refusées');
    ok((await post(Object.assign({}, base, { machines: ['http://8.8.8.8:8188'] }))).status === 400 && readCalls().length === 0, 'machine inconnue de Q-Builder refusée, rien lancé');

    // simulation : toutes les machines, aucun /free, --dry-run
    let r = await post(Object.assign({}, base, { mode: 'dry' }));
    let c = readCalls();
    ok(r.status === 200 && r.j.ok && c.length === 2 && c.every((x) => x.args.includes('--dry-run')) && frees.length === 0, 'simulation : --dry-run, aucune mémoire vidée');
    ok(/DRY RUN: 01 a_01/.test(r.j.runs[0].tail) && c[0].args.includes('--servers') && c[0].args[c[0].args.indexOf('--servers') + 1].split(',').length === 4, 'simulation : toutes les machines en ligne passées au script');

    // lancement réel (faux) de tout le lot
    fs.writeFileSync(calls, '');
    r = await post(Object.assign({}, base, { mode: 'all' }));
    c = readCalls();
    const by = Object.fromEntries(r.j.machines.map((m) => [m.name, m]));
    ok(r.status === 200 && r.j.ok && by.M1.used && by.M3.used && by.M3.freed, 'machines prêtes ou vidées avec succès : utilisées');
    ok(!by.M2.used && /occupée/.test(by.M2.reason), 'machine occupée : exclue, jamais d’empilement');
    ok(!by.M4.used && /encore presque pleine/.test(by.M4.reason), 'VRAM toujours pleine après vidage : exclue');
    ok(frees.join() === 'M3,M4', 'mémoire vidée seulement sur les machines libres à VRAM pleine (ni la prête, ni l’occupée)');
    const servers1 = c[0].args[c[0].args.indexOf('--servers') + 1].split(',');
    ok(c.length === 2 && servers1.length === 2 && !servers1.includes(url('M2')) && !servers1.includes(url('M4')), 'le script ne reçoit que les machines retenues');
    ok(c[0].args.includes('--duration-seconds') && c[0].args[c[0].args.indexOf('--duration-seconds') + 1] === '7' && c[1].args[c[1].args.indexOf('--duration-seconds') + 1] === '10', 'un lancement par durée : 7 s puis 10 s');
    ok(c[0].args.includes('h3_t2v_api.json') && c[0].args[c[0].args.indexOf('--aspect-ratio') + 1] === '16:9 (Widescreen)' && c[0].args[c[0].args.indexOf('--megapixels') + 1] === '0.8', 'workflow H3, format et mégapixels par défaut');
    ok(c[0].rows.length === 2 && c[0].rows[0].name === 'a_01' && c[0].rows[0].positive === 'Prompt a_01' && c[1].rows.length === 1, 'fichiers de prompts fidèles, par lot');
    ok(fs.existsSync(path.join(r.j.dir, 'lancement.log')), 'journal du lancement écrit');

    // essai puis reste
    fs.writeFileSync(calls, '');
    st.M3.free = 5 * GB; frees.length = 0;
    r = await post(Object.assign({}, base, { mode: 'test' }));
    c = readCalls();
    ok(r.j.ok && c.length === 1 && c[0].rows.length === 1 && c[0].rows[0].name === 'a_01', 'essai : un seul prompt envoyé');
    fs.writeFileSync(calls, '');
    r = await post(Object.assign({}, base, { mode: 'rest' }));
    c = readCalls();
    ok(r.j.ok && c.map((x) => x.rows.map((y) => y.name).join()).join('|') === 'a_02|b_01', 'reste : tout sauf le prompt d’essai');

    // LTX et dossier de copie
    fs.writeFileSync(calls, '');
    r = await post({ engine: 'ltx25', aspect: '9:16 (Portrait Widescreen)', megapixels: 0.9, copy_results: 'Y:\\copies', mode: 'all', groups: [{ frames: 177, rows: [row('l_01')] }] });
    c = readCalls();
    ok(r.status === 200 && c[0].args.includes('--frame-count') && c[0].args[c[0].args.indexOf('--frame-count') + 1] === '177' && c[0].args.includes('ltx25_t2v_api.json') && c[0].args[c[0].args.indexOf('--copy-results') + 1] === 'Y:\\copies' && c[0].args[c[0].args.indexOf('--megapixels') + 1] === '0.9', 'LTX 2.5 : images, workflow, mégapixels et dossier de copie');

    // vidage refusé par l'utilisateur : les machines à VRAM pleine sont exclues
    st.M3.free = 5 * GB; frees.length = 0;
    r = await post(Object.assign({}, base, { mode: 'all', free_memory: false }));
    ok(r.status === 200 && frees.length === 0 && r.j.machines.find((m) => m.name === 'M3').reason.includes('vidage non demandé'), 'sans vidage demandé : VRAM pleine exclue, rien n’est vidé');

    // plus aucune machine utilisable
    st.M1.running = true; st.M3.running = true; st.M4.running = true;
    r = await post(Object.assign({}, base, { mode: 'all' }));
    ok(r.status === 409 && /Aucune machine disponible/.test(r.j.error) && Array.isArray(r.j.machines), 'toutes occupées : 409 avec le détail par machine');
  } catch (e) {
    console.log('✕ test interrompu : ' + e.message);
    fails++;
  } finally {
    child.kill();
    qb.close();
    Object.values(servers).forEach((s) => s.close());
    await new Promise((r) => setTimeout(r, 200));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(fails ? `\n${fails} échec(s)` : '\nLancement des rendus : tout est bon.');
  process.exit(fails ? 1 : 0);
})();
