/*
 * LEXINODE — moteur local (sans IA).
 * Raisonne à partir de la base de connaissances : gabarits, formules, cadres, substitutions,
 * euphémismes, rapport aux chiffres… et calcule réellement les comparaisons (ratios, corrélations).
 * Chaque fonction reçoit (node, inputs, ctx) et renvoie la sortie du node.
 */
(function (LX) {
  'use strict';
  const U = LX.U;

  // ============================================================== contenus
  const C = {};
  // inputs[port] = [{ type, nodeId, nodeType, out }]
  C.items = (list) => (list || []).filter((x) => x && x.out).map((x) => Object.assign({ kind: x.type, nodeId: x.nodeId }, x.out));
  C.first = (list) => C.items(list)[0] || null;
  C.dateNum = (s) => {
    const m = String(s || '').match(/(\d{3,4})(?:[-/.](\d{1,2}))?(?:[-/.](\d{1,2}))?/);
    if (!m) return null;
    return Number(m[1]) + (m[2] ? (Number(m[2]) - 1) / 12 : 0) + (m[3] ? Number(m[3]) / 400 : 0);
  };
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  C.dateFr = (s) => {
    s = String(s || '').trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return 'le ' + Number(m[3]) + (m[3] === '01' || m[3] === '1' ? 'er' : '') + ' ' + MOIS[Number(m[2]) - 1] + ' ' + m[1];
    m = s.match(/^(\d{4})-(\d{1,2})$/);
    if (m) return 'en ' + MOIS[Number(m[2]) - 1] + ' ' + m[1];
    if (/^\d{4}$/.test(s)) return 'en ' + s;
    if (/^années/i.test(s)) return 'dans les ' + s.toLowerCase();
    return s ? (/^(en|au|le|la|les|dans|à|vers)\b/i.test(s) ? s : 'en ' + s) : '';
  };
  C.title = (it) => {
    if (!it) return '';
    switch (it.kind) {
      case 'sujet': return it.titre || '';
      case 'evenement': return it.titre || '';
      case 'donnee': return it.libelle || it.question || '';
      case 'comparaison': return it.titre || '';
      case 'reflexion': return it.titre || '';
      case 'texte': return it.titre || U.truncateWords(U.stripMarks(it.texte), 8);
      case 'brief': return 'brief';
      default: return it.titre || '';
    }
  };
  C.valueText = (dt, noCumul) => {
    if (!dt) return '';
    if (dt.valeur != null) return U.withUnit(U.fmtBig(dt.valeur), dt.unite);
    if (dt.serie && dt.serie.length) {
      const v = U.withUnit(U.fmtBig(dt.serie.reduce((s, p) => s + p.y, 0)), dt.unite);
      return noCumul || dt.periode ? v + (noCumul ? '' : ' au total') : v + ' (cumul ' + dt.serie[0].x + '–' + dt.serie[dt.serie.length - 1].x + ')';
    }
    return dt.valeurTexte ? U.withUnit(dt.valeurTexte, dt.unite) : '';
  };
  C.text = (it) => {
    if (!it) return '';
    switch (it.kind) {
      case 'sujet': return [it.titre, it.angle].filter(Boolean).join('. ');
      case 'brief': return `Public : ${it.public}. Objectif : ${it.objectif}. Ton : ${it.ton}. ${it.contraintes || ''}`;
      case 'evenement': return (it.chronologie || [it]).map((e) => `${e.date ? e.date + ' — ' : ''}${e.titre}${e.lieu ? ' (' + e.lieu + ')' : ''}${e.description ? ' : ' + e.description : ''}`).join('\n');
      case 'donnee': {
        const ctx = [it.periode, it.lieu].filter(Boolean).join(', ');
        const serie = it.serie && it.serie.length ? ' Série : ' + it.serie.map((p) => p.x + ' = ' + U.fmt(p.y)).join(' ; ') + '.' : '';
        return `${it.libelle || it.question} : ${C.valueText(it) || 'valeur inconnue'}${ctx ? ' (' + ctx + ')' : ''} [${it.statut || '?'}].${serie}${it.note ? ' ' + it.note : ''}`;
      }
      case 'comparaison': return `${it.resume || ''} Conclusion : ${it.conclusion || ''}.${it.hypotheses ? ' Pistes de liens : ' + it.hypotheses.map((h) => h.type + ' — ' + U.stripMarks(h.texte)).join(' ') : ''}`;
      case 'reflexion': return [it.these].concat((it.etapes || []).map((e) => e.titre + ' : ' + e.texte)).concat(it.conclusion ? ['Conclusion : ' + it.conclusion] : []).map(U.stripMarks).join('\n');
      case 'texte': return it.tours ? it.tours.map((t) => `${t.nom} : ${U.stripMarks(t.texte)}`).join('\n') : U.stripMarks(it.texte || '');
      default: return U.stripMarks(it.texte || it.titre || '');
    }
  };
  C.conclusionOf = (items) => {
    for (const it of items) {
      if (it.kind === 'comparaison' && it.conclusion) return U.stripMarks(it.conclusion).replace(/[.!]$/, '');
      if (it.kind === 'reflexion' && it.conclusion) return U.np(U.stripMarks(U.sentences(it.conclusion)[0] || '')).replace(/[.!]$/, '');
      if (it.tours && it.synthese) return U.np(U.stripMarks(U.sentences(it.synthese).slice(-1)[0] || '')).replace(/^en filigrane,\s*/i, '').replace(/[.!]$/, '');
    }
    return null;
  };
  // Groupe nominal (avec article) désignant un élément, pour remplir {sujet}, {element}…
  C.nounPhrase = (it) => {
    if (!it) return '';
    if (it.kind === 'comparaison' && it.a && it.b) return 'le rapprochement entre ' + LX.localHelpers.withArticle(it.a.libelle) + ' et ' + LX.localHelpers.withArticle(it.b.libelle);
    if (it.kind === 'evenement') return LX.localHelpers.eventNP(it.titre);
    if (it.kind === 'debat' || (it.kind === 'texte' && it.tours)) return 'ce débat';
    return LX.localHelpers.withArticle(C.title(it));
  };
  C.lexes = (list) => {
    const out = [];
    for (const it of C.items(list)) {
      for (const x of LX.lex.resolve(it)) out.push({ lx: x.lx, w: x.w, registre: it.registre || 'institutionnel', intensite: Number(it.intensite || 3), mode: it.mode, extras: it.extras || [] });
    }
    return out;
  };
  C.events = (items) => {
    const map = new Map();
    for (const it of items.filter((x) => x.kind === 'evenement')) for (const e of it.chronologie || [it]) map.set(e.id || e.titre, e);
    return Array.from(map.values()).sort((a, b) => (C.dateNum(a.date) ?? 1e9) - (C.dateNum(b.date) ?? 1e9));
  };
  LX.content = C;

  // ============================================================== outils de génération
  const seedOf = (node) => U.hash(node.id) + (Number(node.data.seed) || 1) * 7919;
  const withArticle = (s) => {
    s = U.np(s);
    if (!s) return s;
    if (/^(le|la|les|l'|l’|un|une|des|du|de|ce|cet|cette|ces|son|sa|ses|leur|leurs|notre|nos|votre|vos|\d|«)/i.test(s)) return s;
    // nom propre (« Melbourne », « Air France ») : tous les mots significatifs commencent par une majuscule
    const sig = s.split(/\s+/).filter((w) => /^\p{L}/u.test(w) && w.length > 3);
    if (/^\p{Lu}/u.test(s) && sig.every((w) => /^\p{Lu}/u.test(w))) return s;
    if (/^\p{Lu}\p{Ll}/u.test(s)) s = s.charAt(0).toLowerCase() + s.slice(1);
    const first = s.split(/\s+/)[0];
    if (/[sx]$/i.test(first) && first.length > 3) return 'les ' + s;
    return '« ' + s + ' »';
  };
  // Événement → groupe nominal : « la fermeture de l’usine » reste tel quel ; « Grande vague de froid » → « l’épisode « Grande vague de froid » »
  const eventNP = (t) => {
    const s = U.np(t);
    if (!s) return s;
    if (/^(le|la|les|l'|l’|un|une|des|du|ce|cet|cette|ces|son|sa|ses|leur|leurs)\b/i.test(s)) return s;
    return 'l’épisode « ' + String(t).trim().replace(/[.]$/, '') + ' »';
  };
  const dateLabel = (s) => {
    s = String(s || '').trim();
    const MO = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return Number(m[3]) + ' ' + MO[Number(m[2]) - 1] + ' ' + m[1];
    m = s.match(/^(\d{4})-(\d{1,2})$/);
    if (m) return U.cap(MO[Number(m[2]) - 1]) + ' ' + m[1];
    return U.cap(s);
  };
  const singular = (u) => {
    u = String(u || '').trim();
    if (!u) return '';
    return u.split(' ').map((w, i) => (i === 0 && /[^s]s$/.test(w) && w.length > 3 ? w.slice(0, -1) : w)).join(' ');
  };
  const GENERIC_CONCL = [
    'la question mérite mieux qu’une réponse toute faite',
    'les signaux convergent sans encore constituer une preuve',
    'le diagnostic doit être affiné avant toute décision',
    'il faut regarder les chiffres et les récits ensemble',
    'l’évidence de départ ne résiste pas à l’examen',
  ];
  const ROLE_TPL = {
    contexte: ['Pour comprendre {sujet}, il faut d’abord poser le décor.', 'Tout commence par {evenement}.', 'Le contexte compte autant que les chiffres s’agissant de {sujet}.'],
    faits: ['Les faits, d’abord.', 'Premier élément tangible : {chiffre}.', 'Point de départ de l’analyse : {a}.'],
    analyse: ['Mis en regard, ces éléments dessinent une lecture d’ensemble.', 'Rapprocher {a} et {b} oblige à changer d’échelle.', 'Ce qui frappe, c’est la cohérence entre les signaux.'],
    tension: ['Ce constat appelle cependant des réserves.', 'Il serait imprudent d’y voir une relation de cause à effet.', 'Une objection mérite d’être entendue.'],
    hypothese: ['Une hypothèse se dessine.', 'Supposons que {conclusion}.'],
    decision: ['Il faut en tirer des conséquences concrètes.', 'Plusieurs leviers peuvent être actionnés s’agissant de {sujet}.'],
    projection: ['À terme, {sujet} pourrait changer de nature.', 'La suite dépendra de la capacité à suivre ces indicateurs dans le temps.'],
    conclusion: ['En définitive, {conclusion}.', 'Au total, {sujet} invite à regarder autrement les évidences.'],
  };
  const GENERIC_STRUCTS = {
    'gen:dialectique': { nom: 'Dialectique (thèse – antithèse – synthèse)', etapes: [
      { titre: 'Position du problème', role: 'contexte' }, { titre: 'Thèse', role: 'analyse' }, { titre: 'Antithèse', role: 'tension' }, { titre: 'Synthèse', role: 'conclusion' }] },
    'gen:probleme': { nom: 'Problème – solution', etapes: [
      { titre: 'Contexte', role: 'contexte' }, { titre: 'Le problème', role: 'faits' }, { titre: 'Les causes', role: 'analyse' }, { titre: 'Les solutions', role: 'decision' }, { titre: 'Les bénéfices attendus', role: 'projection' }] },
    'gen:chrono': { nom: 'Chronologique', etapes: [
      { titre: 'Avant', role: 'contexte' }, { titre: 'Le déclencheur', role: 'faits' }, { titre: 'Les conséquences', role: 'analyse' }, { titre: 'Et maintenant ?', role: 'projection' }, { titre: 'La leçon', role: 'conclusion' }] },
    'gen:entonnoir': { nom: 'Entonnoir (du général au particulier)', etapes: [
      { titre: 'Le grand tableau', role: 'contexte' }, { titre: 'Les chiffres', role: 'faits' }, { titre: 'Le cas', role: 'analyse' }, { titre: 'Le point clé', role: 'conclusion' }] },
    'gen:minto': { nom: 'Pyramide de Minto (conclusion d’abord)', etapes: [
      { titre: 'La réponse', role: 'conclusion' }, { titre: 'Argument 1 — les faits', role: 'faits' }, { titre: 'Argument 2 — l’analyse', role: 'analyse' }, { titre: 'Limite', role: 'tension' }, { titre: 'Recommandation', role: 'decision' }] },
  };
  LX.GENERIC_STRUCTS = GENERIC_STRUCTS;

  // Générateur de phrases lié à un node (hasard reproductible + anti-répétition)
  function makeGen(node) {
    const r = U.rng(seedOf(node));
    const used = new Set();
    const g = { r, used };
    g.pick = (list, vars, prefer) => {
      const fresh = (list || []).filter((t) => !used.has(t));
      const t = U.pickTpl(fresh.length ? fresh : list, vars, r, prefer);
      if (t) used.add(t);
      return t;
    };
    g.fill = (list, vars, prefer) => {
      const t = g.pick(list, vars, prefer);
      return t ? U.fill(t, vars) : null;
    };
    g.term = (lx) => () => {
      const v = r.pick(lx.vocabulaire);
      return v ? v.terme : 'enjeu';
    };
    g.conn = (lx) => {
      const c = r.pick(lx.connecteurs.filter((x) => !used.has(x)));
      if (c) used.add(c);
      return c || '';
    };
    return g;
  }
  const lead = (conn, sentence) => {
    if (!conn || !sentence) return sentence;
    const first = sentence.split(/\s+/)[0];
    const keep = first.length > 1 && first === first.toUpperCase() && /[A-ZÀ-Ý]/.test(first);
    return U.sentence(conn.replace(/[,:;]?\s*$/, ',') + ' ' + (keep ? sentence : sentence.charAt(0).toLowerCase() + sentence.slice(1)));
  };
  const steps = (lx, role) => (lx.structures || []).flatMap((s) => s.etapes).filter((e) => e.role === role);
  const gabaritsFor = (lx, role) => steps(lx, role).flatMap((e) => e.gabarits || []).concat(ROLE_TPL[role] || []);

  function dataSentence(dt, lx, g, sujet) {
    const ctx = [dt.periode, dt.lieu].filter(Boolean).join(', ');
    const chiffre = C.valueText(dt, true);
    if (!chiffre) return U.sentence(`${U.cap(withArticle(dt.libelle || dt.question))} : la valeur reste à établir${dt.mode === 'recherche' ? ' (recherche à lancer avec un moteur IA)' : ''}`);
    const vars = { a: withArticle(dt.libelle || dt.question), element: withArticle(dt.libelle || dt.question), chiffre: chiffre + (ctx ? ' (' + ctx + ')' : ''), sujet, terme: g.term(lx) };
    let s = g.fill((lx.rapport_aux_chiffres || {}).formulations, vars, 'chiffre') || U.fill('{a} : {chiffre}.', vars);
    if (!s.includes(chiffre.split(' ')[0])) s += ' ' + U.sentence(`${U.cap(vars.a)} : ${vars.chiffre}`);
    const st = dt.statut;
    if (st === 'estimé') s += ' Il s’agit d’une estimation.';
    else if (st === 'fictif') s += ' (Valeur fictive, à des fins de démonstration.)';
    else if (st === 'sourcé' && dt.sources && dt.sources[0]) s += ` (Source : ${dt.sources[0].title || dt.sources[0].url}.)`;
    return s;
  }
  function eventSentence(ev, lx, g, sujet) {
    const date = dateLabel(ev.date);
    let s = U.sentence(`${date ? date + ' : ' : ''}${U.cap(String(ev.titre).replace(/[.]$/, ''))}${ev.lieu ? ' (' + ev.lieu + ')' : ''}`);
    if (ev.description) s += ' ' + U.sentence(U.sentences(ev.description)[0] || ev.description);
    const np = eventNP(ev.titre);
    const f = g.fill(lx.formules, { evenement: np, sujet, terme: g.term(lx) }, 'evenement');
    if (f && f.includes(np.slice(0, 14))) s += ' ' + f;
    return s;
  }

  // ============================================================== nodes simples
  const E = {};
  E.sujet = (node) => {
    const d = node.data;
    if (!d.titre) throw new Error('Indiquez un thème.');
    return { titre: d.titre.trim(), angle: (d.angle || '').trim(), motscles: String(d.motscles || '').split(',').map((s) => s.trim()).filter(Boolean) };
  };
  E.brief = (node) => Object.assign({}, node.data);
  E.note = (node) => ({ titre: node.data.titre || 'Note', texte: node.data.texte || '', source: node.data.source || '' });
  E.evenement = (node, inp) => {
    const d = node.data;
    if (!d.titre) throw new Error('Donnez un titre à l’événement.');
    const self = { id: node.id, titre: d.titre, date: d.date, lieu: d.lieu, type: d.type, description: d.description, impact: Number(d.impact) || 3 };
    const prev = C.events(C.items(inp.precedents));
    for (const p of prev) if (p.type === 'déclencheur') p.type = 'précédent';
    const chrono = prev.concat([self]).sort((a, b) => (C.dateNum(a.date) ?? 1e9) - (C.dateNum(b.date) ?? 1e9));
    return Object.assign({}, self, { chronologie: chrono });
  };
  E.donnee = (node, inp) => {
    const d = node.data;
    const serie = U.parseSerie(d.serie);
    const valeur = U.parseNum(d.valeur);
    const sources = d.source ? [{ title: d.source, url: /^https?:/.test(d.source) ? d.source : '' }] : [];
    let statut = d.fiabilite && d.fiabilite !== 'auto' ? d.fiabilite : null;
    if (!statut) statut = valeur == null && !serie.length ? 'inconnu' : d.mode === 'estimation' ? 'estimé' : d.source ? 'sourcé' : 'saisi';
    if (!d.libelle && !d.question) throw new Error('Indiquez une question ou un libellé.');
    return {
      libelle: d.libelle || U.truncateWords(d.question, 7), question: d.question || d.libelle, valeur, valeurTexte: d.valeur || '',
      unite: d.unite || '', periode: d.periode || '', lieu: d.lieu || '', serie, sources, statut, hypotheses: [],
      mode: d.mode, note: statut === 'inconnu' && d.mode !== 'saisie' ? 'Valeur à rechercher : activez un moteur IA (ou renseignez-la).' : '',
    };
  };
  E.lexique = (node) => {
    const d = node.data;
    const id = LX.lex.byId[d.lexique] ? d.lexique : 'neutre';
    return { ids: [id], poids: { [id]: 1 }, registre: d.registre, intensite: Number(d.intensite) || 3, extras: String(d.ajouts || '').split(',').map((s) => s.trim()).filter(Boolean) };
  };
  E.mixeur = (node, inp) => {
    const outs = C.items(inp.lexiques);
    if (!outs.length) throw new Error('Branchez au moins deux nodes « Éléments de langage ».');
    const ids = [], poids = {};
    for (const o of outs) for (const id of o.ids || []) {
      if (!ids.includes(id)) ids.push(id);
      const w = node.data.poids && node.data.poids[id] != null ? Number(node.data.poids[id]) : 1;
      poids[id] = w * ((o.poids && o.poids[id]) || 1);
    }
    return {
      ids, poids, mode: node.data.mode,
      registre: outs[0].registre || 'institutionnel',
      intensite: Math.round(U.mean(outs.map((o) => Number(o.intensite) || 3))),
      extras: outs.flatMap((o) => o.extras || []),
    };
  };
  E.style = (node, inp) => {
    const d = node.data;
    const st = LX.STYLES[d.style] || LX.STYLES.motion_flat;
    const lexOut = C.first(inp.lexique);
    const lx = lexOut ? LX.lex.get(lexOut.ids[0]) : null;
    const custom = String(d.palette || '').match(/#[0-9a-f]{6}/gi);
    return {
      style: d.style, nom: st.nom, prompt_en: st.en, prompt_fr: st.fr,
      palette: custom && custom.length ? custom : lx ? lx.visuel.palette : st.palette,
      typo: d.typo || (lx && lx.visuel.typographie) || st.typo,
      ambiance: d.ambiance || '', lexId: lx ? lx.id : null,
      motion_en: lx ? lx.visuel.style_motion_en : '', motion_fr: lx ? lx.visuel.style_motion : '',
    };
  };

  // ============================================================== comparaison
  function quant(it, agg) {
    if (!it || it.kind !== 'donnee') return null;
    let v = it.valeur;
    const serie = it.serie || [];
    if (v == null && serie.length) {
      const ys = serie.map((p) => p.y);
      v = agg === 'moyenne' ? U.mean(ys) : agg === 'derniere' ? ys[ys.length - 1] : ys.reduce((s, x) => s + x, 0);
    }
    return { libelle: it.libelle || it.question, valeur: v, unite: it.unite || '', serie, statut: it.statut, periode: it.periode, lieu: it.lieu, sources: it.sources || [] };
  }
  E.comparaison = (node, inp) => {
    const d = node.data;
    const g = makeGen(node);
    const A = C.first(inp.a), B = C.first(inp.b);
    if (!A || !B) throw new Error('Branchez deux éléments sur les entrées A et B.');
    const qa = quant(A, d.agregation), qb = quant(B, d.agregation);
    const la = C.title(A) || 'A', lb = C.title(B) || 'B';
    const npa = withArticle(la), npb = withArticle(lb);
    const constats = [], gardes = [];
    const chiffres = {};
    let mode = d.mode;
    const both = qa && qb && qa.valeur != null && qb.valeur != null && qb.valeur !== 0 && qa.valeur !== 0;
    // séries communes
    let commun = [];
    if (qa && qb && qa.serie.length && qb.serie.length) {
      const mb = new Map(qb.serie.map((p) => [p.x, p.y]));
      commun = qa.serie.filter((p) => mb.has(p.x)).map((p) => ({ x: p.x, a: p.y, b: mb.get(p.x) }));
    }
    if (mode === 'auto') {
      if (commun.length >= 3) mode = 'correlation';
      else if (both && qa.unite && qa.unite.toLowerCase() === qb.unite.toLowerCase()) mode = 'quantitatif';
      else if (both) mode = 'grandeur';
      else mode = 'analogie';
    }
    const visuel = { type: 'balance', items: [] };
    const emoA = U.emojiFor(la + ' ' + (qa ? qa.unite : ''), '🟦'), emoB = U.emojiFor(lb + ' ' + (qb ? qb.unite : ''), '🟧');
    if (both) {
      let va = qa.valeur, vb = qb.valeur;
      const pa = U.parseNum(d.popA), pb = U.parseNum(d.popB);
      if (pa && pb) {
        va = (va / pa) * 1000; vb = (vb / pb) * 1000;
        chiffres.parHabitant = true;
        constats.push(`Rapportés à la population : ${U.fmt(va)} pour 1 000 habitants côté A, ${U.fmt(vb)} côté B.`);
      }
      const ratio = va / vb;
      Object.assign(chiffres, {
        a: va, b: vb, ratio, inverse: vb / va, ecart: va - vb, ecartPct: ((va - vb) / vb) * 100,
        ordres: Math.log10(Math.abs(ratio)),
      });
      const ua = qa.unite || '', ub = qb.unite || '';
      constats.push(`A — ${U.cap(npa)} : ${U.withUnit(U.fmtBig(va), ua)}${qa.periode ? ' (' + qa.periode + ')' : ''}.`);
      constats.push(`B — ${U.cap(npb)} : ${U.withUnit(U.fmtBig(vb), ub)}${qb.periode ? ' (' + qb.periode + ')' : ''}.`);
      const big = ratio >= 1;
      const r1 = big ? ratio : 1 / ratio;
      constats.push(`Rapport ${big ? 'A/B' : 'B/A'} : ${U.fmt(r1)} pour 1.`);
      if (Math.abs(chiffres.ordres) >= 1) constats.push(`Écart d’environ ${U.fmt(Math.abs(chiffres.ordres), 1)} ordre(s) de grandeur.`);
      chiffres.unite = big ? `${U.fmt(ratio)} ${ua || 'unités de A'} pour chaque ${singular(ub) || 'unité de B'}` : `${U.fmt(1 / ratio)} ${ub || 'unités de B'} pour chaque ${singular(ua) || 'unité de A'}`;
      visuel.type = Math.abs(chiffres.ordres) > 1.3 ? 'pictos' : 'barres';
      visuel.items = [
        { label: la, value: va, unite: ua, emoji: emoA },
        { label: lb, value: vb, unite: ub, emoji: emoB },
      ];
      visuel.ratio = r1;
      visuel.ratioText = big ? `1 ${emoB} = ${U.fmt(ratio)} ${emoA}` : `1 ${emoA} = ${U.fmt(1 / ratio)} ${emoB}`;
      visuel.ratioWords = big ? `1 ${singular(ub) || lb} = ${U.fmt(ratio)} ${ua || la}` : `1 ${singular(ua) || la} = ${U.fmt(1 / ratio)} ${ub || lb}`;
      if (ua && ub && ua.toLowerCase() !== ub.toLowerCase()) gardes.push(`Les unités diffèrent (${ua} / ${ub}) : le rapport sert d’unité de mesure parlante, pas de mesure d’un lien.`);
    }
    if (commun.length >= 3) {
      const r = U.pearson(commun.map((p) => p.a), commun.map((p) => p.b));
      chiffres.correlation = r;
      chiffres.n = commun.length;
      const force = r == null ? 'non calculable' : Math.abs(r) >= 0.7 ? 'forte' : Math.abs(r) >= 0.3 ? 'modérée' : 'faible';
      constats.push(`Sur ${commun.length} périodes communes (${commun[0].x}–${commun[commun.length - 1].x}), la corrélation vaut r = ${U.fmt(r, 2)} (${force}${r != null ? (r >= 0 ? ', même sens' : ', sens opposé') : ''}).`);
      const base = (arr) => { const b0 = arr.find((v) => v !== 0) || 1; return arr.map((v) => (v / b0) * 100); };
      const ia = base(commun.map((p) => p.a)), ib = base(commun.map((p) => p.b));
      const ga = ia[ia.length - 1] - 100, gb = ib[ib.length - 1] - 100;
      chiffres.evolA = ga; chiffres.evolB = gb;
      constats.push(`Évolution sur la période : ${ga >= 0 ? '+' : ''}${U.fmt(ga, 1)} % pour A, ${gb >= 0 ? '+' : ''}${U.fmt(gb, 1)} % pour B (base 100 au départ).`);
      visuel.type = 'courbes';
      visuel.x = commun.map((p) => p.x);
      visuel.series = [{ label: la, values: ia, emoji: emoA }, { label: lb, values: ib, emoji: emoB }];
      gardes.push('Corrélation n’est pas causalité : deux séries peuvent évoluer ensemble sous l’effet d’une troisième variable (le temps, la conjoncture, la météo…).');
      if (commun.length < 8) gardes.push(`Échantillon court (n = ${commun.length}) : une corrélation sur peu de points est fragile.`);
      if (Math.abs(r || 0) >= 0.7 && mode !== 'absurde') gardes.push('Une corrélation forte entre phénomènes sans lien plausible est le cas d’école des « corrélations fallacieuses ».');
    }
    for (const q of [qa, qb]) {
      if (!q) continue;
      if (q.statut === 'estimé') gardes.push(`${U.cap(withArticle(q.libelle))} : valeur estimée, à confirmer.`);
      if (q.statut === 'fictif') gardes.push(`${U.cap(withArticle(q.libelle))} : valeur fictive (démonstration).`);
      if (q.statut === 'inconnu' || q.valeur == null) gardes.push(`${U.cap(withArticle(q.libelle))} : valeur manquante — renseignez-la ou lancez la recherche avec un moteur IA.`);
    }

    // conclusion selon le mode
    let conclusion, resume;
    const r1 = chiffres.ratio ? (chiffres.ratio >= 1 ? chiffres.ratio : 1 / chiffres.ratio) : null;
    const big = chiffres.ratio >= 1;
    switch (mode) {
      case 'absurde':
        resume = both
          ? `Mettre côte à côte ${npa} et ${npb} n’a, a priori, aucun sens. C’est justement ce qui rend l’exercice utile : il fabrique une unité de mesure inattendue (${chiffres.unite}).`
          : `Rapprocher ${npa} et ${npb} relève du grand écart ; l’intérêt est de forcer un changement de regard.`;
        conclusion = both
          ? g.r.pick([
            `chaque ${singular(big ? qb.unite : qa.unite) || 'unité'} de ${big ? lb : la} « vaut » ${U.fmt(r1)} ${(big ? qa.unite : qb.unite) || 'unités'} de ${big ? la : lb}, un rapport qui ne prouve rien mais qui se retient`,
            `il faudrait ${U.fmt(r1)} fois ${big ? npb : npa} pour égaler ${big ? npa : npb}, ce qui en dit plus sur nos échelles mentales que sur les deux phénomènes`,
          ])
          : `la comparaison vaut surtout comme exercice de pensée latérale`;
        if (chiffres.correlation != null) {
          conclusion += Math.abs(chiffres.correlation) >= 0.7
            ? ` ; et la corrélation (r = ${U.fmt(chiffres.correlation, 2)}) est un parfait exemple de corrélation fallacieuse`
            : ` ; les deux courbes, elles, n’ont pas grand-chose à se dire (r = ${U.fmt(chiffres.correlation, 2)})`;
        }
        gardes.push('Comparaison volontairement décalée : à présenter comme telle (humour, pédagogie de l’ordre de grandeur).');
        break;
      case 'correlation': {
        const rr = chiffres.correlation;
        resume = `Les deux séries ${rr >= 0.3 ? 'évoluent dans le même sens' : rr <= -0.3 ? 'évoluent en sens contraire' : 'ne montrent pas de lien net'} sur la période commune.`;
        conclusion = Math.abs(rr) >= 0.7
          ? `${npa} et ${npb} évoluent de concert (r = ${U.fmt(rr, 2)}), sans que cela établisse le moindre lien de cause à effet`
          : Math.abs(rr) >= 0.3
            ? `un lien modéré apparaît entre ${npa} et ${npb} (r = ${U.fmt(rr, 2)}), à confirmer sur une période plus longue`
            : `rien ne relie statistiquement ${npa} et ${npb} sur la période (r = ${U.fmt(rr, 2)})`;
        break;
      }
      case 'quantitatif':
        resume = `${U.cap(big ? npa : npb)} dépasse ${big ? npb : npa} : ${U.fmt(r1)} fois plus (écart de ${U.fmtBig(Math.abs(chiffres.ecart))} ${qa.unite}).`;
        conclusion = r1 < 1.1 ? `${npa} et ${npb} sont pratiquement au même niveau` : `${big ? npa : npb} l’emporte nettement, avec un rapport de ${U.fmt(r1)} pour 1`;
        break;
      case 'grandeur':
        resume = `Les deux grandeurs ne se mesurent pas dans la même unité ; leur rapport (${U.fmt(r1)}) sert d’étalon pour se figurer l’échelle.`;
        conclusion = `${big ? npa : npb} est d’un tout autre ordre de grandeur que ${big ? npb : npa} (×${U.fmt(r1)})`;
        break;
      case 'contrefactuel':
        if (chiffres.evolA != null) {
          const hyp = qa.serie[0].y * (1 + chiffres.evolB / 100);
          resume = `Si ${npa} avait suivi la trajectoire de ${npb} (${chiffres.evolB >= 0 ? '+' : ''}${U.fmt(chiffres.evolB, 1)} %), la valeur finale aurait été de ${U.fmtBig(hyp)} au lieu de ${U.fmtBig(qa.serie[qa.serie.length - 1].y)}.`;
          conclusion = `la trajectoire de ${npa} n’a rien d’une fatalité : un autre rythme était concevable`;
        } else if (both) {
          resume = `Et si ${npa} se comportait comme ${npb} ? Il faudrait diviser son volume par ${U.fmt(chiffres.ratio)}.`;
          conclusion = `imaginer ${npa} à l’échelle de ${npb} révèle combien ses ordres de grandeur sont propres à son contexte`;
        } else {
          resume = `Et si ${npa} obéissait aux mêmes règles que ${npb} ?`;
          conclusion = `transposer la logique de ${npb} à ${npa} ouvre des pistes inattendues`;
        }
        break;
      default: // analogie
        resume = `${U.cap(npa)} et ${npb} relèvent de deux univers distincts ; l’analogie consiste à chercher ce qu’ils partagent (une dynamique, une saisonnalité, une dépendance à la demande…) et ce qui les sépare.`;
        conclusion = `rapprocher ${npa} et ${npb} éclaire chacun par contraste, sans rien démontrer`;
        gardes.push('Comparaison qualitative : sans données chiffrées, l’analogie éclaire mais ne prouve pas.');
    }
    if (d.question) resume = U.sentence(d.question.replace(/\?$/, '') + ' ?').replace(/\.$/, '') + ' ' + resume;
    if (!visuel.items.length) visuel.items = [{ label: la, emoji: emoA }, { label: lb, emoji: emoB }];
    return {
      titre: `${la} ↔ ${lb}`, a: { libelle: la, ...(qa || {}) }, b: { libelle: lb, ...(qb || {}) }, mode, chiffres,
      constats, resume, conclusion: conclusion.replace(/\.$/, ''), mises_en_garde: Array.from(new Set(gardes)), visuel,
    };
  };

  // ============================================================== réflexion
  function chooseStructure(d, lexes) {
    if (d.structure && d.structure !== 'auto') {
      if (GENERIC_STRUCTS[d.structure]) return Object.assign({ generic: true }, GENERIC_STRUCTS[d.structure]);
      const [id, idx] = String(d.structure).split('::');
      const lx = LX.lex.byId[id];
      if (lx && lx.structures[Number(idx)]) return Object.assign({ lexId: id }, lx.structures[Number(idx)]);
    }
    const dom = lexes.slice().sort((a, b) => b.w - a.w)[0];
    if (dom && dom.lx.structures.length) return Object.assign({ lexId: dom.lx.id }, dom.lx.structures[0]);
    return Object.assign({ generic: true }, GENERIC_STRUCTS['gen:dialectique']);
  }
  function confidenceOf(datas, brief) {
    if (brief && brief.mode === 'fiction') return { niveau: 'fiction', note: 'Fiction / satire assumée : à présenter comme telle.' };
    if (!datas.length) return { niveau: 'qualitative', note: 'Raisonnement qualitatif : aucune donnée chiffrée branchée.' };
    const st = datas.map((d) => d.statut);
    if (st.includes('fictif')) return { niveau: 'démonstration', note: 'Repose sur des valeurs fictives : ne pas diffuser comme un fait.' };
    if (st.includes('inconnu')) return { niveau: 'faible', note: 'Certaines valeurs manquent.' };
    if (st.includes('estimé')) return { niveau: 'moyenne', note: 'Repose en partie sur des estimations, signalées comme telles.' };
    if (st.every((s) => s === 'sourcé')) return { niveau: 'élevée', note: 'Toutes les données sont sourcées.' };
    return { niveau: 'à vérifier', note: 'Données saisies sans source : à vérifier avant diffusion.' };
  }

  E.reflexion = (node, inp) => {
    const d = node.data;
    const g = makeGen(node);
    let lexes = C.lexes(inp.lexiques);
    if (!lexes.length) lexes = [{ lx: LX.lex.get('neutre'), w: 1, registre: 'institutionnel', intensite: 2 }];
    const brief = C.first(inp.brief);
    const items = C.items(inp.elements);
    const sujetIt = C.first(inp.sujet) || items.find((i) => i.kind === 'sujet');
    const sujetTitre = sujetIt ? C.title(sujetIt) : items.length ? C.title(items[0]) : '';
    if (!sujetTitre) throw new Error('Branchez un Sujet (ou au moins un élément).');
    const sujet = withArticle(sujetTitre);
    const events = C.events(items);
    const datas = items.filter((i) => i.kind === 'donnee');
    const comps = items.filter((i) => i.kind === 'comparaison');
    const texts = items.filter((i) => i.kind === 'texte' || i.kind === 'reflexion');
    const conclusionVar = C.conclusionOf(items) || g.r.pick(GENERIC_CONCL);
    const comp = comps[0];
    const baseVars = {
      sujet, public: brief && brief.public ? withArticle(brief.public) : 'le public', conclusion: conclusionVar,
      a: comp ? withArticle(comp.a.libelle) : datas[0] ? withArticle(datas[0].libelle) : null,
      b: comp ? withArticle(comp.b.libelle) : datas[1] ? withArticle(datas[1].libelle) : null,
      chiffre: datas[0] ? C.valueText(datas[0]) || null : null,
      evenement: events[0] ? eventNP(events[0].titre) : null,
      element: datas[0] ? withArticle(datas[0].libelle) : events[0] ? eventNP(events[0].titre) : sujet,
    };
    const struct = chooseStructure(d, lexes);
    const per = { court: 1, moyen: 2, long: 4 }[d.longueur] || 2;
    const dominant = lexes.slice().sort((a, b) => b.w - a.w)[0];
    const mixMode = lexes[0].mode || 'fusion';
    const pools = {
      contexte: events.filter((e) => e.type !== 'déclencheur' && e.type !== 'crise' && e.type !== 'rupture'),
      faits: events.filter((e) => ['déclencheur', 'crise', 'rupture'].includes(e.type)).concat(datas),
      analyse: comps.concat(texts),
      tension: [], hypothese: [], decision: [], projection: [], conclusion: [],
    };
    if (!pools.faits.length && datas.length === 0 && events.length) pools.faits = events.slice(-1);
    // si la structure n'a pas d'étape « faits » ou « contexte », on reverse dans l'étape la plus proche
    const roles = struct.etapes.map((e) => e.role);
    const redirect = { contexte: ['faits', 'analyse'], faits: ['analyse', 'contexte', 'conclusion'], analyse: ['tension', 'hypothese', 'conclusion', 'faits'] };
    for (const [from, tos] of Object.entries(redirect)) {
      if (roles.includes(from) || !pools[from].length) continue;
      const to = tos.find((t) => roles.includes(t));
      if (to) { pools[to] = pools[to].concat(pools[from]); pools[from] = []; }
    }
    const consumed = new Set();
    const pickLex = (i) => {
      if (lexes.length === 1) return lexes[0];
      if (mixMode === 'alternance') return lexes[i % lexes.length];
      if (mixMode === 'dominante') return g.r() < 0.75 ? dominant : g.r.pick(lexes);
      return g.r.weighted(lexes, (x) => x.w);
    };

    const seenSent = new Set();
    const etapes = struct.etapes.map((st, i) => {
      const L1 = pickLex(i);
      const lx = L1.lx;
      const vars = Object.assign({}, baseVars, { terme: g.term(lx) });
      const sents = [];
      // 1) phrase d'ouverture de l'étape (gabarit du lexique, sinon générique)
      const own = (st.gabarits && st.gabarits.length ? st.gabarits : []).concat(gabaritsFor(lx, st.role));
      let open = g.fill(own, vars);
      if (open) {
        let conLex = lx;
        if (mixMode === 'fusion' && lexes.length > 1 && g.r() < 0.6) conLex = g.r.pick(lexes.filter((x) => x.lx !== lx)).lx;
        if (i > 0 && g.r() < 0.7) open = lead(g.conn(conLex), open);
        sents.push(open);
      }
      // 2) contenu branché, rangé selon le rôle
      const pool = (pools[st.role] || []).filter((x) => !consumed.has(x));
      for (const it of pool.slice(0, per + 1)) {
        consumed.add(it);
        if (it.kind === 'donnee') sents.push(dataSentence(it, lx, g, sujet));
        else if (!it.kind || it.kind === 'evenement') sents.push(eventSentence(it, lx, g, sujet));
        else if (it.kind === 'comparaison') {
          sents.push(U.sentence(U.stripMarks(it.resume)));
          if (it.constats && it.constats[2]) sents.push(U.sentence(it.constats[2]));
        } else if (it.kind === 'texte' || it.kind === 'reflexion') {
          const ss = U.sentences(C.text(it)).slice(0, per);
          if (ss.length) sents.push(ss.join(' '));
        } else if (it.titre) sents.push(eventSentence(it, lx, g, sujet));
      }
      // 3) rôle spécifique
      if (st.role === 'tension') {
        const gardes = comps.flatMap((c) => c.mises_en_garde || []);
        if (gardes.length) sents.push(U.sentence(g.r.pick(gardes)));
        const pg = g.r.pick(lx.pieges);
        if (pg && per > 1) sents.push(U.sentence('Il faudra aussi se garder d’un travers bien connu : ' + U.np(pg).replace(/\.$/, '').replace(/^./, (c) => c.toLowerCase())));
      }
      if (st.role === 'hypothese' || (st.role === 'analyse' && per > 1)) {
        const cad = g.r.pick(lx.cadres.filter((c) => !g.used.has(c.nom)));
        if (cad) {
          g.used.add(cad.nom);
          const q = U.fill(cad.question, vars).replace(/\.$/, '');
          sents.push(U.sentence(`Sous l’angle « ${cad.nom} », la question devient : ${q.charAt(0).toLowerCase() + q.slice(1)}${/\?$/.test(q) ? '' : ' ?'}`));
        }
      }
      if (st.role === 'conclusion' && comps.length && !(open || '').includes(conclusionVar.slice(0, 20))) {
        sents.push(U.sentence(U.cap(conclusionVar)));
      }
      // 4) formules de langage (dose = intensité) et registre
      const extra = Math.max(0, Math.round(((L1.intensite || 3) - 1) / 2)) + (per > 2 ? 1 : 0) - (sents.length > per + 1 ? 1 : 0);
      for (let k = 0; k < extra; k++) {
        const f = g.fill(lx.formules, vars);
        if (f) sents.push(f);
      }
      if (L1.registre === 'vulgarisation' && lx.vocabulaire.length) {
        const v = g.r.pick(lx.vocabulaire);
        sents.push(U.sentence(`Concrètement, « ${v.terme} » désigne ${U.np(v.sens).replace(/\.$/, '')}`));
      } else if (L1.registre === 'critique' && lx.pieges.length && st.role !== 'tension' && g.r() < 0.5) {
        sents.push(U.sentence('Reste un travers à surveiller : ' + U.np(g.r.pick(lx.pieges)).replace(/[.\s]+$/, '').replace(/^./, (c) => c.toLowerCase())));
      }
      if (!sents.length) sents.push(U.fill(g.r.pick(ROLE_TPL[st.role] || ROLE_TPL.analyse), vars));
      // anti-répétition : une phrase déjà dite ailleurs dans la réflexion n'est pas répétée
      const uniq = [];
      for (const block of sents) {
        for (const s1 of U.sentences(block)) {
          const key = U.stripMarks(s1).toLowerCase().replace(/[^a-z0-9àâçéèêëîïôûùüœ]+/g, ' ').trim().slice(0, 80);
          if (!key || seenSent.has(key)) continue;
          seenSent.add(key);
          uniq.push(s1);
        }
      }
      const capN = per * 2 + 3;
      const allLex = lexes.map((x) => x.lx);
      return { titre: st.titre, role: st.role, lex: lx.id, texte: LX.lex.markTerms((uniq.length ? uniq : sents).slice(0, capN).join(' '), allLex) };
    });

    const these = LX.lex.markTerms(U.sentence(`${U.cap(sujet)} : ${conclusionVar}`), lexes.map((x) => x.lx));
    const concTpl = gabaritsFor(dominant.lx, 'conclusion');
    const conclusion = LX.lex.markTerms(g.fill(concTpl, Object.assign({}, baseVars, { terme: g.term(dominant.lx) }), 'conclusion') || U.sentence(conclusionVar), lexes.map((x) => x.lx));
    const contre = Array.from(new Set(comps.flatMap((c) => c.mises_en_garde || []).concat(g.r.sample(lexes.flatMap((x) => x.lx.pieges), 3)))).slice(0, 5);
    const termes = [];
    const seen = new Set();
    for (const e of etapes) for (const t of LX.lex.termsIn(e.texte)) if (!seen.has(t.terme.toLowerCase())) { seen.add(t.terme.toLowerCase()); termes.push(t); }
    return {
      titre: U.cap(sujetTitre), these, structure: struct.nom, lexiques: lexes.map((x) => x.lx.id), etapes, conclusion,
      contre_arguments: contre, termes, sources: datas.flatMap((x) => x.sources || []).filter((s) => s.url),
      confiance: confidenceOf(datas, brief), brief: brief || null,
      // matériaux transmis à l'aval (le short s'en sert pour ses graphiques)
      materiaux: {
        comparaisons: comps.map((c) => ({ kind: 'comparaison', titre: c.titre, a: c.a, b: c.b, mode: c.mode, chiffres: c.chiffres, visuel: c.visuel, resume: c.resume, conclusion: c.conclusion, mises_en_garde: c.mises_en_garde, constats: c.constats })),
        donnees: datas.map((d) => ({ kind: 'donnee', libelle: d.libelle, valeur: d.valeur, unite: d.unite, serie: d.serie, statut: d.statut, periode: d.periode, lieu: d.lieu, sources: d.sources })),
        evenements: events,
      },
    };
  };

  // ============================================================== prisme
  const firstAlt = (s) => String(s).split(/\s*\/\s*/)[0].trim();
  const alts = (s) => String(s).split(/\s*\/\s*/).map((x) => x.trim()).filter((x) => x.length > 2);
  function translateText(text, lx, intention) {
    let t = text;
    if (['traduire', 'defendre', 'languedebois', 'satiriser'].includes(intention)) {
      for (const s of lx.substitutions) t = U.replaceWord(t, s.de, s.vers);
    }
    if (['defendre', 'languedebois', 'satiriser'].includes(intention)) {
      for (const e of lx.euphemismes) for (const b of alts(e.brut)) t = U.replaceWord(t, b, firstAlt(e.edl));
    }
    if (intention === 'vulgariser' || intention === 'critiquer') {
      for (const e of lx.euphemismes) for (const a of alts(e.edl)) if (a.length > 4) t = U.replaceWord(t, a, firstAlt(e.brut));
      if (intention === 'vulgariser') for (const s of lx.substitutions) if (s.vers.length > 4) t = U.replaceWord(t, s.vers, s.de);
    }
    return t;
  }
  E.prisme = (node, inp) => {
    const d = node.data;
    const g = makeGen(node);
    const lexIn = C.lexes(inp.lexique);
    const lexes = lexIn.length ? lexIn : [{ lx: LX.lex.get(d.lexique), w: 1, registre: 'institutionnel', intensite: 3 }];
    const items = C.items(inp.contenu);
    if (!items.length) throw new Error('Branchez un contenu à faire passer dans le prisme.');
    const titre = C.title(items[0]);
    const src = items.map(C.text).join(' ');
    const sentences = U.sentences(src.replace(/\n+/g, '. '));
    const n = { court: 1, moyen: 2, long: 3 }[d.longueur] || 2;
    const conclusionTxt = C.conclusionOf(items);
    const isConcl = (s) => conclusionTxt && U.stripMarks(s).toLowerCase().includes(conclusionTxt.toLowerCase().slice(0, 30));
    const keep = sentences.filter((s) => !isConcl(s) && !/\?$/.test(s)).filter((s) => /\d/.test(s)).concat(sentences.filter((s) => !isConcl(s)))
      .filter((s, i, a) => a.indexOf(s) === i).slice(0, n);
    const lx = g.r.weighted(lexes, (x) => x.w).lx;
    const comp = items.find((i) => i.kind === 'comparaison');
    const np0 = C.nounPhrase(items[0]);
    const vars = {
      sujet: np0, element: np0, conclusion: conclusionTxt || g.r.pick(GENERIC_CONCL),
      a: comp ? withArticle(comp.a.libelle) : null, b: comp ? withArticle(comp.b.libelle) : null,
      chiffre: comp && comp.chiffres && comp.chiffres.ratio ? 'un rapport de ' + U.fmt(comp.chiffres.ratio >= 1 ? comp.chiffres.ratio : 1 / comp.chiffres.ratio) + ' pour 1' : null,
      public: 'le public', terme: g.term(lx),
    };
    const paras = [];
    const intro = [g.fill(lx.formules, vars, 'sujet')];
    if (d.intention === 'languedebois' || d.intention === 'satiriser') intro.push(g.fill(lx.formules, vars), g.fill(lx.formules, vars));
    paras.push(intro.filter(Boolean).join(' '));
    const L = (x) => lexes.length > 1 ? g.r.weighted(lexes, (y) => y.w).lx : lx;
    const body = keep.map((s, i) => {
      const lxi = L(i);
      let t = translateText(U.sentence(s.replace(/^Conclusion\s*:\s*/i, '')), lxi, d.intention);
      if (i > 0 && g.r() < 0.5) t = lead(g.conn(lxi), t);
      return t;
    });
    paras.push(body.join(' '));
    // la lecture propre au langage : gabarits de ses structures argumentatives
    const nLens = { court: 1, moyen: 2, long: 4 }[d.longueur] || 2;
    const roles = d.intention === 'critiquer' ? ['tension', 'analyse', 'hypothese', 'tension'] : d.intention === 'defendre' ? ['decision', 'analyse', 'projection', 'faits'] : ['analyse', 'hypothese', 'tension', 'projection'];
    const lens = [];
    for (const role of roles.slice(0, nLens)) {
      const lxi = L(role);
      const t = g.fill(steps(lxi, role).flatMap((e) => e.gabarits || []).concat(lxi.formules), Object.assign({}, vars, { terme: g.term(lxi) }));
      if (t) lens.push(lens.length && g.r() < 0.6 ? lead(g.conn(lxi), t) : t);
    }
    if (lens.length) paras.push(lens.join(' '));
    const frames = g.r.sample(lx.cadres, d.longueur === 'court' ? 1 : d.longueur === 'long' ? 3 : 2).map((c) => {
      const q = U.fill(c.question, vars).replace(/\.$/, '');
      return U.sentence(`« ${c.nom} » : ${q.charAt(0).toLowerCase() + q.slice(1)}${/\?$/.test(q) ? '' : ' ?'}`);
    });
    if (d.intention === 'critiquer') frames.push(...g.r.sample(lx.pieges, 2).map((p) => U.sentence('Point de vigilance : ' + U.np(p).replace(/^./, (c) => c.toLowerCase()))));
    if (d.intention === 'defendre') frames.push(U.sentence(`Ce qui est en jeu : ${g.r.sample(lx.valeurs, 3).join(', ')}`));
    if (d.intention === 'vulgariser') frames.push(...g.r.sample(lx.vocabulaire, 2).map((v) => U.sentence(`« ${v.terme} », c’est ${U.np(v.sens).replace(/\.$/, '')}`)));
    if (d.intention === 'satiriser') frames.push(U.sentence(`Bref, comme on dit dans le métier, c’est ${U.np(g.r.pick(lx.metaphores) || 'un dossier sensible').replace(/\.$/, '')}`), U.sentence(`Toute ressemblance avec un travers connu du métier (${U.np(g.r.pick(lx.pieges) || 'la langue de bois').replace(/[.\s]+$/, '').replace(/^./, (c) => c.toLowerCase())}) serait purement fortuite`));
    paras.push(frames.join(' '));
    const close = g.fill(gabaritsFor(lx, 'conclusion'), vars, 'conclusion');
    if (close) paras.push(close);
    const allLex = lexes.map((x) => x.lx);
    const texte = paras.filter(Boolean).map((p) => LX.lex.markTerms(p, allLex)).join('\n\n');
    return {
      titre: `${U.cap(titre)} — vu par ${lexes.map((x) => x.lx.nom).join(' × ')}`, texte, intention: d.intention,
      lexiques: allLex.map((x) => x.id), termes: LX.lex.termsIn(texte), satire: d.intention === 'satiriser',
    };
  };

  // ============================================================== décodeur
  E.decodeur = (node, inp) => {
    const d = node.data;
    const items = C.items(inp.texte);
    if (!items.length) throw new Error('Branchez un texte à décoder.');
    const original = items.map(C.text).join('\n\n');
    const lexes = (d.cible === 'metiers' ? LX.lex.metiers() : LX.lex.all).filter((x) => x.id !== 'neutre');
    const detections = [];
    let plain = original;
    const mark = new Set();
    for (const lx of lexes) {
      for (const e of lx.euphemismes) for (const a of alts(e.edl)) {
        if (a.length < 5 || mark.has(a.toLowerCase()) || !plain.toLowerCase().includes(a.toLowerCase())) continue;
        if (U.wordRe(a, 'i').test(plain)) {
          mark.add(a.toLowerCase());
          detections.push({ type: 'euphémisme', trouve: a, clair: firstAlt(e.brut), lex: lx.id, note: e.commentaire || '' });
          plain = plain.replace(U.wordRe(a, 'gi'), (m, pre, w) => `${pre}${w} [→ ${firstAlt(e.brut)}]`);
        }
      }
      for (const s of lx.substitutions) {
        if (s.vers.length < 5 || mark.has(s.vers.toLowerCase()) || !plain.toLowerCase().includes(s.vers.toLowerCase())) continue;
        // les mots isolés et courants (« décision », « information »…) ne sont pas du jargon : on ne garde que les expressions
        if (!/[\s'’-]/.test(s.vers) && !lx.vocabulaire.some((v) => v.terme.toLowerCase() === s.vers.toLowerCase())) continue;
        if (U.wordRe(s.vers, 'i').test(plain)) {
          mark.add(s.vers.toLowerCase());
          detections.push({ type: 'jargon', trouve: s.vers, clair: s.de, lex: lx.id });
          plain = plain.replace(U.wordRe(s.vers, 'gi'), (m, pre, w) => `${pre}${w} [→ ${s.de}]`);
        }
      }
    }
    const origLow = original.toLowerCase();
    for (const lx of lexes) for (const v of lx.vocabulaire) {
      if (v.terme.length < 5 || mark.has(v.terme.toLowerCase()) || !origLow.includes(v.terme.toLowerCase())) continue;
      if (U.wordRe(v.terme, 'i').test(original)) {
        mark.add(v.terme.toLowerCase());
        detections.push({ type: 'terme', trouve: v.terme, clair: v.sens, lex: lx.id });
      }
    }
    const words = U.words(original).length || 1;
    const nE = detections.filter((x) => x.type === 'euphémisme').length;
    const nJ = detections.filter((x) => x.type === 'jargon').length;
    const nT = detections.filter((x) => x.type === 'terme').length;
    const densite = ((3 * nE + 2 * nJ + nT) / words) * 100;
    const indice = Math.min(100, Math.round(densite * 5));
    const verdict = indice < 20 ? 'langage plutôt clair' : indice < 45 ? 'jargon modéré' : indice < 70 ? 'langue de bois marquée' : 'langue de bois caricaturale';
    const parLex = {};
    for (const x of detections) parLex[x.lex] = (parLex[x.lex] || 0) + 1;
    const signature = Object.entries(parLex).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, k]) => `${LX.lex.get(id).nom} (${k})`);
    return {
      titre: 'Décodage', texte: plain, original, detections,
      scores: { mots: words, jargon: Math.round(((nE + nJ + nT) / words) * 100), lisibilite: U.readability(original), indice, verdict, signature },
    };
  };

  // ============================================================== table ronde
  E.debat = (node, inp) => {
    const d = node.data;
    const g = makeGen(node);
    const voices = C.lexes(inp.voix).filter((v, i, a) => a.findIndex((x) => x.lx.id === v.lx.id) === i).slice(0, 5);
    if (voices.length < 2) throw new Error('Branchez au moins deux nodes « Éléments de langage » (un par intervenant).');
    const items = C.items(inp.elements);
    const sujetIt = C.first(inp.sujet) || items.find((i) => i.kind === 'sujet');
    const titre = sujetIt ? C.title(sujetIt) : items[0] ? C.title(items[0]) : '';
    if (!titre) throw new Error('Branchez un sujet.');
    const sujet = withArticle(titre);
    const datas = items.filter((i) => i.kind === 'donnee');
    const comps = items.filter((i) => i.kind === 'comparaison');
    const conclusionVar = C.conclusionOf(items) || g.r.pick(GENERIC_CONCL);
    const tours = [];
    const nomDe = (lx) => (lx.famille === 'sociologie' ? 'Sociologue (' + lx.nom.split('—')[0].trim() + ')' : 'Voix « ' + lx.nom + ' »');
    const say = (v, texte) => tours.push({ voix: v ? v.lx.id : 'moderateur', nom: v ? nomDe(v.lx) : 'Modérateur·rice', icone: v ? v.lx.icone : '', couleur: v ? v.lx.couleur : '#cccccc', texte: LX.lex.markTerms(texte, voices.map((x) => x.lx)) });
    const question = sujetIt && sujetIt.angle ? sujetIt.angle.trim() : U.sentence(`Parlons de ${U.np(titre)}`);
    if (d.moderateur) say(null, 'Bienvenue. ' + U.sentence(question) + ' ' + U.sentence(`Autour de la table : ${voices.map((v) => nomDe(v.lx)).join(', ')}`));
    const OPEN = {
      contradictoire: ['Je ne partage pas cette lecture.', 'C’est précisément là que le bât blesse.', 'Permettez-moi de nuancer fortement.', 'Je vais être plus direct.'],
      consensuel: ['Je rejoins ce qui vient d’être dit, avec un éclairage différent.', 'Pour compléter ce point,', 'C’est juste, et j’ajouterais ceci.'],
      interview: ['Pour répondre simplement,', 'Vu de mon côté,', 'Dans mon métier, on le formulerait ainsi.'],
    }[d.format] || [];
    const nTours = Math.max(1, Math.min(4, Number(d.tours) || 2));
    for (let t = 0; t < nTours; t++) {
      voices.forEach((v, i) => {
        const lx = v.lx;
        const prev = tours.length ? tours[tours.length - 1] : null;
        const vars = { sujet, conclusion: conclusionVar, terme: g.term(lx), public: 'le public', element: sujet,
          a: comps[0] ? withArticle(comps[0].a.libelle) : null, b: comps[0] ? withArticle(comps[0].b.libelle) : null,
          chiffre: datas[0] ? C.valueText(datas[0]) : null };
        const parts = [];
        if (d.moderateur && (t > 0 || d.format === 'interview')) {
          const cad = g.r.pick(lx.cadres);
          if (cad) {
            const q = U.fill(cad.question, vars).replace(/\.$/, '');
            say(null, U.sentence(`Question à ${nomDe(lx)} : ${q.charAt(0).toLowerCase() + q.slice(1)}${/\?$/.test(q) ? '' : ' ?'}`));
          }
        }
        if (t === 0) {
          parts.push(g.fill(lx.formules, vars, 'sujet') || g.fill(gabaritsFor(lx, 'contexte'), vars));
          parts.push(g.fill(gabaritsFor(lx, 'analyse'), vars));
          if (datas[i % Math.max(1, datas.length)] && g.r() < 0.7) parts.push(dataSentence(datas[i % datas.length], lx, g, sujet));
        } else {
          parts.push(g.r.pick(OPEN));
          const other = voices[(i + voices.length - 1) % voices.length].lx;
          const tOther = g.r.pick(other.vocabulaire), tMine = g.r.pick(lx.vocabulaire);
          if (tOther && tMine && d.format !== 'consensuel') parts.push(U.sentence(`Ce que mon voisin appelle « ${tOther.terme} », je l’appellerais plutôt « ${tMine.terme} »`));
          if (d.format === 'contradictoire' && other.pieges.length) parts.push(U.sentence(`Le risque, avec cette approche : ${U.np(g.r.pick(other.pieges)).replace(/[.\s]+$/, '').replace(/^./, (c) => c.toLowerCase())}`));
          parts.push(g.fill(gabaritsFor(lx, t === nTours - 1 ? 'conclusion' : 'tension'), vars) || g.fill(lx.formules, vars));
        }
        say(v, parts.filter(Boolean).map(U.sentence).join(' '));
        void prev;
      });
    }
    const valeurs = voices.map((v) => g.r.pick(v.lx.valeurs)).filter(Boolean);
    const synthese = U.sentence(`Ce qui rapproche les intervenants : un même souci de ${valeurs.slice(0, 3).join(', ')}`) + ' ' +
      U.sentence(`Ce qui les sépare : des grilles de lecture différentes (${voices.map((v) => (v.lx.cadres[0] || {}).nom).filter(Boolean).join(' / ')})`) + ' ' +
      U.sentence(`En filigrane, ${conclusionVar}`);
    if (d.moderateur) say(null, U.sentence('Merci à toutes et à tous. Pour conclure') + ' ' + synthese);
    const texte = tours.map((x) => `**${x.nom}** — ${x.texte}`).join('\n\n');
    return { titre: `Table ronde : ${U.cap(titre)}`, format: d.format, tours, synthese, texte, termes: LX.lex.termsIn(texte) };
  };

  // ============================================================== agent spécialiste (version locale)
  E.agent = (node, inp) => {
    const d = node.data;
    const g = makeGen(node);
    const items = C.items(inp.entree).filter((i) => i.kind !== 'lexique');
    const lexes = C.lexes(inp.entree);
    if (!items.length) throw new Error('Branchez au moins un élément à traiter.');
    const titre = C.title(items[0]);
    const datas = items.filter((i) => i.kind === 'donnee');
    const comps = items.filter((i) => i.kind === 'comparaison');
    const all = items.map(C.text).join('\n');
    const lines = [];
    const sujet = withArticle(titre);
    const lxs = lexes.map((x) => x.lx);
    switch (d.role) {
      case 'contradicteur': {
        lines.push(`Objections à « ${U.cap(titre)} » :`);
        const obj = [
          'Les données mobilisées sont-elles comparables (période, périmètre, méthode) ?',
          'Une variable cachée pourrait expliquer à elle seule le phénomène observé.',
          'Le raisonnement suppose une causalité qui n’est pas démontrée.',
          'Le cas étudié est-il représentatif ou choisi pour sa valeur d’exemple ?',
          'Le vocabulaire employé oriente la conclusion avant même l’analyse.',
        ];
        const extra = comps.flatMap((c) => c.mises_en_garde || []).concat(lxs.flatMap((l) => l.pieges));
        g.r.sample(obj, 3).concat(g.r.sample(extra, 3)).forEach((o, i) => lines.push(`${i + 1}. ${U.sentence(o)}`));
        lines.push('Contre-thèse possible : et si ce que l’on observe ne disait rien d’autre que la manière dont on l’a mesuré ?');
        break;
      }
      case 'verificateur': {
        lines.push('Vérification des éléments chiffrés :');
        const nums = (all.match(/\d[\d\s.,]*\s*(%|millions?|milliards?|[a-zéèû]+)?/gi) || []).slice(0, 12);
        if (!datas.length && !nums.length) lines.push('Aucun chiffre détecté.');
        for (const dt of datas) {
          const st = { sourcé: 'sourcé', saisi: 'saisi sans source (à vérifier)', estimé: 'estimation', fictif: 'fictif', inconnu: 'manquant' }[dt.statut] || dt.statut;
          lines.push(`• ${dt.libelle} : ${C.valueText(dt) || '—'} → ${st}${dt.sources && dt.sources[0] ? ' (' + (dt.sources[0].title || dt.sources[0].url) + ')' : ''}`);
        }
        for (const c of comps) if (c.chiffres && c.chiffres.ratio) lines.push(`• Rapport ${c.titre} : ${U.fmt(c.chiffres.ratio)} — recalculé à partir des valeurs branchées.`);
        if (nums.length && !datas.length) lines.push('Chiffres repérés dans le texte : ' + nums.map((x) => x.trim()).join(' ; ') + ' — sources non fournies.');
        lines.push('Recommandation : citer la source de chaque chiffre à l’écran et signaler les estimations.');
        break;
      }
      case 'statisticien': {
        lines.push('Lecture statistique :');
        for (const dt of datas) {
          if (dt.serie && dt.serie.length) {
            const ys = dt.serie.map((p) => p.y);
            const first = ys[0], last = ys[ys.length - 1];
            const n = ys.length;
            const tcam = first > 0 && n > 1 ? (Math.pow(last / first, 1 / (n - 1)) - 1) * 100 : null;
            lines.push(`• ${dt.libelle} : n = ${n}, min ${U.fmtBig(Math.min(...ys))}, max ${U.fmtBig(Math.max(...ys))}, moyenne ${U.fmtBig(U.mean(ys))}, évolution ${U.fmt(((last - first) / first) * 100, 1)} %${tcam != null ? ', taux de croissance annuel moyen ' + U.fmt(tcam, 2) + ' %' : ''}.`);
          } else lines.push(`• ${dt.libelle} : valeur unique ${C.valueText(dt) || '—'} (pas de série : tendance non calculable).`);
        }
        for (const c of comps) for (const k of c.constats || []) lines.push('• ' + k);
        lines.push('Visualisation conseillée : ' + (comps.some((c) => c.visuel && c.visuel.type === 'courbes') ? 'courbes en base 100 sur un même axe.' : 'barres comparées ou pictogrammes proportionnels.'));
        break;
      }
      case 'prospectiviste': {
        lines.push(`Trois scénarios pour ${sujet} :`);
        lines.push(U.sentence('1. Tendanciel — les dynamiques actuelles se prolongent sans rupture ; les mêmes causes produisent les mêmes effets'));
        lines.push(U.sentence('2. Rupture — un événement extérieur (réglementation, technologie, crise) rebat les cartes et inverse la tendance'));
        lines.push(U.sentence(`3. Inversé — et si ${C.conclusionOf(items) ? 'l’inverse de la conclusion était vrai : ' + C.conclusionOf(items).replace(/^./, (c) => c.toLowerCase()) + ' ne tiendrait plus' : 'le phénomène disparaissait complètement'} ?`));
        lines.push('Signaux faibles à surveiller : ' + g.r.sample(['les prix', 'la démographie', 'la réglementation', 'les usages', 'la météo', 'les effets de mode', 'la technologie'], 3).join(', ') + '.');
        break;
      }
      case 'vulgarisateur': {
        const simple = U.sentences(all).slice(0, 6).map((s) => {
          let t = s;
          for (const lx of LX.lex.all) for (const e of lx.euphemismes) for (const a of alts(e.edl)) if (a.length > 5) t = U.replaceWord(t, a, firstAlt(e.brut));
          return U.truncateWords(t, 22);
        });
        lines.push('En clair :');
        simple.forEach((s) => lines.push('• ' + U.sentence(s)));
        lines.push(U.sentence(`À retenir : ${C.conclusionOf(items) || 'une idée simple, illustrée par un exemple concret'}`));
        break;
      }
      case 'analogiste': {
        const mets = (lxs.length ? lxs : LX.lex.all).flatMap((l) => l.metaphores);
        lines.push(`Analogies pour faire comprendre ${sujet} :`);
        g.r.sample(mets, 4).forEach((m) => lines.push('• ' + U.sentence(`C’est comme ${U.np(m).replace(/\.$/, '')}`)));
        break;
      }
      case 'scenariste': {
        lines.push(U.sentence(`Logline : quand ${sujet} révèle ${C.conclusionOf(items) || 'une vérité inattendue'}, tout le monde doit revoir ses certitudes`));
        lines.push('Acte I — l’accroche : un chiffre ou une image qui intrigue.');
        lines.push('Acte II — l’enquête : on confronte les données, les témoins, les points de vue.');
        lines.push('Acte III — la révélation : la conclusion, et ce qu’elle change pour le spectateur.');
        break;
      }
      default:
        lines.push(d.consigne ? 'Consigne : ' + d.consigne : 'Consigne libre non renseignée.');
        lines.push('Le moteur local ne sait pas exécuter une consigne libre : passez ce node en moteur IA. Résumé des entrées :');
        U.sentences(all).slice(0, 5).forEach((s) => lines.push('• ' + s));
    }
    const texte = LX.lex.markTerms(lines.join('\n'), lxs);
    return { titre: `${({ contradicteur: 'Contradicteur', verificateur: 'Vérification', statisticien: 'Statistiques', prospectiviste: 'Prospective', vulgarisateur: 'Vulgarisation', analogiste: 'Analogies', scenariste: 'Pitch', libre: 'Agent' })[d.role] || 'Agent'} — ${U.cap(titre)}`, texte, role: d.role, termes: LX.lex.termsIn(texte) };
  };

  LX.local = E;
  LX.localHelpers = { withArticle, eventNP, dateLabel, makeGen, gabaritsFor, dataSentence, eventSentence, GENERIC_CONCL, singular, confidenceOf };
})(window.LX = window.LX || {});
