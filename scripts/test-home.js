#!/usr/bin/env node
/* Test du mode PC (LEXINODE_HOME) : les données vivent dans le dossier de l'utilisateur, pas dans celui de l'appli. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '✓ ' : '✕ ') + msg); if (!cond) fails++; };

const ROOT = path.join(__dirname, '..');
const home = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lx-home-')), 'Lexinode'); // n'existe pas encore : créé au premier lancement
const PORT = 20000 + Math.floor(Math.random() * 20000);
const SECRET = 'fal-secret-HOME-0123456789';
const call = (method, p, body) => new Promise((resolve, reject) => {
  const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers: body ? { 'content-type': 'application/json' } : {} }, (res) => {
    let t = '';
    res.on('data', (c) => { t += c; });
    res.on('end', () => resolve({ status: res.statusCode, text: t }));
  });
  r.on('error', reject);
  if (body) r.write(JSON.stringify(body));
  r.end();
});

(async () => {
  const env = Object.assign({}, process.env, { PORT: String(PORT), HOST: '127.0.0.1', LEXINODE_HOME: home, FAL_KEY: '' });
  for (const k of ['LEXINODE_MASTER_KEY', 'LEXINODE_VAULT_FILE', 'LEXINODE_PASSWORD']) delete env[k];
  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env, stdio: 'ignore' });
  const rootBefore = fs.existsSync(path.join(ROOT, 'projects')) ? fs.readdirSync(path.join(ROOT, 'projects')).length : 0;
  try {
    for (let i = 0; i < 50; i++) { try { await call('GET', '/api/status'); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); } }
    const envFile = path.join(home, '.env');
    ok(fs.existsSync(envFile) && /^LEXINODE_MASTER_KEY=[0-9a-f]{64}$/m.test(fs.readFileSync(envFile, 'utf8')), 'premier lancement : dossier de données et clé maîtresse créés');
    const st = JSON.parse((await call('GET', '/api/status')).text);
    ok(st.vault.enabled && !st.vault.locked, 'coffre actif sans aucune configuration');
    ok((await call('POST', '/api/vault', { set: { fal: SECRET } })).status === 200, 'une clé s’enregistre dans le coffre');
    const vfile = path.join(home, 'vault', 'secrets.json');
    ok(fs.existsSync(vfile) && !fs.readFileSync(vfile, 'utf8').includes(SECRET), 'coffre chiffré dans le dossier de données');
    ok((await call('POST', '/api/projects', { meta: { title: 'Essai PC' }, nodes: [], links: [] })).status === 200 && fs.existsSync(path.join(home, 'projects', 'essai-pc.json')), 'les projets vont dans le dossier de données');
    ok((await call('POST', '/api/lexicons', { id: 'essai-pc', nom: 'Essai PC' })).status === 200 && fs.existsSync(path.join(home, 'custom', 'essai-pc.json')), 'les lexiques personnels aussi');
    const rootAfter = fs.existsSync(path.join(ROOT, 'projects')) ? fs.readdirSync(path.join(ROOT, 'projects')).length : 0;
    ok(rootAfter === rootBefore && !fs.existsSync(path.join(ROOT, 'data', 'custom', 'essai-pc.json')), 'rien n’est écrit dans le dossier de l’application');
    ok(JSON.parse((await call('GET', '/api/lexicons')).text).some((l) => l.id === 'essai-pc' && l._custom), 'le lexique personnel est relu');
  } catch (e) {
    console.log('✕ test interrompu : ' + e.message);
    fails++;
  } finally {
    child.kill();
    await new Promise((r) => setTimeout(r, 200));
    fs.rmSync(path.dirname(home), { recursive: true, force: true });
  }
  console.log(fails ? `\n${fails} échec(s)` : '\nMode PC : tout est bon.');
  process.exit(fails ? 1 : 0);
})();
