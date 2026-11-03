#!/usr/bin/env node
/*
 * LEXINODE — serveur local sans dépendance (Node ≥ 18)
 *  - sert l'interface (public/)
 *  - proxy unifié vers les LLM : Claude (Anthropic), OpenAI (GPT / Codex), Google Gemini,
 *    Ollama (local) et tout serveur compatible OpenAI (LM Studio, llama.cpp, vLLM, LocalAI, OpenRouter, Mistral…)
 *  - recherche web pour les agents : SearXNG (open source), Wikipédia (sans clé), Tavily, Brave
 *    (+ recherche native de Claude, OpenAI et Gemini via le proxy LLM)
 *  - lexiques (data/lexicons + data/custom) et projets (projects/)
 *
 *  Lancement : node server.js   →   http://localhost:5177
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { URL } = require('url');

const ROOT = __dirname;
// Mode « PC » : LEXINODE_HOME = dossier de données de l'utilisateur (ex. %APPDATA%\Lexinode). Projets, lexiques perso,
// coffre et .env y vivent ; le dossier d'installation reste en lecture seule. Sans cette variable (VPS, Docker, dépôt),
// tout reste relatif au dossier de l'appli.
const HOME = process.env.LEXINODE_HOME ? path.resolve(process.env.LEXINODE_HOME) : '';
if (HOME) ensureHome(HOME);
loadEnv(path.join(HOME || ROOT, '.env'));
const P = require('./public/js/providers.js');

const PORT = Number(process.env.PORT || 5177);
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC = path.join(ROOT, 'public');
const LEX_DIRS = [path.join(ROOT, 'data', 'lexicons'), HOME ? path.join(HOME, 'custom') : path.join(ROOT, 'data', 'custom')];
const PROJECTS = HOME ? path.join(HOME, 'projects') : path.join(ROOT, 'projects');
const VOICES = HOME ? path.join(HOME, 'voices') : path.join(ROOT, 'data', 'voices'); // fichiers audio ElevenLabs déjà générés
const EXAMPLES = path.join(ROOT, 'data', 'examples');
const VERSION = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version; } catch (e) { return ''; } })();
const TOPICS = path.join(ROOT, 'data', 'topics');
// Coffre chiffré des clés saisies dans Réglages (actif seulement si LEXINODE_MASTER_KEY est défini)
const VAULT = require('./vault.js').create({
  file: process.env.LEXINODE_VAULT_FILE || (HOME ? path.join(HOME, 'vault', 'secrets.json') : path.join(ROOT, 'data', 'vault', 'secrets.json')),
  master: process.env.LEXINODE_MASTER_KEY,
});

// Clés et URL lues dans .env (l'interface peut aussi fournir les siennes)
const ENV_KEYS = {
  anthropic: () => process.env.ANTHROPIC_API_KEY,
  openai: () => process.env.OPENAI_API_KEY,
  gemini: () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
  deepseek: () => process.env.DEEPSEEK_API_KEY,
  ollama: () => '',
  compatible: () => process.env.COMPAT_API_KEY || '',
  tavily: () => process.env.TAVILY_API_KEY,
  fal: () => process.env.FAL_KEY,
  minimax: () => process.env.MINIMAX_API_KEY,
  dashscope: () => process.env.DASHSCOPE_API_KEY,
  brave: () => process.env.BRAVE_API_KEY,
  elevenlabs: () => process.env.ELEVENLABS_API_KEY,
};
// Ordre de résolution côté serveur : clé envoyée par le navigateur, puis coffre, puis .env
const keyFor = (id) => VAULT.get(id) || (ENV_KEYS[id] && ENV_KEYS[id]());
// Une clé du serveur (coffre ou .env) ne part que vers l'adresse prévue : une URL envoyée par le navigateur n'est suivie
// que si la clé vient aussi du navigateur, ou s'il n'y a aucune clé à protéger (Ollama, serveur local sans clé).
// Sans cette règle, quiconque a le mot de passe de l'appli pourrait faire envoyer la clé du coffre à son propre serveur.
const trustedBase = (ownKey, key, clientBase, serverBase) => ((ownKey || !key) ? (clientBase || serverBase) : serverBase);
const ENV_BASE = {
  ollama: () => process.env.OLLAMA_URL,
  compatible: () => process.env.COMPAT_BASE_URL,
  searxng: () => process.env.SEARXNG_URL,
};
const ENV_MODEL = {
  anthropic: () => process.env.ANTHROPIC_MODEL,
  openai: () => process.env.OPENAI_MODEL,
  gemini: () => process.env.GEMINI_MODEL,
  deepseek: () => process.env.DEEPSEEK_MODEL,
  ollama: () => process.env.OLLAMA_MODEL,
  compatible: () => process.env.COMPAT_MODEL,
  fal: () => process.env.FAL_LLM_MODEL,
};

// Premier lancement en mode PC : crée le dossier de données et un .env avec une clé maîtresse aléatoire pour le coffre
function ensureHome(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const env = path.join(dir, '.env');
  const key = () => crypto.randomBytes(32).toString('hex');
  const bridge = `# Pont vers le site en ligne : à coller dans Réglages du site (Pont vers Q-Builder). Ne la partagez pas.\nLEXINODE_BRIDGE_TOKEN=${key()}\n`;
  if (!fs.existsSync(env)) {
    fs.writeFileSync(env, `# Données de cette installation de Lexinode.\n# LEXINODE_MASTER_KEY chiffre le coffre de clés : ne la changez pas, ne la partagez pas.\nLEXINODE_MASTER_KEY=${key()}\n${bridge}`, { mode: 0o600 });
    return;
  }
  const cur = fs.readFileSync(env, 'utf8');
  if (!/^LEXINODE_BRIDGE_TOKEN=/m.test(cur)) fs.appendFileSync(env, (cur.endsWith('\n') ? '' : '\n') + bridge);
}

// ---------------------------------------------------------------- voix off (ElevenLabs, texte vers parole)
// Le serveur garde la clé et les fichiers : le navigateur ne voit jamais la clé. Un fichier est identifié par l'empreinte de sa demande
// (texte, voix, modèle, réglages) : redemander la même voix ne coûte aucun crédit.
const VOICE_ID_RE = /^[A-Za-z0-9]{10,40}$/;
const MODEL_RE = /^[a-z0-9_]{3,40}$/;
const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const elBase = () => String(process.env.ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io').replace(/\/$/, '');
function voiceSpec(b) {
  const text = String((b && b.text) || '').trim();
  if (!text) throw new Error('Texte vide');
  if (text.length > 5000) throw new Error('Texte trop long (5 000 caractères au plus par appel)');
  const voice_id = String(b.voice_id || '').trim();
  if (!VOICE_ID_RE.test(voice_id)) throw new Error('Identifiant de voix invalide : choisissez une voix du compte ElevenLabs');
  const model_id = String(b.model_id || 'eleven_multilingual_v2').trim();
  if (!MODEL_RE.test(model_id)) throw new Error('Modèle ElevenLabs invalide');
  const s = b.settings || {};
  const settings = { stability: clamp(s.stability, 0, 1, 0.5), similarity_boost: clamp(s.similarity_boost, 0, 1, 0.75), style: clamp(s.style, 0, 1, 0), use_speaker_boost: s.use_speaker_boost !== false, speed: clamp(s.speed, 0.7, 1.2, 1) };
  return { text, voice_id, model_id, settings };
}
const voiceId = (sp) => crypto.createHash('sha256').update(JSON.stringify([sp.text, sp.voice_id, sp.model_id, sp.settings])).digest('hex').slice(0, 24);
const voiceFile = (id) => path.join(VOICES, id + '.mp3');
async function elError(r) {
  let m = '';
  try { const j = await r.json(); m = (j.detail && (j.detail.message || j.detail)) || j.message || ''; } catch (e) { /* corps non JSON */ }
  return new Error(`ElevenLabs ${r.status} : ${typeof m === 'string' ? m : JSON.stringify(m)}`.trim());
}
async function synthVoice(body) {
  const spec = voiceSpec(body);
  const id = voiceId(spec);
  const file = voiceFile(id);
  if (fs.existsSync(file)) return { id, cached: true, bytes: fs.statSync(file).size };
  const key = (body.keys || {}).elevenlabs || keyFor('elevenlabs');
  if (!key) throw new Error('Aucune clé ElevenLabs : ajoutez-la dans Réglages (ou ELEVENLABS_API_KEY).');
  const r = await fetch(`${elBase()}/v1/text-to-speech/${spec.voice_id}?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text: spec.text, model_id: spec.model_id, voice_settings: spec.settings }), signal: AbortSignal.timeout(180000),
  });
  if (!r.ok) throw await elError(r);
  const buf = Buffer.from(await r.arrayBuffer());
  if (!buf.length) throw new Error('ElevenLabs a renvoyé un fichier vide');
  fs.mkdirSync(VOICES, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, file);
  return { id, cached: false, bytes: buf.length };
}
async function listVoices(body) {
  const key = ((body && body.keys) || {}).elevenlabs || keyFor('elevenlabs');
  if (!key) throw new Error('Aucune clé ElevenLabs : ajoutez-la dans Réglages (ou ELEVENLABS_API_KEY).');
  const r = await fetch(`${elBase()}/v1/voices`, { headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw await elError(r);
  const j = await r.json();
  return (j.voices || []).map((v) => ({ id: v.voice_id, name: v.name, category: v.category || '' })).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
// ---------------------------------------------------------------- suivi des rendus (Workflows Q-Builder → machines ComfyUI), lecture seule
// Q-Builder (127.0.0.1:8765 par défaut, QBUILDER_URL pour changer) connaît ses machines ; pour celles qui calculent, on lit la file de
// ComfyUI (GET /queue) afin de nommer les jobs. Aucun envoi, aucune annulation : seulement des GET, et seulement vers le réseau local.
const qbUrl = () => String(process.env.QBUILDER_URL || 'http://127.0.0.1:8765').replace(/\/$/, '');
const isLanHost = (h) => h === 'localhost' || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h.endsWith('.local');
async function getJson(url, ms) {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
const jobName = (item) => {
  const g = (item && item[2]) || {};
  for (const k of Object.keys(g)) { const p = g[k] && g[k].inputs && g[k].inputs.filename_prefix; if (typeof p === 'string') return p.split(/[\\/]/).pop(); }
  return '';
};
async function renderStatus() {
  const films = listFilms(outputDir());
  let cluster;
  try { cluster = await getJson(qbUrl() + '/api/cluster-status', 6000); } catch (e) {
    return { ok: false, qbuilder: qbUrl(), films, error: `Q-Builder ne répond pas sur ${qbUrl()} (${e.message}). Lancez-le avec le raccourci « Lancer Q-Builder », sur le même PC que ce serveur Lexinode.` };
  }
  const nodes = await Promise.all((cluster.nodes || []).map(async (n) => {
    const out = {
      name: n.name, url: n.url, auto: n.auto !== false, online: !!n.online, vramTotal: n.vram_total || 0, vramFree: n.vram_free || 0, running: n.running || 0, pending: n.pending || 0, jobs: [],
      gpu: String(n.gpu || '').replace(/^cuda:\d+\s*/i, '').replace(/\s*:\s*cuda\w*$/i, ''),
    };
    if (out.online && (out.running || out.pending)) {
      try {
        if (isLanHost(new URL(n.url).hostname)) {
          const q = await getJson(String(n.url).replace(/\/$/, '') + '/queue', 4000);
          out.jobs = (q.queue_running || []).map((it) => ({ id: it[1], state: 'running', name: jobName(it) })).concat((q.queue_pending || []).map((it) => ({ id: it[1], state: 'pending', name: jobName(it) })));
        }
      } catch (e) { out.jobsError = e.message; }
    }
    return out;
  }));
  return { ok: true, qbuilder: qbUrl(), at: new Date().toISOString(), nodes, films };
}

// ---------------------------------------------------------------- lancement des rendus (Workflows Q-Builder : queue_ltx_multishot.py)
// Le serveur fait ce que fait la commande PowerShell de Q-Builder : écrire le fichier de prompts puis lancer le même script, avec le même
// interpréteur, vers les machines ComfyUI. Garde-fous (règles de David) : réseau local seulement, jamais une machine occupée par le lot
// d'une autre session, VRAM vidée puis vérifiée avant de lancer, un prompt d'essai d'abord, un mode simulation (--dry-run, rien d'envoyé).
// La confirmation se fait dans l'interface ; JSON exigé ici contre les envois inter-sites « simples ».
const QB_WORKFLOWS = { h3: 'h3_t2v_api.json', ltx25: 'ltx25_t2v_api.json' };
const QB_ASPECTS = ['1:1 (Square)', '2:3 (Portrait Photo)', '3:2 (Photo)', '3:4 (Portrait Standard)', '4:3 (Standard)', '9:16 (Portrait Widescreen)', '16:9 (Widescreen)', '21:9 (Ultrawide)'];
const VRAM_READY = 0.85; // ~29 Go libres sur 34 : en dessous, le modèle déborde et le rendu est dix fois plus lent
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const gbText = (b) => (b / 1073741824).toFixed(1).replace('.', ',') + ' Go';

// Dossier des films : là où arrivent les rendus lancés d'ici. Par défaut « Output » à côté de l'application (le lanceur Windows le donne
// dans LEXINODE_OUTPUT_DEFAULT), sinon « Output » dans le dossier de données ; LEXINODE_OUTPUT le remplace. Vide hors version Windows.
const outputDir = () => String(process.env.LEXINODE_OUTPUT || process.env.LEXINODE_OUTPUT_DEFAULT || (HOME ? path.join(HOME, 'Output') : '')).trim();
const FILM_EXT = /\.(mp4|webm|mov|mkv)$/i;
function listFilms(dir) {
  const out = { dir, exists: false, count: 0, latest: [] };
  if (!dir) return out;
  const all = [];
  const walk = (d, depth) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (depth < 3) walk(p, depth + 1); } else if (FILM_EXT.test(e.name)) {
        try { const s = fs.statSync(p); all.push({ name: path.relative(dir, p), size: s.size, at: s.mtimeMs }); } catch (x) { /* disparu entre-temps */ }
      }
    }
  };
  out.exists = fs.existsSync(dir);
  if (out.exists) walk(dir, 0);
  all.sort((a, b) => b.at - a.at);
  out.count = all.length;
  out.latest = all.slice(0, 8);
  return out;
}
let qbBusy = false;

async function qbEnv() {
  let env;
  try { env = await getJson(qbUrl() + '/api/env', 6000); } catch (e) { throw new Error(`Q-Builder ne répond pas sur ${qbUrl()} (${e.message}). Le lancement demande Q-Builder sur le même PC que ce serveur Lexinode.`); }
  const root = String(env.root || '');
  if (!root || !path.isAbsolute(root) || !fs.existsSync(path.join(root, 'queue_ltx_multishot.py'))) throw new Error('Dossier de Q-Builder introuvable (queue_ltx_multishot.py absent).');
  return { root, python: env.python && fs.existsSync(env.python) ? env.python : 'python' };
}
async function machineProbe(n) {
  const base = String(n.url).replace(/\/$/, '');
  const out = { name: n.name, url: n.url, online: false, running: 0, pending: 0, vramTotal: 0, vramFree: 0 };
  try {
    const [q, s] = await Promise.all([getJson(base + '/queue', 5000), getJson(base + '/system_stats', 5000)]);
    const d = (s.devices || [])[0] || {};
    Object.assign(out, { online: true, running: (q.queue_running || []).length, pending: (q.queue_pending || []).length, vramTotal: d.vram_total || 0, vramFree: d.vram_free || 0 });
  } catch (e) { out.error = e.message; }
  return out;
}
async function freeMachine(url) {
  const r = await fetch(String(url).replace(/\/$/, '') + '/free', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ unload_models: true, free_memory: true }), signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
}
function qbCheck(b) {
  const engine = b.engine === 'ltx25' ? 'ltx25' : b.engine === 'h3' ? 'h3' : '';
  if (!engine) throw new Error('Moteur inconnu');
  const aspect = QB_ASPECTS.find((a) => a === b.aspect);
  if (!aspect) throw new Error('Format inconnu');
  if (!Array.isArray(b.groups) || !b.groups.length || b.groups.length > 20) throw new Error('Aucun lot à lancer');
  const seen = new Set();
  let total = 0;
  const groups = b.groups.map((g) => {
    const rows = (Array.isArray(g.rows) ? g.rows : []).map((r) => {
      const name = String(r.name || '');
      if (!/^[A-Za-z0-9_.-]{1,80}$/.test(name)) throw new Error(`Nom de plan invalide : ${name.slice(0, 40)}`);
      if (seen.has(name)) throw new Error(`Nom de plan en double : ${name}`);
      seen.add(name);
      const positive = String(r.positive || '').trim();
      if (!positive || positive.length > 20000) throw new Error(`Prompt vide ou trop long pour ${name}`);
      return { name, positive, seed: Number.isInteger(r.seed) && r.seed > 0 ? r.seed : Math.floor(Math.random() * 1e6) + 1 };
    });
    if (!rows.length || rows.length > 20) throw new Error('Un lot doit contenir de 1 à 20 prompts');
    total += rows.length;
    if (engine === 'h3') {
      const seconds = Number(g.seconds);
      if (!(seconds >= 1 && seconds <= 15)) throw new Error('Durée H3 : 1 à 15 s');
      return { seconds, rows };
    }
    const frames = Number(g.frames);
    if (!Number.isInteger(frames) || frames < 25 || frames > 481 || (frames - 1) % 8 !== 0) throw new Error('LTX 2.5 : nombre d’images de la forme 8n+1');
    return { frames, rows };
  });
  if (total > 60) throw new Error('Trop de prompts (60 au plus)');
  const copy = b.copy_results == null ? '' : String(b.copy_results).trim();
  if (copy.length > 300 || /[\0\r\n]/.test(copy)) throw new Error('Dossier de copie invalide');
  return {
    engine, aspect, groups, copy: copy || outputDir(), mode: ['dry', 'test', 'rest', 'all'].includes(b.mode) ? b.mode : 'test', mp: clamp(b.megapixels, 0.2, 2, engine === 'h3' ? 0.8 : 0.7),
    machines: Array.isArray(b.machines) ? b.machines.map(String) : null, freeMemory: b.free_memory !== false,
  };
}
function runScript(python, args, cwd, waitMs) {
  return new Promise((resolve) => {
    const child = spawn(python, args, { cwd, shell: false, windowsHide: true, env: Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8' }) });
    let out = '';
    const add = (c) => { out = (out + c).slice(-4000); };
    child.stdout.on('data', add);
    child.stderr.on('data', add);
    const timer = setTimeout(() => resolve({ exit: null, running: true, tail: out }), waitMs);
    child.on('close', (code) => { clearTimeout(timer); resolve({ exit: code, running: false, tail: out }); });
    child.on('error', (e) => { clearTimeout(timer); resolve({ exit: -1, running: false, tail: String(e.message) }); });
  });
}
async function qbRender(body) {
  const req = qbCheck(body);
  const env = await qbEnv();
  const workflow = QB_WORKFLOWS[req.engine];
  if (!fs.existsSync(path.join(env.root, workflow))) throw new Error(`Workflow introuvable dans Q-Builder : ${workflow}`);
  const cluster = await getJson(qbUrl() + '/api/cluster-status', 6000);
  const known = (cluster.nodes || []).filter((n) => n.online && n.auto !== false && isLanHost(new URL(n.url).hostname));
  const picked = req.machines ? known.filter((n) => req.machines.includes(n.url)) : known;
  if (!picked.length) throw new Error('Aucune machine utilisable : Q-Builder n’en connaît aucune en ligne parmi celles demandées.');
  const machines = await Promise.all(picked.map(machineProbe));
  const dry = req.mode === 'dry';
  const poll = Number(process.env.LEXINODE_FREE_POLL_MS) || 3000;
  for (const m of machines) {
    m.excluded = '';
    if (!m.online) { m.excluded = 'injoignable'; continue; }
    if (dry) continue;
    if (m.running || m.pending) { m.excluded = `occupée (${m.running} en calcul, ${m.pending} en attente) : on n’empile jamais un lot sur celui d’une autre session`; continue; }
    if (m.vramTotal && m.vramFree < VRAM_READY * m.vramTotal) {
      if (!req.freeMemory) { m.excluded = `VRAM presque pleine (${gbText(m.vramFree)} libres) et vidage non demandé`; continue; }
      try { await freeMachine(m.url); } catch (e) { m.excluded = 'vidage de la mémoire refusé : ' + e.message; continue; }
      m.freed = true;
      for (let i = 0; i < 20; i++) {
        await sleep(poll);
        const p = await machineProbe(m);
        Object.assign(m, { vramFree: p.vramFree, running: p.running, pending: p.pending });
        if (m.vramFree >= VRAM_READY * m.vramTotal) break;
      }
      if (m.vramFree < VRAM_READY * m.vramTotal) m.excluded = `VRAM encore presque pleine après le vidage (${gbText(m.vramFree)} libres sur ${gbText(m.vramTotal)})`;
    }
  }
  const view = machines.map((m) => ({ name: m.name, url: m.url, used: !m.excluded, freed: !!m.freed, reason: m.excluded, vramFree: m.vramFree, vramTotal: m.vramTotal }));
  const eligible = machines.filter((m) => !m.excluded);
  if (!eligible.length) { const e = new Error('Aucune machine disponible : ' + machines.map((m) => `${m.name} (${m.excluded})`).join(' ; ')); e.machines = view; e.noMachine = true; throw e; }

  let groups = req.groups.map((g) => Object.assign({}, g, { rows: g.rows.slice() }));
  if (req.mode === 'test') groups = [Object.assign({}, groups[0], { rows: groups[0].rows.slice(0, 1) })];
  if (req.mode === 'rest') {
    groups[0].rows.shift();
    groups = groups.filter((g) => g.rows.length);
    if (!groups.length) throw new Error('Il ne reste rien à lancer après le prompt d’essai.');
  }
  const dir = path.join(HOME ? path.join(HOME, 'qbuilder') : path.join(ROOT, 'data', 'qbuilder'), new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  const urls = eligible.map((m) => m.url);
  const runs = [];
  if (req.copy && !dry) { try { fs.mkdirSync(req.copy, { recursive: true }); } catch (e) { /* le script réessaiera */ } }
  for (const [i, g] of groups.entries()) {
    const file = path.join(dir, `prompts_${String(i + 1).padStart(2, '0')}.json`);
    fs.writeFileSync(file, JSON.stringify(g.rows.map((r) => ({ name: r.name, seed: r.seed, upscale_seed: 0, image: '', image_path: '', image_filename: '', positive: r.positive })), null, 2), 'utf8');
    const args = ['queue_ltx_multishot.py'].concat(urls.length > 1 ? ['--servers', urls.join(',')] : ['--server', urls[0]], ['--workflow', workflow, '--prompts', file],
      req.engine === 'h3' ? ['--duration-seconds', String(g.seconds)] : ['--frame-count', String(g.frames)], ['--aspect-ratio', req.aspect, '--megapixels', String(req.mp)]);
    if (req.copy && !dry) args.push('--copy-results', req.copy);
    if (dry) args.push('--dry-run');
    const r = await runScript(env.python, args, env.root, req.copy && !dry ? 45000 : 150000);
    runs.push({ prompts: g.rows.length, seconds: g.seconds, frames: g.frames, exit: r.exit, running: r.running, tail: r.tail.trim().split(/\r?\n/).slice(-8).join('\n') });
    if (r.exit) break; // une erreur (code non nul) : on n'empile pas la suite
  }
  const ok = runs.length === groups.length && runs.every((r) => !r.exit);
  try { fs.appendFileSync(path.join(dir, 'lancement.log'), JSON.stringify({ at: new Date().toISOString(), mode: req.mode, engine: req.engine, machines: view, runs }) + '\n'); } catch (e) { /* journal facultatif */ }
  return { ok, mode: req.mode, engine: req.engine, dir, output: dry ? '' : req.copy, machines: view, runs };
}

async function qbFree(body) {
  const url = String((body && body.url) || '');
  const cluster = await getJson(qbUrl() + '/api/cluster-status', 6000);
  const node = (cluster.nodes || []).find((n) => n.url === url && n.online && isLanHost(new URL(n.url).hostname));
  if (!node) throw new Error('Machine inconnue de Q-Builder, ou hors ligne.');
  const m = await machineProbe(node);
  if (!m.online) throw new Error(`${node.name} ne répond pas.`);
  if (m.running || m.pending) throw new Error(`${node.name} calcule (${m.running} en calcul, ${m.pending} en attente) : on ne vide pas la mémoire d'une machine occupée.`);
  await freeMachine(node.url);
  const poll = Number(process.env.LEXINODE_FREE_POLL_MS) || 3000;
  let p = m;
  for (let i = 0; i < 20; i++) {
    await sleep(poll);
    p = await machineProbe(node);
    if (p.vramFree >= VRAM_READY * p.vramTotal) break;
  }
  return { ok: true, name: node.name, vramFree: p.vramFree, vramTotal: p.vramTotal, ready: p.vramFree >= VRAM_READY * p.vramTotal };
}

// Ouvre le dossier des films (ou un film, avec le lecteur par défaut) dans l'Explorateur de ce PC. Le film doit être dans ce dossier.
function openOutput(body) {
  const dir = outputDir();
  if (!dir) throw new Error('Pas de dossier de films ici : cette fonction existe dans la version Windows.');
  fs.mkdirSync(dir, { recursive: true });
  let target = dir;
  const file = body && body.file ? String(body.file) : '';
  if (file) {
    const full = path.resolve(dir, file);
    if (!full.startsWith(path.resolve(dir) + path.sep) || !FILM_EXT.test(full) || !fs.existsSync(full)) throw new Error('Film introuvable dans le dossier des films.');
    target = full;
  }
  if (process.env.LEXINODE_NO_OPEN === '1') return { ok: true, dir, opened: target, simulated: true };
  if (process.platform !== 'win32') throw new Error('Ouverture automatique : Windows seulement.');
  spawn('explorer.exe', [target], { detached: true, stdio: 'ignore' }).unref();
  return { ok: true, dir, opened: target };
}

// ---------------------------------------------------------------- pont vers le site en ligne (version Windows seulement)
// Le site en ligne tourne chez Hostinger et ne voit pas ce PC. Son navigateur, lui, est sur ce PC : il peut parler à ce serveur local, à
// trois conditions. 1) l'origine est dans la liste autorisée (LEXINODE_BRIDGE_ORIGINS, par défaut le site) ; 2) la requête porte la clé du
// pont (LEXINODE_BRIDGE_TOKEN, créée à l'installation) ; 3) la route est une route Q-Builder. Rien d'autre n'est joignable de l'extérieur
// (ni projets, ni coffre, ni clé du pont). L'hôte est vérifié contre le « DNS rebinding ».
const bridgeOrigins = () => String(process.env.LEXINODE_BRIDGE_ORIGINS || 'https://lexinode.placenta.cloud').split(',').map((x) => x.trim()).filter(Boolean);
const BRIDGE_PATHS = /^\/api\/(qbuilder\/(status|render|free|open-output)|bridge\/ping)$/;
function sameSecret(a, b) { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }
function bridgeGuard(req, res) {
  if (!HOME) return false;
  const hostHeader = String(req.headers.host || '');
  const host = hostHeader.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) { send(res, 403, { error: 'Hôte refusé' }); return true; }
  const origin = req.headers.origin;
  if (!origin || origin === `http://${hostHeader}`) return false; // même origine (fenêtre Lexinode) ou outil local sans navigateur
  const p = new URL(req.url, 'http://localhost').pathname;
  const allowed = bridgeOrigins().includes(origin);
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    if (!allowed || !BRIDGE_PATHS.test(p)) { send(res, 403, { error: 'Origine refusée' }); return true; }
    res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Max-Age': '600' });
    res.end();
    return true;
  }
  if (!allowed || !BRIDGE_PATHS.test(p)) { send(res, 403, { error: 'Origine ou route refusée' }); return true; }
  const m = String(req.headers.authorization || '').match(/^Bearer (.+)$/);
  const token = process.env.LEXINODE_BRIDGE_TOKEN;
  if (!token || !m || !sameSecret(m[1], token)) { send(res, 401, { error: 'Clé du pont absente ou fausse : recopiez-la depuis Lexinode sur votre PC (icône près de l’horloge → « Copier la clé du pont »), dans Réglages → Pont vers Q-Builder.' }); return true; }
  return false;
}

