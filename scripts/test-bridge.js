#!/usr/bin/env node
/* Test du pont (version Windows) : un site en ligne pilote Q-Builder à travers ce PC. Origine autorisée + clé + routes Q-Builder seulement ;
 * hôte vérifié ; libération de la VRAM. Faux Q-Builder et fausses machines, rien n'est envoyé à une vraie machine. */
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

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-bridge-'));
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home);
  // installation déjà faite avant le pont : un .env avec la seule clé maîtresse
  fs.writeFileSync(path.join(home, '.env'), 'LEXINODE_MASTER_KEY=' + 'ab'.repeat(32) + '\n');

  // dossier des films par défaut : Output dans le dossier de données (ici pas de lanceur Windows)
  fs.mkdirSync(path.join(home, 'Output', 'lot'), { recursive: true });
  fs.writeFileSync(path.join(home, 'Output', 'vieux.mp4'), 'x'.repeat(1000));
  fs.writeFileSync(path.join(home, 'Output', 'notes.txt'), 'pas un film');
  fs.writeFileSync(path.join(home, 'Output', 'lot', 'recent.mp4'), 'y'.repeat(2048));
  fs.utimesSync(path.join(home, 'Output', 'vieux.mp4'), new Date(Date.now() - 3600e3), new Date(Date.now() - 3600e3));
  const frees = [];
  const mk = (name, st) => serve((req, res) => {
    if (req.url === '/queue') return json(res, { queue_running: st.running ? [[1, 'p', {}, {}, []]] : [], queue_pending: [] });
    if (req.url === '/system_stats') return json(res, { devices: [{ vram_total: 34 * GB, vram_free: st.free }] });
    if (req.url === '/free' && req.method === 'POST') { frees.push(name); st.free = 32 * GB; return json(res, {}); }
    json(res, {}, 404);
  });
  const st = { LIBRE: { free: 5 * GB }, OCCUPEE: { free: 5 * GB, running: true } };
  const m = { LIBRE: await mk('LIBRE', st.LIBRE), OCCUPEE: await mk('OCCUPEE', st.OCCUPEE) };
  const url = (n) => `http://127.0.0.1:${m[n].address().port}`;
  const qb = await serve((req, res) => {
    if (req.url === '/api/cluster-status') return json(res, { nodes: Object.keys(st).map((n) => ({ name: n, url: url(n), auto: true, online: true })) });
    json(res, {}, 404);
  });

  const PORT = 20000 + Math.floor(Math.random() * 20000);
  const SITE = 'https://site.test';
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(PORT), HOST: '127.0.0.1', LEXINODE_HOME: home, LEXINODE_BRIDGE_ORIGINS: SITE, QBUILDER_URL: `http://127.0.0.1:${qb.address().port}`, LEXINODE_FREE_POLL_MS: '30', LEXINODE_NO_OPEN: '1', FAL_KEY: '', LEXINODE_PASSWORD: '' }), stdio: 'ignore',
  });
  const call = (method, p, { headers, body } = {}) => new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers: Object.assign({}, headers) }, (res) => {
      let t = '';
      res.on('data', (c) => { t += c; });
      res.on('end', () => { let j = {}; try { j = JSON.parse(t); } catch (e) { /* vide */ } resolve({ status: res.statusCode, headers: res.headers, j, text: t }); });
    });
    r.on('error', reject);
    r.end(body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body));
  });
  try {
    for (let i = 0; i < 60; i++) { try { await call('GET', '/api/bridge/ping'); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); } }
    const env = fs.readFileSync(path.join(home, '.env'), 'utf8');
    const token = (env.match(/^LEXINODE_BRIDGE_TOKEN=([0-9a-f]{64})$/m) || [])[1];
    ok(!!token && env.includes('ab'.repeat(32)), 'installation existante : clé du pont ajoutée, clé maîtresse intacte');
    const web = { origin: SITE };
    const auth = (t) => ({ origin: SITE, authorization: 'Bearer ' + t });

    // fenêtre locale (même origine) : pas de clé nécessaire ; la clé n'est lisible que par elle
    ok((await call('GET', '/api/bridge/ping')).j.bridge === true, 'fenêtre locale : le pont répond sans clé');
    const info = await call('GET', '/api/bridge/info');
    ok(info.j.token === token && info.j.origins.join() === SITE, 'fenêtre locale : lit la clé du pont et les origines autorisées');
    ok((await call('GET', '/api/bridge/info', { headers: auth(token) })).status === 403, 'la clé n’est jamais lisible depuis le site (403 même avec la clé)');

    // prévol CORS
    const pre = await call('OPTIONS', '/api/qbuilder/status', { headers: { origin: SITE, 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' } });
    ok(pre.status === 204 && pre.headers['access-control-allow-origin'] === SITE && pre.headers['access-control-allow-private-network'] === 'true' && /authorization/.test(pre.headers['access-control-allow-headers']), 'prévol du site autorisé : CORS et réseau privé acceptés');
    const evilPre = await call('OPTIONS', '/api/qbuilder/status', { headers: { origin: 'https://evil.test', 'access-control-request-method': 'GET' } });
    ok(evilPre.status === 403 && !evilPre.headers['access-control-allow-origin'], 'prévol d’un autre site : refusé, aucun en-tête CORS');

    // appels du site
    ok((await call('GET', '/api/bridge/ping', { headers: web })).status === 401, 'site sans clé : 401');
    ok((await call('GET', '/api/bridge/ping', { headers: auth('0'.repeat(64)) })).status === 401, 'site avec une mauvaise clé : 401');
    const good = await call('GET', '/api/bridge/ping', { headers: auth(token) });
    ok(good.status === 200 && good.headers['access-control-allow-origin'] === SITE && good.j.qbuilder.ok && good.j.qbuilder.machines === 2, 'site avec la bonne clé : 200, lit Q-Builder, en-têtes CORS');
    const evil = await call('GET', '/api/bridge/ping', { headers: { origin: 'https://evil.test', authorization: 'Bearer ' + token } });
    ok(evil.status === 403 && !evil.headers['access-control-allow-origin'], 'autre site avec la bonne clé : 403, illisible');
    for (const p of ['/api/vault', '/api/projects', '/api/status', '/api/voice/voices']) {
      ok((await call('GET', p, { headers: auth(token) })).status === 403, `route non Q-Builder inaccessible depuis le site : ${p}`);
    }
    const st1 = await call('GET', '/api/qbuilder/status', { headers: auth(token) });
    ok(st1.status === 200 && st1.j.ok && st1.j.nodes.length === 2, 'état des machines lisible depuis le site');

    // « DNS rebinding » : un autre nom d'hôte pointant sur ce PC
    ok((await call('GET', '/api/bridge/ping', { headers: { host: `evil.test:${PORT}` } })).status === 403, 'hôte inconnu (DNS rebinding) : 403');

    // libérer la VRAM
    const jh = Object.assign({ 'content-type': 'application/json' }, auth(token));
    ok((await call('POST', '/api/qbuilder/free', { headers: Object.assign({}, auth(token), { 'content-type': 'text/plain' }), body: '{}' })).status === 415, 'vidage : JSON exigé (415)');
    const busy = await call('POST', '/api/qbuilder/free', { headers: jh, body: { url: url('OCCUPEE') } });
    ok(busy.status === 400 && /calcule/.test(busy.j.error) && frees.length === 0, 'machine occupée : vidage refusé, rien envoyé');
    ok((await call('POST', '/api/qbuilder/free', { headers: jh, body: { url: 'http://8.8.8.8:8188' } })).status === 400, 'machine inconnue de Q-Builder : refusée');
    const done = await call('POST', '/api/qbuilder/free', { headers: jh, body: { url: url('LIBRE') } });
    // dossier des films : liste, ouverture du dossier ou d'un film, refus hors dossier
    const outDir = path.join(home, 'Output');
    ok(st1.j.films && st1.j.films.dir === outDir && st1.j.films.count === 2 && st1.j.films.latest[0].name === path.join('lot', 'recent.mp4') && st1.j.films.latest[1].name === 'vieux.mp4', 'état : dossier Output par défaut, films listés du plus récent au plus ancien (le .txt ignoré)');
    const op = await call('POST', '/api/qbuilder/open-output', { headers: jh, body: {} });
    ok(op.status === 200 && op.j.ok && op.j.dir === outDir && op.j.opened === outDir, 'ouvrir le dossier des films depuis le site');
    const opf = await call('POST', '/api/qbuilder/open-output', { headers: jh, body: { file: 'vieux.mp4' } });
    ok(opf.status === 200 && opf.j.opened === path.join(outDir, 'vieux.mp4'), 'lire un film du dossier');
    for (const bad of ['../.env', '..\\.env', 'notes.txt', 'absent.mp4', path.join(home, '.env')]) {
      ok((await call('POST', '/api/qbuilder/open-output', { headers: jh, body: { file: bad } })).status === 400, `ouverture refusée hors film du dossier : ${bad.replace(/\\/g, '/').slice(-14)}`);
    }
    ok((await call('POST', '/api/qbuilder/open-output', { headers: Object.assign({}, auth(token), { 'content-type': 'text/plain' }), body: '{}' })).status === 415, 'ouverture : JSON exigé (415)');
    ok((await call('POST', '/api/qbuilder/open-output', { headers: { origin: SITE, 'content-type': 'application/json' }, body: {} })).status === 401, 'ouverture sans clé : 401');
    ok(done.status === 200 && done.j.ready === true && done.j.vramFree === 32 * GB && frees.join() === 'LIBRE', 'machine libre : mémoire vidée puis vérifiée');
  } catch (e) {
    console.log('✕ test interrompu : ' + e.message);
    fails++;
  } finally {
    child.kill();
    qb.close();
    Object.values(m).forEach((s) => s.close());
    await new Promise((r) => setTimeout(r, 200));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(fails ? `\n${fails} échec(s)` : '\nPont : tout est bon.');
  process.exit(fails ? 1 : 0);
})();
