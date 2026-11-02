#!/usr/bin/env node
/* Test de la voix off ElevenLabs : liste des voix, génération, cache, erreurs, voix imposée à la vidéo.
 * Tout se passe contre un faux serveur ElevenLabs local : aucun crédit dépensé, aucune vraie clé. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '✓ ' : '✕ ') + msg); if (!cond) fails++; };

const home = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lx-voice-')), 'Lexinode');
process.env.LEXINODE_HOME = home; // lu par server.js au chargement (test unitaire de resolveVoiceRefs)
const { resolveVoiceRefs, voiceSpec, voiceId } = require('../server.js');

// ---- faux ElevenLabs
const EL_PORT = 20000 + Math.floor(Math.random() * 10000);
const seen = { tts: 0, voices: 0, keys: new Set() };
const fake = http.createServer((req, res) => {
  seen.keys.add(req.headers['xi-api-key']);
  let b = '';
  req.on('data', (c) => { b += c; });
  req.on('end', () => {
    if (req.url.startsWith('/v1/voices')) {
      seen.voices++;
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ voices: [{ voice_id: 'ZoeVoice0123456789', name: 'Zoé', category: 'cloned' }, { voice_id: 'AlexVoice987654321', name: 'Alex', category: 'premade' }] }));
    }
    const m = req.url.match(/^\/v1\/text-to-speech\/([A-Za-z0-9]+)\?output_format=mp3_44100_128$/);
    if (m && req.method === 'POST') {
      const j = JSON.parse(b);
      seen.tts++;
      seen.last = { voice: m[1], body: j };
      if (j.text.includes('ERREUR')) { res.writeHead(401, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ detail: { message: 'invalid api key' } })); }
      res.writeHead(200, { 'content-type': 'audio/mpeg' });
      return res.end(Buffer.concat([Buffer.from('ID3'), Buffer.from(j.text)]));
    }
    res.writeHead(404); res.end();
  });
}).listen(EL_PORT, '127.0.0.1');

const PORT = EL_PORT + 1;
const call = (method, p, body, headers) => new Promise((resolve, reject) => {
  const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers: Object.assign(body ? { 'content-type': 'application/json' } : {}, headers || {}) }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], buf: Buffer.concat(chunks), text: Buffer.concat(chunks).toString('utf8') }));
  });
  r.on('error', reject);
  if (body) r.write(typeof body === 'string' ? body : JSON.stringify(body));
  r.end();
});
const waitUp = async () => { for (let i = 0; i < 60; i++) { try { await call('GET', '/api/status'); return; } catch (e) { await new Promise((r) => setTimeout(r, 100)); } } throw new Error('serveur injoignable'); };
const start = (extra) => spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
  env: Object.assign({}, process.env, { PORT: String(PORT), HOST: '127.0.0.1', LEXINODE_HOME: home, ELEVENLABS_BASE_URL: `http://127.0.0.1:${EL_PORT}`, FAL_KEY: '', ELEVENLABS_API_KEY: '' }, extra), stdio: 'ignore',
});

(async () => {
  let child = start({ ELEVENLABS_API_KEY: 'k-test' });
  try {
    await waitUp();
    ok(JSON.parse((await call('GET', '/api/status')).text).voice.elevenlabs === true, 'état : clé ElevenLabs détectée');
    const v = await call('POST', '/api/voice/voices', {});
    const list = JSON.parse(v.text);
    ok(v.status === 200 && list.map((x) => x.name).join() === 'Alex,Zoé' && seen.keys.has('k-test'), 'liste des voix triée, clé envoyée à ElevenLabs par le serveur');
    ok((await call('POST', '/api/voice', '{"text":"x"}', { 'content-type': 'text/plain' })).status === 415, 'envoi « simple » inter-sites refusé (415)');
    ok((await call('POST', '/api/voice', { text: 'Bonjour', voice_id: '../etc', model_id: 'eleven_multilingual_v2' })).status === 400, 'identifiant de voix invalide refusé (400)');

    const body = { text: 'Bonjour à tous.', voice_id: 'ZoeVoice0123456789', model_id: 'eleven_multilingual_v2', settings: { stability: 0.48, similarity_boost: 0.75, style: 0.47, speed: 0.81 } };
    const a = await call('POST', '/api/voice', body);
    const ja = JSON.parse(a.text);
    ok(a.status === 200 && ja.cached === false && /^api\/voice\/file\/[a-f0-9]{24}\.mp3$/.test(ja.url) && seen.tts === 1, 'génération : un appel ElevenLabs, fichier renvoyé');
    ok(seen.last.body.voice_settings.stability === 0.48 && seen.last.body.voice_settings.speed === 0.81 && seen.last.body.model_id === 'eleven_multilingual_v2', 'réglages de voix transmis tels quels');
    ok(fs.existsSync(path.join(home, 'voices', ja.id + '.mp3')), 'le fichier vit dans le dossier de données');
    const b = await call('POST', '/api/voice', body);
    ok(JSON.parse(b.text).cached === true && JSON.parse(b.text).id === ja.id && seen.tts === 1, 'même demande : cache, aucun nouvel appel (aucun crédit)');
    const f = await call('GET', '/' + ja.url);
    ok(f.status === 200 && /audio\/mpeg/.test(f.type) && f.buf.toString().includes('Bonjour à tous.'), 'le fichier se lit par l’adresse renvoyée');
    ok((await call('GET', '/api/voice/file/' + 'a'.repeat(24) + '.mp3')).status === 404 && (await call('GET', '/api/voice/file/..%2F..%2Fserver.js')).status === 404, 'fichier inconnu ou chemin piégé : 404');
    const e = await call('POST', '/api/voice', Object.assign({}, body, { text: 'ERREUR volontaire' }));
    ok(e.status === 502 && /invalid api key/.test(e.text), 'erreur ElevenLabs : 502 avec son message');

    // voix imposée à la vidéo (H3) : le serveur fabrique le data URI avec les fichiers déjà générés
    await call('POST', '/api/voice', Object.assign({}, body, { text: 'Deuxième scène.' }));
    const refs = [{ text: body.text, voice_id: body.voice_id, model_id: body.model_id, settings: body.settings, label: 'scène 1' }, { text: 'Deuxième scène.', voice_id: body.voice_id, model_id: body.model_id, settings: body.settings, label: 'scène 2' }];
    const enc = (r) => 'lexinode-voice:' + Buffer.from(JSON.stringify(r)).toString('base64');
    const out = resolveVoiceRefs({ prompt: 'p', duration: 7, target_audio_url: enc(refs) });
    const raw = Buffer.from(out.target_audio_url.replace('data:audio/mpeg;base64,', ''), 'base64').toString();
    ok(out.prompt === 'p' && out.duration === 7 && raw.includes('Bonjour à tous.') && raw.includes('Deuxième scène.'), 'résolution de la voix : data URI = fichiers mis bout à bout, autres champs intacts');
    let msg = '';
    try { resolveVoiceRefs({ target_audio_url: enc([Object.assign({}, refs[0], { text: 'jamais générée', label: 'scène 9' })]) }); } catch (er) { msg = er.message; }
    ok(/Voix non générée pour « scène 9 »/.test(msg), 'voix absente : message clair, rien n’est envoyé');
    const vid = await call('POST', '/api/video/submit', { provider: 'fal', endpoint: 'x/y', keys: { fal: 'k' }, payload: { prompt: 'p', target_audio_url: enc([Object.assign({}, refs[0], { text: 'jamais générée' })]) } });
    ok(vid.status === 400 && /Voix non générée/.test(vid.text), 'envoi vidéo : refusé (400) tant que la voix n’est pas générée');
    ok(voiceId(voiceSpec(body)) === ja.id, 'l’empreinte du fichier est stable');
  } catch (err) {
    console.log('✕ test interrompu : ' + err.message);
    fails++;
  } finally {
    child.kill();
  }
  // sans clé
  child = start({});
  try {
    await new Promise((r) => setTimeout(r, 400));
    await waitUp();
    const r = await call('POST', '/api/voice', { text: 'Sans clé jamais vue', voice_id: 'ZoeVoice0123456789', model_id: 'eleven_multilingual_v2' });
    ok(r.status === 400 && /Aucune clé ElevenLabs/.test(r.text) && seen.tts === 3, 'sans clé : message clair, aucun appel ElevenLabs');
  } catch (err) {
    console.log('✕ essai sans clé interrompu : ' + err.message);
    fails++;
  } finally {
    child.kill();
    fake.close();
    await new Promise((r) => setTimeout(r, 200));
    fs.rmSync(path.dirname(home), { recursive: true, force: true });
  }
  console.log(fails ? `\n${fails} échec(s)` : '\nVoix off : tout est bon.');
  process.exit(fails ? 1 : 0);
})();
