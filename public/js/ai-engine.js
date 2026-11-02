/*
 * LEXINODE — agents IA.
 * Chaque type de node a un agent (rôle) avec son prompt ; chaque rôle peut être routé vers un fournisseur différent
 * (ex. chercheur = Gemini + Google Search, rédacteur = Claude, scénariste = Ollama local).
 * Les sorties IA sont normalisées au même format que le moteur local : l'interface et l'aval ne voient pas la différence.
 */
(function (LX) {
  'use strict';
  const U = LX.U;
  const C = LX.content;
  const H = LX.localHelpers;

  const ROLES = {
    chercheur: { label: 'Chercheur de données', ico: 'search', nodes: ['donnee'] },
    analyste: { label: 'Analyste (comparaisons, corrélations)', ico: 'scales', nodes: ['comparaison', 'correlation'] },
    redacteur: { label: 'Rédacteur (réflexion)', ico: 'pen', nodes: ['reflexion'] },
    traducteur: { label: 'Traducteur de langages', ico: 'prism', nodes: ['prisme', 'decodeur'] },
    debatteur: { label: 'Animateur de table ronde', ico: 'debate', nodes: ['debat'] },
    specialiste: { label: 'Agents spécialistes', ico: 'robot', nodes: ['agent'] },
    scenariste: { label: 'Scénariste (short animé, prompts vidéo)', ico: 'film', nodes: ['short', 'generateur'] },
  };
  const ROLE_OF = {};
  for (const [r, def] of Object.entries(ROLES)) for (const n of def.nodes) ROLE_OF[n] = r;

  const BASE_SYSTEM = `Tu es un agent de LEXINODE, un atelier nodal qui fabrique des raisonnements à partir des « éléments de langage » de différents corps de métier (politique, médecine, mode, audiovisuel…) et de grilles de lecture sociologiques.
Règles permanentes :
- Écris en français, avec précision et sens du rythme.
- N'invente jamais de source, d'URL ni de citation attribuée à une personne réelle.
- Distingue toujours ce qui est sourcé, estimé ou fictif ; signale les estimations.
- Une corrélation n'est pas une causalité : dis-le quand c'est pertinent.
- Quand on te fournit une « charte d'éléments de langage », imprègne-toi de son vocabulaire, de ses formules, de ses tournures et de sa posture, sans caricaturer (sauf si l'intention est satirique).`;

  // ------------------------------------------------------------------ transport
  function routeFor(role) {
    const s = LX.settings;
    const r = (s.roles && s.roles[role]) || {};
    const provider = r.provider || s.provider || 'anthropic';
    return { provider, model: r.model || (provider === s.provider ? s.model : '') || '', search: r.search !== false };
  }
  function providerKey(provider) {
    return (LX.settings.keys || {})[provider] || '';
  }

  async function call(role, req, ctx) {
    const route = routeFor(role);
    const s = LX.settings;
    const t0 = performance.now();
    const label = ROLES[role] ? ROLES[role].label : role;
    const logId = ctx && ctx.log ? ctx.log({ node: ctx.nodeTitle, role: label, provider: route.provider, model: route.model || 'défaut', state: 'running' }) : null;
    try {
      const body = {
        provider: route.provider, model: route.model || undefined, system: BASE_SYSTEM + '\n\n' + (req.system || ''),
        prompt: req.prompt, json: req.json !== false, search: !!req.search, maxTokens: req.maxTokens || 8000, effort: s.effort || 'medium',
      };
      let out;
      if (LX.api.server) {
        const keys = {};
        if (providerKey(route.provider)) keys[route.provider] = providerKey(route.provider);
        const base = (s.baseUrls || {})[route.provider];
        const r = await fetch('api/llm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign(body, { keys, baseUrl: base || undefined })) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Erreur serveur');
        out = j;
      } else {
        out = await LX.providers.callLLM(Object.assign(body, {
          key: providerKey(route.provider), baseUrl: (s.baseUrls || {})[route.provider], browser: true,
        }));
      }
      const ms = Math.round(performance.now() - t0);
      if (ctx && ctx.log) ctx.log({ id: logId, state: 'done', ms, sources: (out.sources || []).length, model: out.model || route.model });
      return out;
    } catch (e) {
      if (ctx && ctx.log) ctx.log({ id: logId, state: 'error', ms: Math.round(performance.now() - t0), msg: e.message });
      throw e;
    }
  }

  async function search(query, ctx) {
    const s = LX.settings;
    const prov = s.searchProvider && s.searchProvider !== 'native' ? s.searchProvider : 'auto';
    const logId = ctx && ctx.log ? ctx.log({ node: ctx.nodeTitle, role: 'Recherche web', provider: prov, model: '', state: 'running' }) : null;
    const t0 = performance.now();
    try {
      let res;
      if (LX.api.server) {
        const r = await fetch('api/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: prov, query, lang: 'fr', count: 6, keys: { tavily: (s.keys || {}).tavily, brave: (s.keys || {}).brave }, baseUrls: { searxng: (s.baseUrls || {}).searxng } }) });
        res = await r.json();
        if (!r.ok) throw new Error(res.error || 'Erreur de recherche');
      } else {
        const p = prov === 'auto' ? ((s.baseUrls || {}).searxng ? 'searxng' : 'wikipedia') : prov;
        res = { provider: p, results: await LX.providers.searchWith({ provider: p, query, lang: 'fr', count: 6, key: (s.keys || {})[p], baseUrl: (s.baseUrls || {}).searxng, browser: true }) };
      }
      if (ctx && ctx.log) ctx.log({ id: logId, state: 'done', ms: Math.round(performance.now() - t0), sources: res.results.length, provider: res.provider });
      return res;
    } catch (e) {
      if (ctx && ctx.log) ctx.log({ id: logId, state: 'error', ms: Math.round(performance.now() - t0), msg: e.message });
      throw e;
    }
  }

  function parseJSON(text) {
    let t = String(text || '').trim();
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a < 0 || b < a) throw new Error('Réponse IA sans JSON exploitable : « ' + t.slice(0, 160) + '… »');
    let s = t.slice(a, b + 1);
    try { return JSON.parse(s); } catch (e) {
      s = s.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"');
      try { return JSON.parse(s); } catch (e2) { throw new Error('JSON IA invalide : ' + e2.message); }
    }
  }

  // ------------------------------------------------------------------ contexte commun
  function charter(lexes) {
    if (!lexes.length) return '';
    const tot = lexes.reduce((s, x) => s + (x.w || 1), 0) || 1;
    return '## Charte d’éléments de langage\n' + lexes.map((x) => {
      const pct = Math.round(((x.w || 1) / tot) * 100);
      const head = lexes.length > 1 ? `(poids : ${pct} %) ` : '';
      const reg = x.registre ? `Registre : ${x.registre}. Dose de jargon : ${x.intensite || 3}/5.` : '';
      const extras = x.extras && x.extras.length ? ` Termes à placer : ${x.extras.join(', ')}.` : '';
      return head + LX.lex.summary(x.lx, { registre: x.registre, compact: lexes.length > 2 }) + '\n' + reg + extras;
    }).join('\n\n') + (lexes.length > 1 ? `\n\nMélange : ${lexes[0].mode === 'alternance' ? 'alterne les voix d’une étape à l’autre' : lexes[0].mode === 'dominante' ? 'le langage le plus lourd domine, les autres apportent des touches' : 'fusionne les langages dans des phrases hybrides'}.` : '');
  }
  function elementsBlock(items) {
    if (!items.length) return '';
    return '## Éléments branchés\n' + items.map((it, i) => `[${i + 1}] (${it.kind}) ${C.text(it)}`).join('\n');
  }
  function briefBlock(brief) {
    if (!brief) return '';
    return `## Brief\nPublic : ${brief.public}. Objectif : ${brief.objectif}. Ton : ${brief.ton}. Rapport au réel : ${brief.mode}.${brief.contraintes ? ' Contraintes : ' + brief.contraintes : ''}`;
  }

  // ------------------------------------------------------------------ agents par type de node
  const A = {};

  A.donnee = async (node, inp, ctx) => {
    const d = node.data;
    const base = LX.local.donnee(node, inp);
    if (d.mode === 'saisie') return base;
    const contexte = C.items(inp.contexte).map(C.text).join('\n');
    const route = routeFor('chercheur');
    const native = d.mode === 'recherche' && LX.providers.INFO[route.provider] && LX.providers.INFO[route.provider].search && LX.settings.searchProvider !== 'searxng' && LX.settings.searchProvider !== 'wikipedia' && LX.settings.searchProvider !== 'tavily' && LX.settings.searchProvider !== 'brave';
    let found = [];
    if (d.mode === 'recherche' && !native) {
      try { found = (await search(d.question || d.libelle, ctx)).results || []; } catch (e) { found = []; }
    }
    const schema = `{"libelle": "libellé court", "valeur": nombre ou null, "unite": "unité", "periode": "période couverte", "lieu": "lieu", "serie": [{"x": "1980", "y": nombre}], "statut": "sourcé" | "estimé" | "inconnu", "hypotheses": ["hypothèses de calcul si estimation"], "sources": [{"title": "titre", "url": "https://…"}], "note": "remarque courte"}`;
    const task = d.mode === 'estimation'
      ? `Produis une ESTIMATION RAISONNÉE (méthode de Fermi) : décompose en facteurs explicites, donne chaque hypothèse chiffrée dans "hypotheses", calcule l'ordre de grandeur, et mets "statut": "estimé". Si une série annuelle a du sens, propose-la (estimée).`
      : `Trouve la donnée la plus fiable possible. Si tu trouves des chiffres sourcés, "statut": "sourcé" avec les URL réellement consultées. Si les sources sont partielles, complète par une estimation explicite ("statut": "estimé" + "hypotheses"). Si rien n'est trouvable, "statut": "inconnu".`;
    const prompt = `Question : ${d.question || d.libelle}
Libellé souhaité : ${d.libelle || '(à proposer)'}
Période : ${d.periode || '(à préciser)'} · Lieu : ${d.lieu || '(à préciser)'} · Unité souhaitée : ${d.unite || '(à préciser)'}
${contexte ? 'Contexte :\n' + contexte : ''}
${found.length ? 'Résultats de recherche web (à exploiter et citer s’ils sont pertinents) :\n' + found.map((r, i) => `[${i + 1}] ${r.title} — ${r.url}\n${r.snippet}`).join('\n') : ''}

${task}
Réponds en JSON : ${schema}`;
    const res = await call('chercheur', { system: 'Tu es l’agent CHERCHEUR : tu trouves, vérifies ou estimes des données chiffrées.', prompt, search: native, json: !native }, ctx);
    const j = parseJSON(res.text);
    const sources = (j.sources || []).filter((s) => s && s.url && /^https?:/.test(s.url));
    const known = new Set((res.sources || []).map((s) => s.url).concat(found.map((f) => f.url)));
    // Seules les URL réellement renvoyées par un moteur de recherche comptent comme « sources ».
    // Les autres URL citées par le modèle deviennent des pistes « à vérifier » (risque d'hallucination).
    const verified = sources.filter((s) => known.has(s.url)).concat((res.sources || []).filter((s) => !sources.some((x) => x.url === s.url)));
    const unverified = sources.filter((s) => !known.has(s.url)).map((s) => Object.assign({}, s, { snippet: 'URL citée par le modèle, non confirmée par la recherche : à vérifier.' }));
    let statut = ['sourcé', 'estimé', 'inconnu'].includes(j.statut) ? j.statut : 'estimé';
    let note = j.note || '';
    if (statut === 'sourcé' && !verified.length) { statut = 'estimé'; note = (note ? note + ' ' : '') + 'Aucune source confirmée par une recherche web : valeur traitée comme estimation.'; }
    const serie = Array.isArray(j.serie) ? j.serie.map((p) => ({ x: String(p.x), xn: U.parseNum(p.x), y: U.parseNum(p.y) })).filter((p) => p.y != null) : [];
    return Object.assign(base, {
      libelle: d.libelle || j.libelle || base.libelle, valeur: U.parseNum(j.valeur), valeurTexte: j.valeur != null ? String(j.valeur) : '',
      unite: j.unite || d.unite || '', periode: j.periode || d.periode || '', lieu: j.lieu || d.lieu || '',
      serie: serie.length ? serie : base.serie, statut: d.fiabilite && d.fiabilite !== 'auto' ? d.fiabilite : statut,
      hypotheses: j.hypotheses || [], sources: verified.slice(0, 8), pistes: unverified, note, agent: res.provider + ' · ' + res.model,
    });
  };

  A.comparaison = async (node, inp, ctx) => {
    const local = LX.local.comparaison(node, inp);
    const contexte = C.items(inp.contexte);
    const A1 = C.first(inp.a), B1 = C.first(inp.b);
    const prompt = `Compare A et B.
A : ${C.text(A1)}
B : ${C.text(B1)}
${contexte.length ? 'Contexte :\n' + contexte.map(C.text).join('\n') : ''}
Mode demandé : ${local.mode}${node.data.question ? ' · Question : ' + node.data.question : ''}
Calculs déjà faits (exacts, à reprendre tels quels) :
${local.constats.join('\n') || '(aucun calcul possible : comparaison qualitative)'}
Mises en garde calculées : ${local.mises_en_garde.join(' ')}

${local.mode === 'absurde' ? 'La comparaison est volontairement absurde : sois drôle mais rigoureux, et fabrique une « unité de mesure » mémorable.' : ''}
Réponds en JSON : {"resume": "2-3 phrases", "conclusion": "une proposition sans point final", "constats": ["…"], "mises_en_garde": ["…"], "angle_inattendu": "une piste de lecture originale"}`;
    const res = await call('analyste', { system: 'Tu es l’agent ANALYSTE : tu compares, tu chiffres, tu nuances.', prompt }, ctx);
    const j = parseJSON(res.text);
    return Object.assign(local, {
      resume: j.resume || local.resume, conclusion: String(j.conclusion || local.conclusion).replace(/\.$/, ''),
      constats: local.constats.concat((j.constats || []).filter((c) => !local.constats.includes(c))).slice(0, 10),
      mises_en_garde: Array.from(new Set(local.mises_en_garde.concat(j.mises_en_garde || []))), angle: j.angle_inattendu || '', agent: res.provider + ' · ' + res.model,
    });
  };

  A.correlation = async (node, inp, ctx) => {
    const local = LX.local.correlation(node, inp);
    const A1 = C.first(inp.a), B1 = C.first(inp.b);
    const lexes = C.lexes(inp.lexiques);
    const contexte = C.items(inp.contexte);
    const route = routeFor('analyste');
    const canSearch = LX.providers.INFO[route.provider] && LX.providers.INFO[route.provider].search && LX.settings.searchProvider !== 'wikipedia';
    const prompt = `${charter(lexes)}

Tu es un DÉTECTIVE DE CORRÉLATIONS. Cherche ce qui pourrait relier A et B.
A : ${C.text(A1)}
B : ${C.text(B1)}
${contexte.length ? 'Contexte :\n' + contexte.map(C.text).join('\n') : ''}
${local.mode === 'correlation' ? 'Statistiques exactes déjà calculées (à reprendre telles quelles, ne pas recalculer) :\n' + local.constats.join('\n') : 'Aucune série chiffrée : raisonne en hypothèses.'}
Pistes déjà envisagées : ${local.hypotheses.map((h) => h.type + ' (' + h.mecanisme + ')').join(' ; ')}
${canSearch ? 'Si tu trouves des études ou des données réelles qui documentent un lien (ou son absence), cite-les.' : ''}

Mission : propose les liens les plus intéressants entre A et B (variable cachée, chaîne causale, causalité inverse, effet de mesure, coïncidence), du plus plausible au plus spéculatif, chacun avec la façon concrète de le tester. Sois inventif mais honnête : n'affirme jamais un lien non démontré.
Réponds en JSON : {"resume": "2-3 phrases", "conclusion": "une proposition sans point final", "hypotheses": [{"type": "…", "mecanisme": "…", "texte": "…", "force": "plausible | à tester | spéculatif", "test": "…"}], "mises_en_garde": ["…"], "donnees_suggerees": [{"cote": "a" | "b", "libelle": "…", "question": "question chiffrable ?", "unite": "…"}]}`;
    const res = await call('analyste', { system: 'Tu es l’agent ANALYSTE, spécialiste des corrélations et des pièges statistiques.', prompt, search: canSearch, json: !canSearch }, ctx);
    const j = parseJSON(res.text);
    const lx = lexes.map((x) => x.lx);
    return Object.assign(local, {
      resume: j.resume || local.resume, conclusion: String(j.conclusion || local.conclusion).replace(/\.$/, ''),
      hypotheses: (Array.isArray(j.hypotheses) && j.hypotheses.length ? j.hypotheses : local.hypotheses).map((h) => Object.assign({}, h, { texte: LX.lex.markTerms(h.texte || '', lx) })),
      mises_en_garde: Array.from(new Set(local.mises_en_garde.concat(j.mises_en_garde || []))),
      donnees_suggerees: Array.isArray(j.donnees_suggerees) && j.donnees_suggerees.length ? j.donnees_suggerees.map((x, i) => Object.assign({ cote: i ? 'b' : 'a' }, x)) : local.donnees_suggerees,
      sources: res.sources || [], agent: res.provider + ' · ' + res.model,
    });
  };

  A.prisme = async (node, inp, ctx) => {
    const d = node.data;
    const lexIn = C.lexes(inp.lexique);
    const lexes = lexIn.length ? lexIn : [{ lx: LX.lex.get(d.lexique), w: 1, registre: 'institutionnel', intensite: 3 }];
    const items = C.items(inp.contenu);
    if (!items.length) throw new Error('Branchez un contenu à faire passer dans le prisme.');
    const intentions = {
      traduire: 'Réécris ce contenu comme le ferait un professionnel de ce langage, avec ses mots, ses formules et sa logique.',
      defendre: 'Réécris ce contenu pour le défendre et le valoriser, avec les éléments de langage du métier.',
      critiquer: 'Analyse ce contenu de façon critique à travers cette grille : ce qu’elle révèle, ce qu’elle cache, ses angles morts.',
      vulgariser: 'Explique ce contenu au grand public, en partant de ce langage mais en traduisant le jargon.',
      languedebois: 'Réécris ce contenu en langue de bois maximale de ce métier (euphémismes, formules creuses, connecteurs rassurants).',
      satiriser: 'Écris une version satirique, qui pousse les tics de langage du métier jusqu’à l’absurde (sans méchanceté gratuite).',
    };
    const longueur = { court: '80 à 120 mots', moyen: '180 à 260 mots', long: '350 à 500 mots' }[d.longueur] || '200 mots';
    const prompt = `${charter(lexes)}

## Contenu à faire passer dans le prisme
${items.map(C.text).join('\n\n')}

Mission : ${intentions[d.intention] || intentions.traduire}
Longueur : ${longueur}. Paragraphes séparés par une ligne vide.
Réponds en JSON : {"titre": "titre court", "texte": "…"}`;
    const res = await call('traducteur', { system: 'Tu es l’agent TRADUCTEUR DE LANGAGES : tu fais passer n’importe quel contenu à travers le prisme d’un métier ou d’une sociologie.', prompt }, ctx);
    const j = parseJSON(res.text);
    const texte = LX.lex.markTerms(j.texte || '', lexes.map((x) => x.lx));
    return { titre: j.titre || `${C.title(items[0])} — vu par ${lexes.map((x) => x.lx.nom).join(' × ')}`, texte, intention: d.intention, lexiques: lexes.map((x) => x.lx.id), termes: LX.lex.termsIn(texte), satire: d.intention === 'satiriser', agent: res.provider + ' · ' + res.model };
  };

  A.decodeur = async (node, inp, ctx) => {
    const local = LX.local.decodeur(node, inp);
    const prompt = `Texte à décoder :
${local.original}

Éléments déjà détectés : ${local.detections.slice(0, 20).map((x) => `${x.trouve} → ${x.clair}`).join(' ; ') || 'aucun'}
Mission : traduis ce texte en langage clair et direct (ce que ça veut vraiment dire), repère les procédés (euphémisme, nominalisation, passif sans agent, chiffre sans base, formule creuse…).
Réponds en JSON : {"texte": "version en clair", "verdict": "une phrase", "procedes": [{"trouve": "extrait", "clair": "traduction", "procede": "nom du procédé"}]}`;
    const res = await call('traducteur', { system: 'Tu es l’agent DÉCODEUR : tu traduis la langue de bois en langage clair, sans parti pris.', prompt }, ctx);
    const j = parseJSON(res.text);
    const extra = (j.procedes || []).map((p) => ({ type: p.procede || 'procédé', trouve: p.trouve, clair: p.clair, lex: 'neutre' }));
    return Object.assign(local, { texte: j.texte || local.texte, detections: local.detections.concat(extra), scores: Object.assign(local.scores, { verdict: j.verdict || local.scores.verdict }), agent: res.provider + ' · ' + res.model });
  };

  A.reflexion = async (node, inp, ctx) => {
    const d = node.data;
    let lexes = C.lexes(inp.lexiques);
    if (!lexes.length) lexes = [{ lx: LX.lex.get('neutre'), w: 1, registre: 'institutionnel', intensite: 2 }];
    const brief = C.first(inp.brief);
    const items = C.items(inp.elements);
    const sujetIt = C.first(inp.sujet) || items.find((i) => i.kind === 'sujet');
    const titre = sujetIt ? C.title(sujetIt) : items[0] ? C.title(items[0]) : '';
    if (!titre) throw new Error('Branchez un Sujet (ou au moins un élément).');
    // structure : celle choisie, sinon celle du langage dominant
    const local = LX.local.reflexion(node, inp); // sert de squelette (structure, confiance, sources)
    let struct = null;
    for (const x of lexes) for (const s of x.lx.structures) if (s.nom === local.structure) struct = s;
    if (!struct) struct = LX.GENERIC_STRUCTS[d.structure] || { etapes: local.etapes.map((e) => ({ titre: e.titre, role: e.role, consigne: '' })) };
    const longueur = { court: '40 à 70 mots', moyen: '80 à 130 mots', long: '150 à 220 mots' }[d.longueur] || '100 mots';
    const prompt = `${charter(lexes)}

${briefBlock(brief)}

## Sujet
${sujetIt ? C.text(sujetIt) : titre}

${elementsBlock(items.filter((i) => i !== sujetIt))}

## Structure imposée : « ${local.structure} »
${struct.etapes.map((e, i) => `${i + 1}. ${e.titre} [rôle : ${e.role}]${e.consigne ? ' — ' + e.consigne : ''}`).join('\n')}

Mission : déroule un raisonnement en suivant exactement ces étapes, dans le(s) langage(s) de la charte. Intègre TOUS les éléments branchés (événements dans l'ordre chronologique, chiffres avec leur statut : sourcé / estimé / fictif, comparaisons et leurs conclusions). Chaque étape : ${longueur}.
${d.consigne ? 'Consigne additionnelle : ' + d.consigne : ''}
Réponds en JSON : {"titre": "…", "these": "la thèse en une phrase", "etapes": [{"titre": "…", "role": "…", "texte": "…"}], "conclusion": "…", "contre_arguments": ["…", "…", "…"]}`;
    const res = await call('redacteur', { system: 'Tu es l’agent RÉDACTEUR : tu construis un raisonnement structuré et incarné dans un langage professionnel.', prompt, maxTokens: 12000 }, ctx);
    const j = parseJSON(res.text);
    const lx = lexes.map((x) => x.lx);
    const etapes = (j.etapes || []).map((e, i) => ({ titre: e.titre || (struct.etapes[i] || {}).titre || 'Étape ' + (i + 1), role: e.role || (struct.etapes[i] || {}).role || 'analyse', lex: lx[i % lx.length].id, texte: LX.lex.markTerms(e.texte || '', lx) }));
    const termes = [];
    const seen = new Set();
    for (const e of etapes) for (const t of LX.lex.termsIn(e.texte)) if (!seen.has(t.terme.toLowerCase())) { seen.add(t.terme.toLowerCase()); termes.push(t); }
    return Object.assign(local, {
      titre: j.titre || local.titre, these: LX.lex.markTerms(j.these || local.these, lx), etapes: etapes.length ? etapes : local.etapes,
      conclusion: LX.lex.markTerms(j.conclusion || local.conclusion, lx), contre_arguments: j.contre_arguments || local.contre_arguments, termes, agent: res.provider + ' · ' + res.model,
    });
  };

  A.debat = async (node, inp, ctx) => {
    const d = node.data;
    const voices = C.lexes(inp.voix).filter((v, i, a) => a.findIndex((x) => x.lx.id === v.lx.id) === i).slice(0, 5);
    if (voices.length < 2) throw new Error('Branchez au moins deux nodes « Éléments de langage » (un par intervenant).');
    const items = C.items(inp.elements);
    const sujetIt = C.first(inp.sujet) || items.find((i) => i.kind === 'sujet');
    const titre = sujetIt ? C.title(sujetIt) : items[0] ? C.title(items[0]) : '';
    if (!titre) throw new Error('Branchez un sujet.');
    const fmt = { contradictoire: 'débat contradictoire (chacun défend sa grille, répliques vives mais argumentées)', consensuel: 'table ronde consensuelle (chacun enrichit le propos)', interview: 'interview croisée (le modérateur pose des questions, chacun répond depuis son métier)' }[d.format];
    const prompt = `${charter(voices)}

## Sujet
${sujetIt ? C.text(sujetIt) : titre}
${elementsBlock(items.filter((i) => i !== sujetIt))}

Mission : écris une ${fmt}. Intervenants (identifiants) : ${voices.map((v) => `"${v.lx.id}" = ${v.lx.nom}`).join(', ')}${d.moderateur ? ', plus "moderateur"' : ''}.
${d.tours} tour(s) de parole par intervenant. Chaque intervenant parle UNIQUEMENT avec les éléments de langage de sa charte. Les répliques se répondent.
Réponds en JSON : {"tours": [{"voix": "identifiant", "texte": "…"}], "synthese": "points de convergence et de friction"}`;
    const res = await call('debatteur', { system: 'Tu es l’agent ANIMATEUR DE TABLE RONDE : tu fais dialoguer des langages professionnels.', prompt, maxTokens: 12000 }, ctx);
    const j = parseJSON(res.text);
    const lx = voices.map((x) => x.lx);
    const tours = (j.tours || []).map((t) => {
      const l = LX.lex.byId[t.voix];
      const isMod = !l || t.voix === 'moderateur';
      return { voix: isMod ? 'moderateur' : l.id, nom: isMod ? 'Modérateur·rice' : (l.famille === 'sociologie' ? 'Sociologue (' + l.nom.split('—')[0].trim() + ')' : 'Voix « ' + l.nom + ' »'), icone: isMod ? '🎙️' : l.icone, couleur: isMod ? '#cccccc' : l.couleur, texte: LX.lex.markTerms(t.texte || '', lx) };
    });
    const texte = tours.map((x) => `**${x.nom}** — ${x.texte}`).join('\n\n');
    return { titre: `Table ronde : ${U.cap(titre)}`, format: d.format, tours, synthese: j.synthese || '', texte, termes: LX.lex.termsIn(texte), agent: res.provider + ' · ' + res.model };
  };

  const AGENT_MISSIONS = {
    contradicteur: 'Joue l’avocat du diable : formule les objections les plus solides, les biais, les failles de méthode et une contre-thèse crédible.',
    verificateur: 'Vérifie chaque affirmation chiffrée ou factuelle : statut (sourcé / estimé / fictif / douteux), cohérence des unités et des ordres de grandeur, ce qu’il faudrait sourcer avant diffusion.',
    statisticien: 'Analyse statistiquement les données : tendances, taux de croissance, dispersion, corrélations, pièges (échantillon, base, effet de structure) et la meilleure visualisation.',
    prospectiviste: 'Construis trois scénarios (tendanciel, rupture, inversé) avec leurs signaux faibles et ce qui ferait basculer de l’un à l’autre.',
    vulgarisateur: 'Rends le contenu limpide pour un public de 12 ans à 99 ans : phrases courtes, exemples concrets, zéro jargon non expliqué.',
    analogiste: 'Propose des analogies et métaphores frappantes (puisées dans d’autres domaines) pour faire comprendre le contenu, avec leurs limites.',
    scenariste: 'Transforme le contenu en pitch : logline, enjeu, personnage ou point de vue, structure en trois actes, image finale.',
    libre: '',
  };
  A.agent = async (node, inp, ctx) => {
    const d = node.data;
    const items = C.items(inp.entree).filter((i) => i.kind !== 'lexique');
    const lexes = C.lexes(inp.entree);
    if (!items.length) throw new Error('Branchez au moins un élément à traiter.');
    const mission = [AGENT_MISSIONS[d.role], d.consigne].filter(Boolean).join(' ');
    if (!mission) throw new Error('Donnez une consigne à l’agent.');
    const prompt = `${charter(lexes)}

${elementsBlock(items)}

Mission : ${mission}
Réponds en JSON : {"titre": "…", "texte": "… (listes à puces autorisées, une idée par ligne)"}`;
    const res = await call('specialiste', { system: 'Tu es un AGENT SPÉCIALISTE au sein d’une équipe d’agents.', prompt }, ctx);
    const j = parseJSON(res.text);
    const texte = LX.lex.markTerms(j.texte || '', lexes.map((x) => x.lx));
    return { titre: j.titre || d.role, texte, role: d.role, termes: LX.lex.termsIn(texte), agent: res.provider + ' · ' + res.model };
  };

  A.short = async (node, inp, ctx) => {
    const S = LX.short;
    const sc = S.context(node, inp);
    if (!sc.items.length) throw new Error('Branchez une Réflexion (ou un texte, une comparaison…) sur l’entrée « contenu ».');
    const B = S.beatsFrom(sc.items);
    const nScenes = S.SCENES_BY_DUR[sc.duree] || Math.max(4, Math.round(sc.duree / 8));
    const comp = B.comps[0];
    const lexes = sc.lexes.map((lx) => ({ lx, w: 1 }));
    const prompt = `${charter(lexes)}

${briefBlock(sc.brief)}

## Matière à adapter
${sc.items.map(C.text).join('\n\n')}

## Cahier des charges du short animé
- Durée totale : ${sc.duree} s, ${nScenes} scènes (accroche de 2-4 s, conclusion/mention finale), format ${sc.format}.
- Style : ${sc.styleObj.nom} — ${sc.styleObj.fr}. Palette : ${sc.palette.join(', ')}. ${sc.motion_fr || ''}
- Film institutionnel / pédagogique, très graphique et schématique : chaque scène repose sur UN visuel parmi :
  "chiffre" {"valeur": nombre, "valeurTexte": "1,2 million", "unite": "…", "label": "…"},
  "barres" {"items": [{"label": "…", "value": nombre, "unite": "…"}]},
  "frise" {"points": [{"date": "…", "label": "…"}]},
  "balance" {"items": [{"label": "…"}, {"label": "…"}]},
  "schema" {"boxes": ["…", "…", "…"]},
  "citation" {"texte": "…"}, "mots" {"mots": ["…"]}, "titre" {"titre": "…"}${comp ? ',\n  "comparaison" {} (reprend automatiquement le graphique calculé de la comparaison)' : ''}.
- Voix off française, ton ${sc.voix}, ~${S.WPS} mots par seconde de scène. Elle porte les éléments de langage de la charte.
- Texte à l’écran : 6 mots maximum.
- Chaque chiffre estimé ou fictif doit être signalé (voix off ou texte à l’écran).
${LX.VIDEO_MODELS[sc.cible] ? `- Le film sera généré avec ${LX.VIDEO_MODELS[sc.cible].nom} : ${LX.VIDEO_MODELS[sc.cible].regles.join(' ')} Les durées de scène sont en secondes entières${sc.cible === 'h3' ? ', 2 s minimum par plan' : ''}.` : ''}
Réponds en JSON : {"titre": "…", "logline": "…", "scenes": [{"titre": "…", "duree": secondes, "vo": "…", "texte_ecran": "…", "visuel": {"type": "…", …}, "description_en": "visual description in English for an image/video model (subject, composition, motion, graphic elements)", "camera": "camera move in English", "transition": "transition in English"}], "musique": "…"}`;
    const res = await call('scenariste', { system: 'Tu es l’agent SCÉNARISTE / DIRECTEUR ARTISTIQUE : tu écris des shorts animés pédagogiques, rythmés et très visuels.', prompt, maxTokens: 14000 }, ctx);
    const j = parseJSON(res.text);
    const scenesIn = Array.isArray(j.scenes) && j.scenes.length ? j.scenes : null;
    if (!scenesIn) throw new Error('Le scénariste n’a pas renvoyé de scènes.');
    const totIn = scenesIn.reduce((s, x) => s + (Number(x.duree) || 4), 0) || 1;
    let t = 0;
    const VALID = ['chiffre', 'barres', 'courbes', 'pictos', 'frise', 'balance', 'schema', 'citation', 'mots', 'titre'];
    const scenes = scenesIn.map((x, i) => {
      let dur = Math.max(2, Math.round(((Number(x.duree) || 4) * sc.duree) / totIn));
      if (i === scenesIn.length - 1) dur = Math.max(2, sc.duree - t);
      let v = x.visuel || {};
      if ((v.type === 'comparaison' || v.type === 'pictos' || v.type === 'courbes') && comp) v = JSON.parse(JSON.stringify(comp.visuel));
      if (!VALID.includes(v.type)) v = { type: 'titre', titre: x.texte_ecran || x.titre };
      if (v.type === 'chiffre') { v.valeur = U.parseNum(v.valeur); v.valeurTexte = v.valeurTexte || (v.valeur != null ? U.fmtBig(v.valeur) : ''); v.emoji = v.emoji || U.emojiFor((v.label || '') + ' ' + (v.unite || '')); }
      if (v.type === 'barres') v.items = (v.items || []).map((it) => Object.assign(it, { value: U.parseNum(it.value), emoji: U.emojiFor(it.label) }));
      if (v.type === 'balance') v.items = (v.items || []).map((it) => Object.assign(it, { emoji: it.emoji || U.emojiFor(it.label, '◯') }));
      const lx = sc.lexes[i % Math.max(1, sc.lexes.length)];
      const r = U.rng(node.id + i);
      const motifs = lx ? r.sample(lx.visuel.motifs, 2).concat(r.sample(lx.visuel.pictogrammes, 1)) : [];
      const scene = {
        n: i + 1, titre: x.titre || 'Scène ' + (i + 1), role: i === 0 ? 'accroche' : i === scenesIn.length - 1 ? 'outro' : 'analyse',
        debut: t, fin: t + dur, duree: dur, vo: x.vo || '', texte_ecran: x.texte_ecran || '', visuel: v,
        description: sc.langue === 'fr' ? '' : x.description_en || '', motifs, lex: lx ? lx.id : null,
        camera: x.camera || r.pick(sc.styleObj.cameras), transition: x.transition || r.pick(sc.styleObj.transitions),
        elements_graphiques: [S.visualDesc(v, 'fr')].concat(motifs.map((m) => m.fr)),
      };
      t += dur;
      scene.prompts = S.prompts(scene, sc);
      return scene;
    });
    const refl = B.refl;
    const conf = refl && refl.confiance;
    const mention = conf && ['fiction', 'démonstration'].includes(conf.niveau) ? 'Chiffres fictifs — démonstration' : conf && conf.niveau === 'moyenne' ? 'Certaines valeurs sont des estimations' : '';
    const script = {
      titre: j.titre || (refl ? refl.titre : 'Short'), logline: j.logline || '', duree: sc.duree, format: sc.format, style: sc.styleKey, styleNom: sc.styleObj.nom,
      palette: sc.palette, voix: sc.voix, cible: sc.cible, langue: sc.langue, lexiques: sc.lexes.map((l) => l.id), scenes, mention,
      bible: { musique: j.musique || sc.styleObj.musique }, agent: res.provider + ' · ' + res.model,
    };
    return S.finalize(script, sc);
  };

  A.generateur = async (node, inp, ctx) => {
    const local = LX.local.generateur(node, inp);
    const P = LX.VIDEO_MODELS[local.modele];
    const it = (inp.script || []).find((x) => x.out);
    const script = it.out;
    const segs = await Promise.all(local.segments.map(async (seg) => {
      const scenes = script.scenes.filter((s) => s.debut < seg.fin && s.fin > seg.debut).map((s) => ({ titre: s.titre, duree: s.duree, voix_off: U.stripMarks(s.vo), texte_ecran: s.texte_ecran, visuel: s.description || LX.short.visualDesc(s.visuel, 'en'), camera: s.camera }));
      const prompt = `Réécris ce prompt de génération vidéo pour ${P.nom}, en respectant STRICTEMENT ces règles :
- ${P.regles.join('\n- ')}
Le prompt final est en anglais (sauf les répliques de voix off et les textes à l’écran, qui restent en français), et ne dépasse pas ${P.promptMax} caractères.
Segment ${seg.n} : ${seg.debut}–${seg.fin} s, durée ${seg.duree} s, format ${local.ratio}, voix off ${local.voix === 'native' ? 'dite par le modèle' : 'ajoutée au montage (aucune voix dans la vidéo)'}.
Plans et durées à respecter : ${seg.plans.map((p) => p.titre + ' (' + p.duree + ' s)').join(', ')}.
Scènes du storyboard : ${JSON.stringify(scenes)}
Bible visuelle : ${(script.bible && script.bible.style_prompt) || ''}
Prompt de départ (structure correcte, à enrichir et à rendre plus cinématographique) :
${seg.prompt}
Réponds en JSON : {"prompt": "…"}`;
      try {
        const res = await call('scenariste', { system: 'Tu es l’agent SCÉNARISTE spécialisé dans l’écriture de prompts pour modèles de génération vidéo.', prompt, maxTokens: 6000 }, ctx);
        const j = parseJSON(res.text);
        const p2 = String(j.prompt || '').trim();
        if (p2.length > 80) return Object.assign({}, seg, { prompt: p2, chars: p2.length, key: String(U.hash(P.id + p2 + seg.duree + local.ratio + local.resolution)), agent: res.provider + ' · ' + res.model });
      } catch (e) { /* on garde le prompt local */ }
      return seg;
    }));
    return Object.assign(local, { segments: segs });
  };

  LX.ai = { ROLES, ROLE_OF, compute: A, call, search, parseJSON, routeFor };
})(window.LX = window.LX || {});
