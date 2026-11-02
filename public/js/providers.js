/*
 * LEXINODE — appels LLM et recherche web, partagés entre le serveur Node et le navigateur.
 * Toutes les fonctions reçoivent des paramètres déjà résolus (clé, URL de base…).
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.LX = root.LX || {}; root.LX.providers = mod; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const INFO = {
    anthropic: {
      label: 'Claude (Anthropic)', needsKey: true, search: true,
      defaultModel: 'claude-opus-5-5',
      models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'],
    },
    openai: {
      label: 'OpenAI (GPT / Codex)', needsKey: true, search: true,
      defaultModel: 'gpt-5',
      models: ['gpt-5', 'gpt-5-mini', 'gpt-5-codex'],
    },
    gemini: {
      label: 'Google Gemini', needsKey: true, search: true,
      defaultModel: 'gemini-2.5-pro',
      models: ['gemini-2.5-pro', 'gemini-2.5-flash'],
    },
    fal: {
      label: 'fal.ai (LLM via OpenRouter, même clé que la vidéo)', needsKey: true, search: false,
      defaultModel: 'google/gemini-2.5-flash', defaultBase: 'https://fal.run/openrouter/router/openai/v1',
      models: ['google/gemini-2.5-flash', 'openai/gpt-5-mini', 'anthropic/claude-sonnet-4.5'],
    },
    ollama: {
      label: 'Ollama (local, open source)', needsKey: false, search: false,
      defaultModel: 'qwen3:14b', defaultBase: 'http://127.0.0.1:11434',
      models: ['qwen3:14b', 'qwen3:30b', 'mistral-small3.2', 'gemma3:12b', 'llama3.3'],
    },
    compatible: {
      label: 'Compatible OpenAI (LM Studio, llama.cpp, vLLM, OpenRouter…)', needsKey: false, search: false,
      defaultModel: 'local-model', defaultBase: 'http://127.0.0.1:1234/v1',
      models: [],
    },
  };

  const SEARCH_INFO = {
    wikipedia: { label: 'Wikipédia (sans clé)', needsKey: false },
    searxng: { label: 'SearXNG (open source, auto-hébergé)', needsKey: false, defaultBase: 'http://127.0.0.1:8888' },
    tavily: { label: 'Tavily', needsKey: true },
    brave: { label: 'Brave Search', needsKey: true },
  };

  async function fetchJSON(url, opts, timeoutMs) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs || 180000);
    try {
      const r = await fetch(url, Object.assign({}, opts || {}, { signal: ctrl.signal }));
      const text = await r.text();
      let json = null;
      try { json = JSON.parse(text); } catch (e) { /* texte brut */ }
      if (!r.ok) {
        const e = json && (json.error || json.message);
        const msg = (e && (e.message || (typeof e === 'string' ? e : JSON.stringify(e)))) || text.slice(0, 400);
        const err = new Error(r.status + ' ' + msg);
        err.status = r.status;
        throw err;
      }
      return json !== null ? json : text;
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('Délai dépassé (' + Math.round((timeoutMs || 180000) / 1000) + ' s)');
      if (e instanceof TypeError && /fetch/i.test(e.message)) {
        throw new Error('Connexion impossible à ' + safeHost(url) + ' (serveur arrêté, réseau ou CORS)');
      }
      throw e;
    } finally {
      clearTimeout(t);
    }
  }

  function safeHost(u) { try { return new URL(u).host; } catch (e) { return u; } }

  function dedupe(sources) {
    const seen = new Set();
    return sources.filter((s) => s && s.url && !seen.has(s.url) && seen.add(s.url));
  }

  /**
   * Appel LLM unifié.
   * p = { provider, model, key, baseUrl, system, prompt | messages, json, search, maxTokens, effort,
   *       browser (bool), fallbacks (bool), ollamaCtx, compatJsonMode }
   * → { text, sources:[{title,url}], model, provider, usage }
   */
  async function callLLM(p) {
    const provider = p.provider || 'anthropic';
    const info = INFO[provider];
    if (!info) throw new Error('Fournisseur inconnu : ' + provider);
    const key = p.key;
    if (info.needsKey && !key) throw new Error('Clé API manquante pour ' + info.label + ' (fichier .env ou Réglages)');
    const model = p.model || info.defaultModel;
    const messages = p.messages || [{ role: 'user', content: p.prompt || '' }];
    const maxTokens = Math.min(Number(p.maxTokens) || 8000, 32000);
    const system = (p.system || '') + (p.json ? '\n\nRéponds UNIQUEMENT avec un objet JSON valide, sans texte autour ni balises de code.' : '');

    if (provider === 'anthropic') {
      const body = {
        model: model,
        max_tokens: Math.max(maxTokens, 4000),
        system: system,
        messages: messages,
        thinking: { type: 'adaptive' },
        output_config: { effort: p.effort || 'medium' },
      };
      const headers = { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2026-10-21' };
      if (p.browser) headers['anthropic-dangerous-direct-browser-access'] = 'true';
      // Repli côté serveur si les classifieurs de sécurité refusent (modèles Claude 5.x récents)
      if (p.fallbacks !== false && /^claude-(opus-5|sonnet-5-5|fable-5)/.test(model)) {
        body.fallbacks = 'default';
        headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
      }
      // variante « filtrage dynamique » sur Opus / Sonnet récents, variante de base sinon (Haiku, autres)
      if (p.search) body.tools = [{ type: /^claude-(opus|sonnet)-/.test(model) ? 'web_search_20260209' : 'web_search_20250305', name: 'web_search', max_uses: 6 }];
      const j = await fetchJSON('https://api.anthropic.com/v1/messages', { method: 'POST', headers: headers, body: JSON.stringify(body) }, 300000);
      if (j.stop_reason === 'refusal') throw new Error('Le modèle a refusé la requête (refusal).');
      let text = '';
      const sources = [];
      for (const b of j.content || []) {
        if (b.type === 'text') {
          text += b.text;
          for (const c of b.citations || []) if (c.url) sources.push({ title: c.title || c.url, url: c.url });
        } else if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
          for (const r of b.content) if (r.url) sources.push({ title: r.title || r.url, url: r.url });
        }
      }
      return { text: text, sources: dedupe(sources), model: j.model || model, provider: provider, usage: j.usage };
    }

    if (provider === 'openai') {
      // API « Responses » : GPT-5, modèles Codex, outil web_search
      const body = {
        model: model,
        instructions: system,
        input: messages.map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) })),
        max_output_tokens: Math.max(maxTokens, 4000),
      };
      if (p.search) body.tools = [{ type: 'web_search' }];
      const j = await fetchJSON('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
        body: JSON.stringify(body),
      }, 300000);
      let text = typeof j.output_text === 'string' ? j.output_text : '';
      const sources = [];
      for (const item of j.output || []) {
        if (item.type !== 'message') continue;
        for (const c of item.content || []) {
          if (c.type !== 'output_text') continue;
          if (!j.output_text) text += c.text;
          for (const a of c.annotations || []) if (a.url) sources.push({ title: a.title || a.url, url: a.url });
        }
      }
      return { text: text, sources: dedupe(sources), model: j.model || model, provider: provider, usage: j.usage };
    }

    if (provider === 'gemini') {
      const body = {
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content) }] })),
        generationConfig: { maxOutputTokens: Math.max(maxTokens, 4000) },
      };
      if (p.search) body.tools = [{ google_search: {} }];
      else if (p.json) body.generationConfig.responseMimeType = 'application/json';
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
      const j = await fetchJSON(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
      }, 300000);
      const cand = (j.candidates || [])[0] || {};
      const text = ((cand.content && cand.content.parts) || []).map((x) => x.text || '').join('');
      const chunks = (cand.groundingMetadata && cand.groundingMetadata.groundingChunks) || [];
      const sources = chunks.map((g) => g.web).filter(Boolean).map((w) => ({ title: w.title || w.uri, url: w.uri }));
      return { text: text, sources: dedupe(sources), model: model, provider: provider, usage: j.usageMetadata };
    }

    if (provider === 'ollama') {
      const base = String(p.baseUrl || info.defaultBase).replace(/\/$/, '');
      const body = {
        model: model,
        messages: [{ role: 'system', content: system }].concat(messages),
        stream: false,
        options: { num_predict: maxTokens, num_ctx: Number(p.ollamaCtx || 16384) },
      };
      if (p.json) body.format = 'json';
      const j = await fetchJSON(base + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, 900000);
      let text = (j.message && j.message.content) || '';
      text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim(); // modèles « raisonneurs » (qwen3, deepseek-r1…)
      return { text: text, sources: [], model: model, provider: provider, usage: { input_tokens: j.prompt_eval_count, output_tokens: j.eval_count } };
    }

    if (provider === 'compatible' || provider === 'fal') {
      const base = String((provider === 'compatible' && p.baseUrl) || info.defaultBase).replace(/\/$/, '');
      const body = { model: model, messages: [{ role: 'system', content: system }].concat(messages), max_tokens: maxTokens };
      if (p.json && p.compatJsonMode !== false) body.response_format = { type: 'json_object' };
      const headers = { 'content-type': 'application/json' };
      if (key && key !== 'none') headers.authorization = (provider === 'fal' ? 'Key ' : 'Bearer ') + key;
      let j;
      try {
        j = await fetchJSON(base + '/chat/completions', { method: 'POST', headers: headers, body: JSON.stringify(body) }, 900000);
      } catch (e) {
        if (!body.response_format) throw e;
        delete body.response_format; // certains serveurs locaux ne gèrent pas response_format
        j = await fetchJSON(base + '/chat/completions', { method: 'POST', headers: headers, body: JSON.stringify(body) }, 900000);
      }
      let text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
      text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      return { text: text, sources: [], model: j.model || model, provider: provider, usage: j.usage };
    }
    throw new Error('Fournisseur non géré : ' + provider);
  }

  /**
   * Recherche web avec un moteur donné.
   * p = { provider, query, lang, count, key, baseUrl, browser }
   */
  async function searchWith(p) {
    const query = p.query;
    const lang = p.lang || 'fr';
    const count = p.count || 6;
    if (!query) throw new Error('Requête vide');
    if (p.provider === 'searxng') {
      const base = String(p.baseUrl || SEARCH_INFO.searxng.defaultBase).replace(/\/$/, '');
      const j = await fetchJSON(base + '/search?format=json&language=' + lang + '&q=' + encodeURIComponent(query), {}, 30000);
      return (j.results || []).slice(0, count).map((r) => ({ title: r.title, url: r.url, snippet: r.content || '' }));
    }
    if (p.provider === 'tavily') {
      const j = await fetchJSON('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + p.key },
        body: JSON.stringify({ query: query, max_results: count, search_depth: 'advanced' }),
      }, 45000);
      return (j.results || []).map((r) => ({ title: r.title, url: r.url, snippet: r.content || '' }));
    }
    if (p.provider === 'brave') {
      const j = await fetchJSON('https://api.search.brave.com/res/v1/web/search?count=' + count + '&q=' + encodeURIComponent(query), {
        headers: { accept: 'application/json', 'x-subscription-token': p.key },
      }, 30000);
      return ((j.web && j.web.results) || []).map((r) => ({ title: r.title, url: r.url, snippet: String(r.description || '').replace(/<[^>]+>/g, '') }));
    }
    if (p.provider === 'wikipedia') {
      const out = [];
      const langs = lang === 'en' ? ['en'] : [lang, 'en'];
      for (const lg of langs) {
        const api = 'https://' + lg + '.wikipedia.org/w/api.php?action=query&list=search&format=json&utf8=1&origin=*&srlimit=' + count + '&srsearch=' + encodeURIComponent(query);
        const headers = p.browser ? {} : { 'user-agent': 'Lexinode/1.0 (outil local)' };
        const j = await fetchJSON(api, { headers: headers }, 20000);
        for (const r of (j.query && j.query.search) || []) {
          out.push({
            title: r.title + ' (Wikipédia ' + lg + ')',
            url: 'https://' + lg + '.wikipedia.org/wiki/' + encodeURIComponent(r.title.replace(/ /g, '_')),
            snippet: String(r.snippet).replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&'),
          });
        }
        if (out.length >= count) break;
      }
      return out.slice(0, count);
    }
    throw new Error('Moteur de recherche inconnu : ' + p.provider);
  }

  // ------------------------------------------------------------------ génération vidéo
  // fal.ai (file d'attente) · MiniMax (H3, direct) · DashScope (Wan 3.0, direct)
  const VIDEO = {
    fal: { label: 'fal.ai', needsKey: true },
    minimax: { label: 'MiniMax (H3, direct)', needsKey: true, base: 'https://api.minimax.io' },
    dashscope: { label: 'Alibaba DashScope (Wan 3.0, direct)', needsKey: true, base: 'https://dashscope-intl.aliyuncs.com' },
  };
  /** p = { provider, key, endpoint (fal), payload } → { provider, id, status_url, response_url } */
  async function videoSubmit(p) {
    if (!p.key) throw new Error('Clé API manquante pour ' + ((VIDEO[p.provider] || {}).label || p.provider) + ' (Réglages ou .env).');
    if (p.provider === 'fal') {
      if (!p.endpoint) throw new Error('Identifiant du modèle sur fal.ai manquant (Réglages → Génération vidéo).');
      const ep = String(p.endpoint).replace(/^https?:\/\/(queue\.)?fal\.(run|ai)\//, '').replace(/^\/+/, '');
      const j = await fetchJSON(String(p.baseUrl || 'https://queue.fal.run').replace(/\/$/, '') + '/' + ep, { method: 'POST', headers: { authorization: 'Key ' + p.key, 'content-type': 'application/json' }, body: JSON.stringify(p.payload) }, 60000);
      return { provider: 'fal', id: j.request_id, status_url: j.status_url, response_url: j.response_url };
    }
    if (p.provider === 'minimax') {
      const base = p.baseUrl || VIDEO.minimax.base;
      const j = await fetchJSON(base + '/v2/video_generation', { method: 'POST', headers: { authorization: 'Bearer ' + p.key, 'content-type': 'application/json' }, body: JSON.stringify(p.payload) }, 60000);
      const id = j.task_id || (j.data && j.data.task_id) || j.id;
      if (!id) throw new Error('MiniMax : pas de task_id dans la réponse (' + JSON.stringify(j).slice(0, 200) + ')');
      return { provider: 'minimax', id: id };
    }
    if (p.provider === 'dashscope') {
      const base = p.baseUrl || VIDEO.dashscope.base;
      const j = await fetchJSON(base + '/api/v1/services/aigc/video-generation/video-synthesis', {
        method: 'POST', headers: { authorization: 'Bearer ' + p.key, 'content-type': 'application/json', 'X-DashScope-Async': 'enable' }, body: JSON.stringify(p.payload),
      }, 60000);
      const id = j.output && j.output.task_id;
      if (!id) throw new Error('DashScope : pas de task_id dans la réponse (' + JSON.stringify(j).slice(0, 200) + ')');
      return { provider: 'dashscope', id: id };
    }
    throw new Error('Passerelle vidéo inconnue : ' + p.provider);
  }
  // cherche une URL de vidéo dans une réponse quelconque
  function findVideoUrl(o) {
    if (!o || typeof o !== 'object') return null;
    if (o.video && typeof o.video === 'object' && o.video.url) return o.video.url;
    for (const k of ['video_url', 'url', 'download_url']) if (typeof o[k] === 'string' && /^https?:/.test(o[k])) return o[k];
    for (const v of Object.values(o)) { const u = typeof v === 'object' ? findVideoUrl(v) : null; if (u) return u; }
    return null;
  }
  /** p = { provider, key, id, status_url, response_url } → { state: 'queued'|'running'|'done'|'error', url, error, raw } */
  async function videoStatus(p) {
    if (p.provider === 'fal') {
      const auth = { headers: { authorization: 'Key ' + p.key } };
      const s = await fetchJSON(p.status_url + (p.status_url.includes('?') ? '&' : '?') + 'logs=0', auth, 30000);
      if (s.status === 'COMPLETED') {
        const r = await fetchJSON(p.response_url, auth, 30000);
        const url = findVideoUrl(r);
        return url ? { state: 'done', url: url, raw: r } : { state: 'error', error: 'Réponse sans vidéo : ' + JSON.stringify(r).slice(0, 200) };
      }
      if (s.status === 'IN_QUEUE') return { state: 'queued', position: s.queue_position };
      if (s.status === 'IN_PROGRESS') return { state: 'running' };
      return { state: 'error', error: 'Statut fal inattendu : ' + JSON.stringify(s).slice(0, 200) };
    }
    if (p.provider === 'minimax') {
      const base = p.baseUrl || VIDEO.minimax.base;
      const j = await fetchJSON(base + '/v2/query/video_generation/' + encodeURIComponent(p.id), { headers: { authorization: 'Bearer ' + p.key } }, 30000);
      const t = j.task || j.data || j;
      const st = String(t.status || '').toLowerCase();
      if (st === 'succeeded' || st === 'success') return { state: 'done', url: (t.content && t.content.url) || findVideoUrl(t), raw: j };
      if (st === 'failed' || st === 'fail') return { state: 'error', error: t.error || t.message || 'échec MiniMax' };
      return { state: st === 'queueing' || st === 'pending' ? 'queued' : 'running' };
    }
    if (p.provider === 'dashscope') {
      const base = p.baseUrl || VIDEO.dashscope.base;
      const j = await fetchJSON(base + '/api/v1/tasks/' + encodeURIComponent(p.id), { headers: { authorization: 'Bearer ' + p.key } }, 30000);
      const o = j.output || {};
      if (o.task_status === 'SUCCEEDED') return { state: 'done', url: o.video_url || findVideoUrl(o), raw: j };
      if (o.task_status === 'FAILED' || o.task_status === 'CANCELED' || o.task_status === 'UNKNOWN') return { state: 'error', error: o.message || o.code || o.task_status };
      return { state: o.task_status === 'PENDING' ? 'queued' : 'running' };
    }
    throw new Error('Passerelle vidéo inconnue : ' + p.provider);
  }

  return { INFO: INFO, SEARCH_INFO: SEARCH_INFO, VIDEO: VIDEO, callLLM: callLLM, searchWith: searchWith, fetchJSON: fetchJSON, videoSubmit: videoSubmit, videoStatus: videoStatus };
});
