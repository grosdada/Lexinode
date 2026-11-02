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
const { URL } = require('url');

const ROOT = __dirname;
loadEnv(path.join(ROOT, '.env'));
const P = require('./public/js/providers.js');

const PORT = Number(process.env.PORT || 5177);
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC = path.join(ROOT, 'public');
const LEX_DIRS = [path.join(ROOT, 'data', 'lexicons'), path.join(ROOT, 'data', 'custom')];
const PROJECTS = path.join(ROOT, 'projects');
const EXAMPLES = path.join(ROOT, 'data', 'examples');
const TOPICS = path.join(ROOT, 'data', 'topics');
// Coffre chiffré des clés saisies dans Réglages (actif seulement si LEXINODE_MASTER_KEY est défini)
const VAULT = require('./vault.js').create({
  file: process.env.LEXINODE_VAULT_FILE || path.join(ROOT, 'data', 'vault', 'secrets.json'),
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
      return send(res, 200, { ok: true, server: true, version: '1.1.0', providers, search: searchStatus, video, vault: VAULT.status() });
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
      return send(res, 200, await fn(Object.assign({}, body, { key, baseUrl: trustedBase(own, key, body.baseUrl, undefined) })));
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
  });
}

module.exports = { server, readLexicons, llm, search, trustedBase };
