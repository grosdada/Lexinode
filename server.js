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
  if (fs.existsSync(env)) return;
  const key = require('crypto').randomBytes(32).toString('hex');
  fs.writeFileSync(env, `# Données de cette installation de Lexinode.\n# LEXINODE_MASTER_KEY chiffre le coffre de clés : ne la changez pas, ne la partagez pas.\nLEXINODE_MASTER_KEY=${key}\n`, { mode: 0o600 });
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
  let cluster;
  try { cluster = await getJson(qbUrl() + '/api/cluster-status', 6000); } catch (e) {
    return { ok: false, qbuilder: qbUrl(), error: `Q-Builder ne répond pas sur ${qbUrl()} (${e.message}). Lancez-le avec le raccourci « Lancer Q-Builder », sur le même PC que ce serveur Lexinode.` };
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
  return { ok: true, qbuilder: qbUrl(), at: new Date().toISOString(), nodes };
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
      return send(res, 200, { ok: true, server: true, version: '1.1.0', providers, search: searchStatus, video, vault: VAULT.status(), voice: { elevenlabs: !!keyFor('elevenlabs') } });
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

module.exports = { server, readLexicons, llm, search, trustedBase, voiceSpec, voiceId, resolveVoiceRefs, renderStatus };