// « lexinode-voice:<base64 d'un JSON> » dans un champ du corps vidéo (ex. target_audio_url) devient un data URI audio fait des fichiers de voix déjà générés
function resolveVoiceRefs(payload) {
  const out = Object.assign({}, payload);
  for (const [k, v] of Object.entries(out)) {
    if (typeof v !== 'string' || !v.startsWith('lexinode-voice:')) continue;
    let refs;
    try { refs = JSON.parse(Buffer.from(v.slice('lexinode-voice:'.length), 'base64').toString('utf8')); } catch (e) { throw new Error('Référence de voix illisible'); }
    if (!Array.isArray(refs) || !refs.length || refs.length > 20) throw new Error('Référence de voix invalide');
    const parts = refs.map((r) => {
      const f = voiceFile(voiceId(voiceSpec(r)));
      if (!fs.existsSync(f)) throw new Error(`Voix non générée pour « ${String(r.label || '').slice(0, 40)} » : générez-la d'abord dans le node Voice.`);
      return fs.readFileSync(f);
    });
    const buf = Buffer.concat(parts);
    if (buf.length > 14 * 1024 * 1024) throw new Error('Voix trop volumineuse (15 Mo au plus)');
    out[k] = 'data:audio/mpeg;base64,' + buf.toString('base64');
  }
  return out;
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
};

