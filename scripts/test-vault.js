#!/usr/bin/env node
/* Test du coffre de clés : chiffrement, refus d'une mauvaise clé maîtresse, API HTTP (aucun appel réseau externe). */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { create } = require('../vault.js');

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '✓ ' : '✕ ') + msg); if (!cond) fails++; };
const throws = (fn) => { try { fn(); return false; } catch (e) { return true; } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-vault-'));
const file = path.join(tmp, 'vault', 'secrets.json');
const MASTER = 'maitresse-de-test-0123456789abcdef';
const SECRET = 'fal-secret-ABCDEF:0123456789';

// ---- unitaire
let v = create({ file, master: '' });
ok(!v.enabled && throws(() => v.update({ set: { fal: SECRET } })), 'sans clé maîtresse : coffre désactivé, écriture refusée');
v = create({ file, master: 'courte' });
ok(!v.enabled && /trop courte/.test(v.status().error), 'clé maîtresse trop courte : coffre désactivé avec message');

v = create({ file, master: MASTER });
v.update({ set: { fal: SECRET, tavily: 'tv-1' } });
const raw = fs.readFileSync(file, 'utf8');
ok(fs.existsSync(file) && !raw.includes(SECRET) && !raw.includes('tv-1'), 'le fichier du coffre ne contient aucune clé en clair');
ok(JSON.parse(raw).algorithm === 'aes-256-gcm', 'format AES-256-GCM');
ok(JSON.stringify(v.status()) && !JSON.stringify(v.status()).includes(SECRET) && v.status().keys.join() === 'fal,tavily', 'status() ne renvoie que les noms des clés');
ok(create({ file, master: MASTER }).get('fal') === SECRET, 'relecture avec la bonne clé maîtresse');

const before = fs.readFileSync(file);
const bad = create({ file, master: MASTER + 'x' });
ok(bad.locked && bad.get('fal') === undefined && throws(() => bad.update({ set: { fal: 'autre' } })), 'mauvaise clé maîtresse : coffre verrouillé, écriture refusée');
ok(Buffer.compare(before, fs.readFileSync(file)) === 0, 'le fichier n’est pas modifié quand le coffre est verrouillé');

v.update({ set: { fal: '' } });
ok(v.get('fal') === undefined && v.get('tavily') === 'tv-1', 'valeur vide = retrait de la clé');
ok(throws(() => v.update({ set: { inconnue: 'x' } })) && throws(() => v.update({ set: { fal: 'a\nb' } })), 'identifiant inconnu et valeur multiligne refusés');

// ---- une clé du serveur ne suit jamais une URL envoyée par le navigateur
const { trustedBase } = require('../server.js');
ok(trustedBase(undefined, 'cle-serveur', 'https://evil.example', 'https://prevu.example') === 'https://prevu.example', 'clé du coffre/.env : l’URL envoyée par le navigateur est ignorée');
ok(trustedBase(undefined, 'cle-serveur', 'https://evil.example', undefined) === undefined, 'clé du coffre/.env : sans URL serveur, adresse par défaut du fournisseur');
ok(trustedBase('cle-navigateur', 'cle-navigateur', 'https://proxy.example', undefined) === 'https://proxy.example', 'clé envoyée par le navigateur : son URL est suivie');
ok(trustedBase(undefined, '', 'http://127.0.0.1:11434', undefined) === 'http://127.0.0.1:11434', 'sans clé (Ollama, serveur local) : l’URL du navigateur est suivie');

// ---- HTTP (serveur réel, coffre isolé dans un dossier temporaire)
const PORT = 20000 + Math.floor(Math.random() * 20000);
const vfile = path.join(tmp, 'http', 'secrets.json');
const AUTH = 'Basic ' + Buffer.from('u:pw-test').toString('base64');
const call = (method, p, { body, type, auth = AUTH } = {}) => new Promise((resolve, reject) => {
  const headers = {};
  if (auth) headers.authorization = auth;
  if (body !== undefined) { headers['content-type'] = type || 'application/json'; }
  const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers }, (res) => {
    let t = '';
    res.on('data', (c) => { t += c; });
    res.on('end', () => resolve({ status: res.statusCode, text: t }));
  });
  r.on('error', reject);
  if (body !== undefined) r.write(typeof body === 'string' ? body : JSON.stringify(body));
  r.end();
});

(async () => {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(PORT), HOST: '127.0.0.1', LEXINODE_PASSWORD: 'pw-test', LEXINODE_USER: 'u', LEXINODE_MASTER_KEY: MASTER, LEXINODE_VAULT_FILE: vfile, FAL_KEY: '' }),
    stdio: 'ignore',
  });
  try {
    for (let i = 0; i < 50; i++) { try { await call('GET', '/', { auth: '' }); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); } }
    ok((await call('GET', '/', { auth: '' })).status === 401, 'HTTP : 401 sans mot de passe');
    ok((await call('POST', '/api/vault', { auth: '', body: {} })).status === 401, 'HTTP : écriture du coffre refusée sans mot de passe');
    let st = JSON.parse((await call('GET', '/api/status')).text);
    ok(st.vault.enabled && !st.vault.locked && st.video.fal === false, 'HTTP : coffre actif et vide, fal non configuré');
    ok((await call('POST', '/api/vault', { body: JSON.stringify({ set: { fal: SECRET } }), type: 'text/plain' })).status === 415, 'HTTP : envoi « simple » inter-sites refusé (415)');
    const put = await call('POST', '/api/vault', { body: { set: { fal: SECRET } } });
    ok(put.status === 200 && !put.text.includes(SECRET), 'HTTP : écriture acceptée, valeur non renvoyée');
    const status = (await call('GET', '/api/status')).text;
    st = JSON.parse(status);
    ok(st.video.fal === true && st.providers.fal.configured === true && st.vault.keys.join() === 'fal' && !status.includes(SECRET), 'HTTP : fal configuré via le coffre, sans fuite de la valeur');
    ok(fs.existsSync(vfile) && !fs.readFileSync(vfile, 'utf8').includes(SECRET), 'HTTP : fichier chiffré sur disque');
    ok((await call('POST', '/api/vault', { body: { set: { nimporte: 'x' } } })).status === 400, 'HTTP : identifiant inconnu refusé (400)');
    await call('POST', '/api/vault', { body: { remove: ['fal'] } });
    st = JSON.parse((await call('GET', '/api/status')).text);
    ok(st.video.fal === false && st.vault.keys.length === 0, 'HTTP : retrait de la clé');
  } catch (e) {
    console.log('✕ test HTTP interrompu : ' + e.message);
    fails++;
  } finally {
    child.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(fails ? `\n${fails} échec(s)` : '\nCoffre : tout est bon.');
  process.exit(fails ? 1 : 0);
})();
