/* LEXINODE — base de connaissances : chargement, accès, marquage des termes, résumé pour les agents IA */
(function (LX) {
  'use strict';
  const U = LX.U;

  // Lexique neutre de secours (utilisé si aucune fiche n'est chargée, et pour les nodes sans lexique)
  const NEUTRE = {
    id: 'neutre', nom: 'Neutre / analytique', famille: 'metier', categorie: 'Général', icone: '◻️', couleur: '#9AA5B1',
    description: 'Registre analytique neutre, utilisé par défaut quand aucun lexique n’est branché.',
    posture: 'Un analyste qui expose les faits, les relie et signale les incertitudes.',
    valeurs: ['clarté', 'exactitude', 'prudence', 'mesure', 'transparence'],
    vocabulaire: [
      { terme: 'ordre de grandeur', sens: 'valeur approximative à une puissance de dix près' },
      { terme: 'tendance', sens: 'direction générale d’une évolution' },
      { terme: 'corrélation', sens: 'variation conjointe de deux grandeurs' },
      { terme: 'hypothèse', sens: 'proposition admise provisoirement' },
      { terme: 'contexte', sens: 'ensemble des circonstances' },
      { terme: 'enjeu', sens: 'ce qui peut être gagné ou perdu' },
    ],
    formules: [
      'Il faut d’abord poser le cadre s’agissant de {sujet}.',
      'Les éléments disponibles permettent de dresser un premier constat.',
      'Concernant {sujet}, plusieurs lectures sont possibles.',
      'Ce point mérite d’être nuancé.',
      'En définitive, {conclusion}.',
      'Le chiffre à retenir : {chiffre}.',
      '{a} et {b} n’ont, a priori, rien en commun ; c’est précisément ce qui rend la comparaison instructive.',
    ],
    connecteurs: ['D’abord,', 'Ensuite,', 'Par ailleurs,', 'En revanche,', 'Dès lors,', 'Enfin,', 'En somme,'],
    euphemismes: [], substitutions: [],
    cadres: [
      { nom: 'Causes', question: 'Qu’est-ce qui explique {element} ?' },
      { nom: 'Conséquences', question: 'Qu’est-ce que {element} change concrètement ?' },
      { nom: 'Échelle', question: 'À quelle échelle faut-il regarder {element} ?' },
    ],
    structures: [{
      nom: 'Constat – analyse – conclusion', description: 'Structure analytique simple.',
      etapes: [
        { titre: 'Contexte', role: 'contexte', consigne: 'Poser le contexte.', gabarits: ['Pour comprendre {sujet}, il faut revenir au contexte.', 'Tout commence par {evenement}.'] },
        { titre: 'Faits', role: 'faits', consigne: 'Exposer les faits et chiffres.', gabarits: ['Les faits sont les suivants.', 'Le chiffre clé : {chiffre}.'] },
        { titre: 'Analyse', role: 'analyse', consigne: 'Relier et interpréter.', gabarits: ['Mis en regard, ces éléments dessinent une tendance.', 'Comparer {a} et {b} oblige à changer d’échelle.'] },
        { titre: 'Limites', role: 'tension', consigne: 'Signaler limites et contre-arguments.', gabarits: ['Ce constat appelle toutefois des réserves.', 'Rien ne permet encore de conclure à une causalité.'] },
        { titre: 'Conclusion', role: 'conclusion', consigne: 'Conclure.', gabarits: ['En définitive, {conclusion}.', 'Au total, {sujet} invite à la prudence.'] },
      ],
    }],
    rapport_aux_chiffres: { posture: 'Les chiffres sont présentés avec leur source et leur marge d’incertitude.', unites: [], formulations: ['Pour {a}, on compte {chiffre}.', 'Premier repère chiffré : {chiffre}.'] },
    metaphores: ['un puzzle dont il manque des pièces', 'une boussole plutôt qu’une carte'],
    pieges: ['Confondre corrélation et causalité.', 'Généraliser à partir d’un cas isolé.'],
    registres: { institutionnel: 'Sobre et factuel.', technique: 'Précis et chiffré.', vulgarisation: 'Simple et imagé.', critique: 'Distancié.' },
    visuel: {
      palette: ['#1F2933', '#3E4C59', '#9AA5B1', '#F5F7FA', '#F7C948'],
      motifs: [{ fr: 'graphiques épurés', en: 'clean minimal charts' }, { fr: 'flèches et encadrés', en: 'arrows and callout boxes' }],
      pictogrammes: [{ fr: 'loupe', en: 'magnifying glass' }, { fr: 'graphique', en: 'chart' }],
      typographie: 'Sans-serif géométrique, gras pour les chiffres.',
      style_motion: 'Motion design sobre, transitions douces.', style_motion_en: 'sober flat motion design, smooth transitions, clean infographics',
    },
    exemples: [], sources: [],
  };

  const L = { all: [], byId: {}, loaded: false };

  L.normalize = (lx) => {
    const arr = (x) => (Array.isArray(x) ? x : []);
    lx.vocabulaire = arr(lx.vocabulaire).filter((v) => v && v.terme);
    lx.formules = arr(lx.formules);
    lx.connecteurs = arr(lx.connecteurs);
    lx.euphemismes = arr(lx.euphemismes).filter((e) => e && e.brut && e.edl);
    lx.substitutions = arr(lx.substitutions).filter((s) => s && s.de && s.vers);
    lx.cadres = arr(lx.cadres).filter((c) => c && c.nom);
    lx.structures = arr(lx.structures).filter((s) => s && Array.isArray(s.etapes) && s.etapes.length);
    lx.metaphores = arr(lx.metaphores);
    lx.pieges = arr(lx.pieges);
    lx.valeurs = arr(lx.valeurs);
    lx.rapport_aux_chiffres = lx.rapport_aux_chiffres || { formulations: [], unites: [] };
    lx.rapport_aux_chiffres.formulations = arr(lx.rapport_aux_chiffres.formulations);
    lx.registres = lx.registres || {};
    lx.visuel = lx.visuel || {};
    lx.visuel.palette = arr(lx.visuel.palette).length ? lx.visuel.palette : NEUTRE.visuel.palette;
    lx.visuel.motifs = arr(lx.visuel.motifs);
    lx.visuel.pictogrammes = arr(lx.visuel.pictogrammes);
    lx.exemples = arr(lx.exemples);
    lx.sources = arr(lx.sources);
    lx.couleur = lx.couleur || '#9AA5B1';
    lx.icone = lx.icone || '◻️';
    lx.famille = lx.famille || 'metier';
    // termes triés du plus long au plus court, pour le marquage
    lx._terms = lx.vocabulaire.map((v) => v.terme).filter((t) => t.length > 3).sort((a, b) => b.length - a.length);
    return lx;
  };

  L.set = (list) => {
    const seen = {};
    L.all = [];
    for (const lx of [NEUTRE].concat(list || [])) {
      if (!lx || !lx.id) continue;
      if (seen[lx.id]) L.all = L.all.filter((x) => x.id !== lx.id); // une fiche perso remplace la fiche d'origine
      seen[lx.id] = true;
      L.all.push(L.normalize(JSON.parse(JSON.stringify(lx))));
    }
    L.byId = {};
    for (const lx of L.all) L.byId[lx.id] = lx;
    L.loaded = true;
  };

  L.load = async () => {
    let list = [];
    if (Array.isArray(window.LEXINODE_LEXICONS)) list = window.LEXINODE_LEXICONS.slice();
    else if (window.LEXINODE_STANDALONE) list = [];
    else {
      try {
        const r = await fetch('api/lexicons');
        if (r.ok) list = await r.json();
      } catch (e) { /* mode autonome sans serveur */ }
    }
    const custom = U.store.get('customLexicons', []);
    L.set(list.concat(custom));
    return L.all;
  };

  L.get = (id) => L.byId[id] || L.byId.neutre;
  L.metiers = () => L.all.filter((l) => l.famille !== 'sociologie' && l.id !== 'neutre');
  L.sociologies = () => L.all.filter((l) => l.famille === 'sociologie');

  // Sortie d'un node « lexique » / « mixeur » → [{lx, w}]
  L.resolve = (out) => {
    if (!out || !out.ids) return [];
    return out.ids.map((id) => ({ lx: L.get(id), w: (out.poids && out.poids[id]) != null ? out.poids[id] : 1 })).filter((x) => x.lx);
  };

  // Marque les termes du vocabulaire présents dans un texte : « … [[terme|lexid]] … »
  L.markTerms = (text, lexes) => {
    if (!text) return text;
    const parts = String(text).split(/(\[\[[^\]]+\]\])/g);
    const used = new Set();
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith('[[')) continue;
      let seg = parts[i];
      const tokens = [];
      for (const lx of lexes || []) {
        if (!lx || lx.id === 'neutre') continue;
        for (const t of lx._terms || []) {
          if (used.has(lx.id + t)) continue;
          if (!seg.toLowerCase().includes(t.toLowerCase())) continue;
          const re = U.wordRe(t, 'i');
          const m = seg.match(re);
          if (m) {
            const idx = m.index + m[1].length;
            const found = seg.substr(idx, t.length);
            tokens.push('[[' + found + '|' + lx.id + ']]');
            seg = seg.slice(0, idx) + '\u0001' + (tokens.length - 1) + '\u0002' + seg.slice(idx + t.length);
            used.add(lx.id + t);
          }
        }
      }
      parts[i] = seg.replace(/\u0001(\d+)\u0002/g, (m, k) => tokens[Number(k)]);
    }
    return parts.join('');
  };
  L.termsIn = (text) => {
    const out = [];
    const re = /\[\[([^\]|]+)\|([^\]]+)\]\]/g;
    let m;
    while ((m = re.exec(String(text || '')))) out.push({ terme: m[1], lex: m[2] });
    return out;
  };

  // Fiche condensée pour l'injecter dans le prompt système d'un agent IA
  L.summary = (lx, opts) => {
    opts = opts || {};
    const n = opts.compact ? 18 : 30;
    const r = U.rng(lx.id);
    const lines = [];
    lines.push('### ' + lx.nom + (lx.famille === 'sociologie' ? ' (grille de lecture sociologique)' : ' (éléments de langage métier)'));
    if (lx.description) lines.push(lx.description);
    if (lx.posture) lines.push('Posture : ' + lx.posture);
    if (lx.valeurs.length) lines.push('Valeurs invoquées : ' + lx.valeurs.join(', ') + '.');
    if (lx.vocabulaire.length) lines.push('Vocabulaire : ' + lx.vocabulaire.slice(0, n).map((v) => v.terme + (opts.compact ? '' : ' (' + v.sens + ')')).join(' ; ') + '.');
    if (lx.formules.length) lines.push('Formules types : ' + r.sample(lx.formules, opts.compact ? 6 : 12).map((f) => '« ' + f + ' »').join(' '));
    if (lx.connecteurs.length) lines.push('Connecteurs : ' + lx.connecteurs.slice(0, 10).join(' / '));
    if (lx.euphemismes.length) lines.push('Euphémismes / reformulations : ' + lx.euphemismes.slice(0, opts.compact ? 6 : 12).map((e) => e.brut + ' → ' + e.edl).join(' ; ') + '.');
    if (lx.cadres.length) lines.push('Grilles de lecture : ' + lx.cadres.map((c) => c.nom + ' — ' + c.question).join(' | '));
    const st = lx.structures[0];
    if (st) lines.push('Structure argumentative type « ' + st.nom + ' » : ' + st.etapes.map((e) => e.titre + ' (' + e.consigne + ')').join(' → '));
    if (lx.rapport_aux_chiffres && lx.rapport_aux_chiffres.posture) lines.push('Rapport aux chiffres : ' + lx.rapport_aux_chiffres.posture);
    if (lx.metaphores.length && !opts.compact) lines.push('Métaphores : ' + lx.metaphores.slice(0, 8).join(' ; ') + '.');
    if (lx.pieges.length) lines.push('Travers à connaître : ' + lx.pieges.slice(0, opts.compact ? 3 : 6).join(' ; '));
    if (opts.registre && lx.registres[opts.registre]) lines.push('Registre demandé (' + opts.registre + ') : ' + lx.registres[opts.registre]);
    return lines.join('\n');
  };

  L.NEUTRE = NEUTRE;
  LX.lex = L;
})(window.LX = window.LX || {});