function send(res, status, body, type) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': type || 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(data);
}

function readBody(req, limit = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('Requête trop volumineuse')); req.destroy(); } else chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(new Error('JSON invalide')); }
    });
    req.on('error', reject);
  });
}

const safeName = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'sans-titre';

async function llm(body) {
  const prov = body.provider || 'anthropic';
  const own = (body.keys || {})[prov];
  const key = own || keyFor(prov);
  return P.callLLM({
    ...body,
    key,
    baseUrl: trustedBase(own, key, body.baseUrl, ENV_BASE[prov] && ENV_BASE[prov]()),
    model: body.model || (ENV_MODEL[prov] && ENV_MODEL[prov]()),
    fallbacks: process.env.ANTHROPIC_FALLBACKS !== 'off',
    ollamaCtx: process.env.OLLAMA_NUM_CTX,
    compatJsonMode: process.env.COMPAT_JSON_MODE !== 'off',
  });
}

async function search(body) {
  const keys = body.keys || {};
  const base = body.baseUrls || {};
  const has = {
    searxng: base.searxng || ENV_BASE.searxng(),
    tavily: keys.tavily || keyFor('tavily'),
    brave: keys.brave || keyFor('brave'),
  };
  const order = !body.provider || body.provider === 'auto'
    ? ['searxng', 'tavily', 'brave'].filter((k) => has[k]).concat('wikipedia')
    : [body.provider];
  let lastErr = null;
  for (const prov of order) {
    try {
      const results = await P.searchWith({
        provider: prov, query: body.query, lang: body.lang, count: body.count,
        key: prov === 'tavily' ? has.tavily : prov === 'brave' ? has.brave : undefined,
        baseUrl: prov === 'searxng' ? has.searxng : undefined,
      });
      if (results.length || order.length === 1) return { provider: prov, results };
    } catch (e) { lastErr = e; }
  }
  if (lastErr) throw lastErr;
  return { provider: 'aucun', results: [] };
}

