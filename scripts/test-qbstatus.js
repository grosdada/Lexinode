#!/usr/bin/env node
/* Test du suivi des rendus (node Sortie Queue Builder) : faux Q-Builder + fausse machine ComfyUI, lecture seule. */
'use strict';
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '✓ ' : '✕ ') + msg); if (!cond) fails++; };
const serve = (handler) => new Promise((resolve) => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => resolve(s)); });
const json = (res, obj, code) => { res.writeHead(code || 200, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
const get = (port, p) => new Promise((resolve, reject) => { http.get({ host: '127.0.0.1', port, path: p }, (res) => { let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => resolve({ status: res.statusCode, text: t })); }).on('error', reject); });

(async () => {
  const hits = { post: 0, comfy: [] };
  const comfy = await serve((req, res) => {
    hits.comfy.push(req.method + ' ' + req.url);
    if (req.method !== 'GET') hits.post++;
    if (req.url === '/queue') {
      return json(res, {
        queue_running: [[1, 'pid-run-1', { 5: { class_type: 'SaveVideo', inputs: { filename_prefix: 'Muse/Video/les_ventes_de_pa_01_accroche' } } }, {}, []]],
        queue_pending: [[2, 'pid-pend-1', { 9: { class_type: 'SaveVideo', inputs: { filename_prefix: 'Muse/Video/autre_job' } } }, {}, []]],
      });
    }
    json(res, {}, 404);
  });
  const cport = comfy.address().port;
  const GB = 1073741824;
  const qb = await serve((req, res) => {
    if (req.url === '/api/cluster-status') {
      return json(res, { nodes: [
        { name: 'FORD', url: `http://127.0.0.1:${cport}`, auto: true, online: true, gpu: 'cuda:0 NVIDIA GeForce RTX 5090 : cudaMallocAsync', vram_total: 34 * GB, vram_free: 5 * GB, running: 1, pending: 1 },
        { name: 'HITCHCOCK', url: 'http://192.168.1.60:1', auto: true, online: true, gpu: 'cuda:0 NVIDIA GeForce RTX 5090 : cudaMallocAsync', vram_total: 34 * GB, vram_free: 32 * GB, running: 0, pending: 0 },
        { name: 'HORSLIGNE', url: 'http://192.168.1.99:1', auto: true, online: false, running: 0, pending: 0 },
        { name: 'EXTERNE', url: 'http://8.8.8.8:8188', auto: true, online: true, gpu: '', vram_total: 0, vram_free: 0, running: 1, pending: 0 },
      ] });
    }
    json(res, {}, 404);
  });
  process.env.QBUILDER_URL = `http://127.0.0.1:${qb.address().port}`;
  const { renderStatus } = require('../server.js');
  try {
    const st = await renderStatus();
    const by = Object.fromEntries(st.nodes.map((n) => [n.name, n]));
    ok(st.ok && st.nodes.length === 4, 'quatre machines lues depuis Q-Builder');
    ok(by.FORD.gpu === 'NVIDIA GeForce RTX 5090' && by.FORD.vramFree === 5 * GB && by.FORD.running === 1 && by.FORD.pending === 1, 'état d’une machine : GPU nettoyé, VRAM, compteurs');
    ok(by.FORD.jobs.length === 2 && by.FORD.jobs[0].state === 'running' && by.FORD.jobs[0].name === 'les_ventes_de_pa_01_accroche' && by.FORD.jobs[1].state === 'pending' && by.FORD.jobs[1].name === 'autre_job', 'jobs nommés d’après leur préfixe de sortie, en calcul puis en attente');
    ok(by.HITCHCOCK.jobs.length === 0 && by.HORSLIGNE.online === false, 'machine libre sans job, machine hors ligne signalée');
    ok(by.EXTERNE.jobs.length === 0 && !by.EXTERNE.jobsError, 'adresse hors réseau local : file jamais interrogée');
    ok(hits.post === 0 && hits.comfy.every((h) => h === 'GET /queue'), 'lecture seule : un seul GET /queue, aucun envoi');

    // la route HTTP du serveur
    const PORT = 20000 + Math.floor(Math.random() * 20000);
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: String(PORT), HOST: '127.0.0.1', FAL_KEY: '', LEXINODE_PASSWORD: '' }), stdio: 'ignore' });
    try {
      let r;
      for (let i = 0; i < 50; i++) { try { r = await get(PORT, '/api/qbuilder/status'); break; } catch (e) { await new Promise((x) => setTimeout(x, 100)); } }
      ok(r && r.status === 200 && JSON.parse(r.text).ok === true && JSON.parse(r.text).nodes.length === 4, 'route /api/qbuilder/status');
    } finally { child.kill(); }

    // Q-Builder éteint
    qb.close();
    const off = await renderStatus();
    ok(off.ok === false && /Q-Builder ne répond pas/.test(off.error), 'Q-Builder éteint : message clair');
  } catch (e) {
    console.log('✕ test interrompu : ' + e.message);
    fails++;
  } finally {
    comfy.close();
  }
  console.log(fails ? `\n${fails} échec(s)` : '\nSuivi des rendus : tout est bon.');
  process.exit(fails ? 1 : 0);
})();