function readLexicons() {
  const out = [];
  for (const dir of LEX_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
      try {
        const lx = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (dir === LEX_DIRS[1]) lx._custom = true;
        out.push(lx);
      } catch (e) {
        console.warn(`Lexique illisible ignoré : ${f} (${e.message})`);
      }
    }
  }
  return out;
}

function listDir(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
    const st = fs.statSync(path.join(dir, f));
    let title = f;
    let description = '';
    try {
      const g = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      title = (g.meta && g.meta.title) || f;
      description = (g.meta && g.meta.description) || '';
    } catch (e) { /* ignore */ }
    return { file: f, title, description, updated: st.mtime };
  }).sort((a, b) => b.updated - a.updated);
}

// Mot de passe facultatif (VPS) : LEXINODE_PASSWORD active une authentification HTTP Basic sur toute l'appli
function authorized(req) {
  const pass = process.env.LEXINODE_PASSWORD;
  if (!pass) return true;
  const m = String(req.headers.authorization || '').match(/^Basic (.+)$/);
  if (!m) return false;
  const [user, pwd] = Buffer.from(m[1], 'base64').toString().split(':');
  return pwd === pass && (!process.env.LEXINODE_USER || user === process.env.LEXINODE_USER);
}

const server = http.createServer(async (req, res) => {
  if (bridgeGuard(req, res)) return;
  if (!authorized(req)) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Lexinode", charset="UTF-8"', 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Authentification requise');
  }
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;
  try {
    if (p === '/api/status' && req.method === 'GET') {
      const providers = {};
      for (const [id, info] of Object.entries(P.INFO)) {
        providers[id] = {
          label: info.label,
          configured: id === 'ollama' ? true : id === 'compatible' ? !!ENV_BASE.compatible() : !!keyFor(id),
          defaultModel: (ENV_MODEL[id] && ENV_MODEL[id]()) || info.defaultModel,
          baseUrl: ENV_BASE[id] ? ENV_BASE[id]() || info.defaultBase : undefined,
        };
      }
      const video = { fal: !!keyFor('fal'), minimax: !!keyFor('minimax'), dashscope: !!keyFor('dashscope') };
      const searchStatus = {
        wikipedia: true, searxng: !!ENV_BASE.searxng(), tavily: !!keyFor('tavily'), brave: !!keyFor('brave'),
      };
      return send(res, 200, { ok: true, server: true, version: VERSION, providers, search: searchStatus, video, vault: VAULT.status(), voice: { elevenlabs: !!keyFor('elevenlabs') } });
    }
    // Coffre : écriture seulement (les valeurs ne sont jamais renvoyées). L'en-tête JSON exigé bloque les envois
    // inter-sites « simples » (un navigateur y joindrait le mot de passe déjà saisi).
    if (p === '/api/vault' && req.method === 'POST') {
      if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'Content-Type application/json requis' });
      if (!VAULT.enabled) return send(res, 503, { error: 'Coffre désactivé : définissez LEXINODE_MASTER_KEY dans .env (openssl rand -hex 32) puis relancez le serveur.', vault: VAULT.status() });
      try { return send(res, 200, VAULT.update(await readBody(req, 64 * 1024))); } catch (e) { return send(res, 400, { error: e.message, vault: VAULT.status() }); }
    }
    if (p === '/api/ollama/models' && req.method === 'GET') {
      const base = (url.searchParams.get('base') || ENV_BASE.ollama() || P.INFO.ollama.defaultBase).replace(/\/$/, '');
      const j = await P.fetchJSON(`${base}/api/tags`, {}, 8000);
      return send(res, 200, { models: (j.models || []).map((m) => m.name) });
    }
    if (p === '/api/llm' && req.method === 'POST') {
      const body = await readBody(req);
      const t0 = Date.now();
      const out = await llm(body);
      return send(res, 200, { ...out, ms: Date.now() - t0 });
    }
    if (p === '/api/search' && req.method === 'POST') return send(res, 200, await search(await readBody(req)));
    if ((p === '/api/video/submit' || p === '/api/video/status') && req.method === 'POST') {
      const body = await readBody(req);
      const own = (body.keys || {})[body.provider];
      const key = own || keyFor(body.provider);
      const fn = p.endsWith('submit') ? P.videoSubmit : P.videoStatus;
      let payload = body.payload;
      if (body.provider === 'fal' && payload) { try { payload = resolveVoiceRefs(payload); } catch (e) { return send(res, 400, { error: e.message }); } }
      return send(res, 200, await fn(Object.assign({}, body, { key, payload, baseUrl: trustedBase(own, key, body.baseUrl, undefined) })));
    }
    // Voix off : ces appels dépensent des crédits ElevenLabs, donc JSON exigé (comme /api/vault) contre les envois inter-sites « simples »
    if ((p === '/api/voice' || p === '/api/voice/voices') && req.method === 'POST') {
      if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'Content-Type application/json requis' });
      const body = await readBody(req, 64 * 1024);
      try {
        if (p === '/api/voice/voices') return send(res, 200, await listVoices(body));
        const r = await synthVoice(body);
        return send(res, 200, Object.assign(r, { url: `api/voice/file/${r.id}.mp3` }));
      } catch (e) { return send(res, /^ElevenLabs /.test(e.message) ? 502 : 400, { error: e.message }); }
    }
    if (p.startsWith('/api/voice/file/') && req.method === 'GET') {
      const m = p.match(/^\/api\/voice\/file\/([a-f0-9]{24})\.mp3$/);
      if (!m || !fs.existsSync(voiceFile(m[1]))) return send(res, 404, { error: 'Voix introuvable' });
      return send(res, 200, fs.readFileSync(voiceFile(m[1])), 'audio/mpeg');
    }
    if (p === '/api/qbuilder/status' && req.method === 'GET') return send(res, 200, await renderStatus());
    if (p === '/api/bridge/ping' && req.method === 'GET') {
      const st = await renderStatus();
      return send(res, 200, { ok: true, bridge: !!HOME, qbuilder: st.ok ? { ok: true, machines: st.nodes.length, online: st.nodes.filter((n) => n.online).length } : { ok: false, error: st.error } });
    }
    if (p === '/api/bridge/info' && req.method === 'GET') {
      if (!HOME) return send(res, 404, { error: 'Le pont n’existe que dans la version Windows.' });
      return send(res, 200, { token: process.env.LEXINODE_BRIDGE_TOKEN || '', origins: bridgeOrigins(), port: PORT });
    }
    if (p === '/api/qbuilder/free' && req.method === 'POST') {
      if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'Content-Type application/json requis' });
      const body = await readBody(req, 64 * 1024);
      try { return send(res, 200, await qbFree(body)); } catch (e) { return send(res, 400, { error: e.message }); }
    }
    if (p === '/api/qbuilder/open-output' && req.method === 'POST') {
      if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'Content-Type application/json requis' });
      const body = await readBody(req, 64 * 1024);
      try { return send(res, 200, openOutput(body)); } catch (e) { return send(res, 400, { error: e.message }); }
    }
    if (p === '/api/qbuilder/render' && req.method === 'POST') {
      if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'Content-Type application/json requis' });
      const body = await readBody(req, 4 * 1024 * 1024);
      if (qbBusy) return send(res, 409, { error: 'Un lancement est déjà en cours : attendez sa fin.' });
      qbBusy = true;
      try { return send(res, 200, await qbRender(body)); } catch (e) { return send(res, e.noMachine ? 409 : 400, { error: e.message, machines: e.machines }); } finally { qbBusy = false; }
    }
    if (p === '/api/lexicons' && req.method === 'GET') return send(res, 200, readLexicons());
    if (p === '/api/topics' && req.method === 'GET') {
      const parts = fs.existsSync(TOPICS) ? fs.readdirSync(TOPICS).filter((f) => f.endsWith('.json')).sort().map((f) => {
        try { return JSON.parse(fs.readFileSync(path.join(TOPICS, f), 'utf8')); } catch (e) { console.warn(`Banque de topics illisible : ${f}`); return null; }
      }).filter(Boolean) : [];
      return send(res, 200, parts);
    }
    if (p === '/api/lexicons' && req.method === 'POST') {
      const lx = await readBody(req);
      if (!lx || !lx.id || !lx.nom) throw new Error('Lexique invalide : "id" et "nom" requis');
      lx.id = safeName(lx.id);
      delete lx._custom;
      fs.mkdirSync(LEX_DIRS[1], { recursive: true });
      fs.writeFileSync(path.join(LEX_DIRS[1], `${lx.id}.json`), JSON.stringify(lx, null, 2));
      return send(res, 200, { ok: true, id: lx.id });
    }
    if (p === '/api/projects' && req.method === 'GET') {
      return send(res, 200, { projects: listDir(PROJECTS), examples: listDir(EXAMPLES) });
    }
    if (p.startsWith('/api/projects/') && req.method === 'GET') {
      const name = path.basename(decodeURIComponent(p.slice('/api/projects/'.length)));
      const file = path.join(url.searchParams.get('example') ? EXAMPLES : PROJECTS, name);
      if (!fs.existsSync(file)) return send(res, 404, { error: 'Projet introuvable' });
      return send(res, 200, fs.readFileSync(file, 'utf8'));
    }
    if (p === '/api/projects' && req.method === 'POST') {
      const graph = await readBody(req);
      const name = `${safeName(graph.meta && graph.meta.title)}.json`;
      fs.mkdirSync(PROJECTS, { recursive: true });
      fs.writeFileSync(path.join(PROJECTS, name), JSON.stringify(graph, null, 2));
      return send(res, 200, { ok: true, file: name });
    }
    if (p.startsWith('/api/')) return send(res, 404, { error: 'Route inconnue' });

    const rel = p === '/' ? 'index.html' : decodeURIComponent(p).replace(/^\/+/, '');
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC)) return send(res, 403, 'Interdit', 'text/plain');
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'Introuvable', 'text/plain');
    return send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream');
  } catch (e) {
    console.error(`[${p}]`, e.message);
    return send(res, e.status ? 502 : 500, { error: e.message });
  }
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    const lex = readLexicons();
    console.log(`\n  LEXINODE  ▸  http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    console.log(`  ${lex.length} lexique(s) chargé(s)\n`);
    const v = VAULT.status();
    console.log(`  · Coffre de clés : ${v.locked ? 'ILLISIBLE — ' + v.error : v.enabled ? `actif (${v.keys.length} clé(s) enregistrée(s))` : v.error ? 'désactivé — ' + v.error : 'désactivé (définir LEXINODE_MASTER_KEY dans .env pour l’activer)'}\n`);
    const origin = (id) => (VAULT.get(id) ? 'coffre' : '.env');
    for (const [id, info] of Object.entries(P.INFO)) {
      const state = id === 'fal' ? (keyFor('fal') ? `clé ✓ (${origin('fal')})` : 'pas de clé') : id === 'ollama' ? `local · ${ENV_BASE.ollama() || info.defaultBase}`
        : id === 'compatible' ? (ENV_BASE.compatible() ? `local · ${ENV_BASE.compatible()}` : 'non configuré')
          : keyFor(id) ? `clé ✓ (${origin(id)})` : 'pas de clé (.env ou Réglages)';
      console.log(`  · ${info.label.padEnd(62)} ${state}`);
    }
    console.log(`  · Recherche : Wikipédia${ENV_BASE.searxng() ? ' · SearXNG' : ''}${keyFor('tavily') ? ' · Tavily' : ''}${keyFor('brave') ? ' · Brave' : ''}\n`);
    // Lancé par Lexinode.exe : on s'arrête quand le lanceur disparaît (fermeture brutale comprise), sans laisser de serveur orphelin
    const parent = Number(process.env.LEXINODE_PARENT_PID);
    if (parent) setInterval(() => { try { process.kill(parent, 0); } catch (e) { if (e.code === 'ESRCH') process.exit(0); } }, 3000).unref();
  });
}

module.exports = { server, readLexicons, llm, search, trustedBase, voiceSpec, voiceId, resolveVoiceRefs, renderStatus, qbRender, qbFree, openOutput, listFilms, outputDir };
