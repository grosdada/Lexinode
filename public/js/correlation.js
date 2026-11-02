/*
 * LEXINODE — node « 🔗 Corrélation » et node « 🎲 Topic aléatoire » (moteur local).
 * Corrélation statistique quand deux séries chiffrées sont branchées : Pearson, Spearman, p-valeur,
 * test de la tendance commune (variations d'une période à l'autre), recherche de décalage temporel.
 * Sinon, « détective de corrélations » : hypothèses de liens (variable cachée, chaîne causale, causalité inverse,
 * effet de mesure, coïncidence) tirées d'une banque de mécanismes, avec le protocole pour les tester.
 */
(function (LX) {
  'use strict';
  const U = LX.U;
  const C = LX.content;
  const H = LX.localHelpers;

  // ------------------------------------------------------------------ banque de mécanismes
  const MECAS = [
    { id: 'meteo', x: 'la météo et les saisons', re: /chaud|chaleur|froid|hiver|été|pluie|neige|soleil|météo|climat|températ|glace|plage|parapluie|noyade|pantoufle|chauffage|vent|saison|canicule/i },
    { id: 'pouvoir', x: 'le pouvoir d’achat', re: /vente|prix|achat|consomm|salaire|revenu|luxe|chômage|inflation|marché|euro|dollar|dépense|budget/i },
    { id: 'demo', x: 'la démographie', re: /naissance|population|habitant|bébé|mariage|décès|âge|jeune|retraite|famille|enfant|natalité/i },
    { id: 'mode', x: 'les effets de mode', re: /mode|tendance|style|collection|vêtement|chaussure|look|influenc|viral|populaire|engouement/i },
    { id: 'media', x: 'l’attention médiatique', re: /média|télé|presse|internet|google|wikip|réseaux sociaux|article|buzz|vidéo|émission|journal/i },
    { id: 'loi', x: 'la réglementation', re: /loi|interdi|règle|norme|taxe|réglement|autoris|permis|gouvern|politique|élection|ministère/i },
    { id: 'tech', x: 'le progrès technique', re: /technolog|ordinateur|téléphone|smartphone|robot|logiciel|\bia\b|numérique|machine|invention|internet|écran/i },
    { id: 'tourisme', x: 'les flux touristiques', re: /touris|voyage|vacances|hôtel|zoo|musée|visite|avion|croisière|plage|parc/i },
    { id: 'calendrier', x: 'le calendrier (fêtes, vacances, jours de la semaine)', re: /noël|fête|vacances|week-end|lundi|vendredi|dimanche|rentrée|nouvel an|saint|anniversaire/i },
    { id: 'sportev', x: 'les grands événements sportifs', re: /coupe|match|olymp|championnat|sport|football|rugby|tour de france|jeux|tournoi/i },
    { id: 'energie', x: 'le prix de l’énergie', re: /pétrole|énergie|électricité|carburant|gaz|essence|chauffage|nucléaire|charbon/i },
    { id: 'ville', x: 'l’urbanisation', re: /ville|urbain|métro|logement|immobilier|rue|quartier|banlieue|campagne|village/i },
    { id: 'sante', x: 'l’état de santé de la population', re: /santé|maladie|hôpital|médec|épidém|virus|grippe|sommeil|stress|allergie/i },
    { id: 'loisir', x: 'le temps libre disponible', re: /loisir|jeu|lecture|cinéma|temps libre|confinement|hobby|bricolage|jardin/i },
    { id: 'aliment', x: 'les habitudes alimentaires', re: /aliment|repas|fromage|chocolat|café|bière|vin|glace|cuisine|restaurant|sucre|pain|consommation/i },
    { id: 'nature', x: 'l’état des écosystèmes', re: /animal|animaux|girafe|girafon|oiseau|chat|chien|abeille|forêt|faune|espèce|poisson|insecte/i },
    { id: 'moral', x: 'le moral des ménages', re: /confiance|moral|peur|optimisme|inquiétude|sécurité|bonheur|anxiété/i },
    { id: 'geo', x: 'la géographie (latitude, relief, littoral)', re: /pays|irlande|japon|australie|france|europe|afrique|amérique|asie|île|montagne|mer|melbourne|côte/i },
    { id: 'pop', x: 'les cycles de la culture populaire', re: /musique|chanson|star|célébr|film|série télé|jeu vidéo|mème|dessin animé|album|concert/i },
    { id: 'transport', x: 'la mobilité et le trafic', re: /voiture|route|vélo|train|avion|trafic|bouchon|transport|accident|autoroute/i },
    { id: 'edu', x: 'le niveau d’éducation', re: /école|élève|étudiant|diplôme|université|livre|bac|apprentissage/i },
    { id: 'crise', x: 'les crises majeures', re: /guerre|conflit|crise|pénurie|rationnement|pandémie|confinement|krach/i },
  ];
  const TENDANCE = { id: 'tendance', x: 'la tendance de fond (tout augmente avec le temps : population, revenus, production)' };
  const MESURE = { id: 'mesure', x: 'la façon de compter (méthode, capteurs, déclarations, couverture médiatique)' };

  // ------------------------------------------------------------------ statistiques sur deux séries
  function stats(qa, qb, maxLag) {
    const mb = new Map(qb.serie.map((p) => [String(p.x).trim(), p.y]));
    let commun = qa.serie.filter((p) => mb.has(String(p.x).trim())).map((p) => ({ x: String(p.x).trim(), xn: p.xn, a: p.y, b: mb.get(String(p.x).trim()) }));
    if (commun.every((p) => p.xn != null)) commun.sort((p, q) => p.xn - q.xn);
    const n = commun.length;
    if (n < 4) return null;
    const A = commun.map((p) => p.a), B = commun.map((p) => p.b);
    const r = U.pearson(A, B);
    const rho = U.spearman(A, B);
    const p = U.pValueR(r, n);
    const dA = A.slice(1).map((v, i) => v - A[i]), dB = B.slice(1).map((v, i) => v - B[i]);
    const rDiff = n >= 5 ? U.pearson(dA, dB) : null;
    const lags = [];
    for (let k = -maxLag; k <= maxLag; k++) {
      if (!k) continue;
      const xs = [], ys = [];
      for (let i = 0; i < n; i++) { const j = i + k; if (j >= 0 && j < n) { xs.push(A[i]); ys.push(B[j]); } }
      if (xs.length >= 4) lags.push({ k, r: U.pearson(xs, ys), n: xs.length });
    }
    const best = lags.filter((l) => l.r != null).sort((u, v) => Math.abs(v.r) - Math.abs(u.r))[0] || null;
    return { commun, n, r, rho, p, rDiff, lags, best };
  }
  const force = (r) => (r == null ? 'non calculable' : Math.abs(r) >= 0.7 ? 'forte' : Math.abs(r) >= 0.5 ? 'nette' : Math.abs(r) >= 0.3 ? 'modérée' : 'faible');

  // ------------------------------------------------------------------ node Corrélation
  LX.local.correlation = (node, inp) => {
    const d = node.data;
    const g = H.makeGen(node);
    const A = C.first(inp.a), B = C.first(inp.b);
    if (!A || !B) throw new Error('Branchez deux sujets ou deux données sur A et B.');
    const la = C.title(A) || 'A', lb = C.title(B) || 'B';
    const npa = C.nounPhrase(A), npb = C.nounPhrase(B);
    const lexes = C.lexes(inp.lexiques);
    const ctxItems = C.items(inp.contexte);
    const qa = A.kind === 'donnee' && A.serie && A.serie.length ? A : null;
    const qb = B.kind === 'donnee' && B.serie && B.serie.length ? B : null;
    const maxLag = Math.max(0, Math.min(6, Number(d.decalage) || 3));
    const st = d.methode !== 'hypotheses' && qa && qb ? stats(qa, qb, maxLag) : null;
    if (d.methode === 'statistique' && !st) throw new Error('Mode statistique : branchez deux nodes Donnée avec des séries ayant au moins 4 périodes communes.');
    const constats = [], gardes = [];
    const chiffres = {};
    let resume, conclusion, visuel;
    const emoA = U.emojiFor(la, '🟦'), emoB = U.emojiFor(lb, '🟧');

    // ---------- 1. statistique
    if (st) {
      Object.assign(chiffres, { correlation: st.r, spearman: st.rho, p: st.p, n: st.n, rDiff: st.rDiff, decalage: st.best });
      const sens = st.r >= 0 ? 'dans le même sens' : 'en sens contraire';
      constats.push(`Périodes communes : ${st.n} (${st.commun[0].x} → ${st.commun[st.n - 1].x}).`);
      constats.push(`Pearson r = ${U.fmt(st.r, 2)} (${force(st.r)}, ${sens}) · ${U.fmtP(st.p)} · r² = ${U.fmt(st.r * st.r, 2)}.`);
      constats.push(`Spearman ρ = ${U.fmt(st.rho, 2)} (corrélation des rangs, moins sensible aux valeurs extrêmes).`);
      if (st.rDiff != null) constats.push(`Variations d’une période à l’autre : r = ${U.fmt(st.rDiff, 2)} (${force(st.rDiff)}).`);
      if (st.best) constats.push(`Meilleur décalage testé : ${st.best.k > 0 ? 'B suit A' : 'A suit B'} de ${Math.abs(st.best.k)} période(s), r = ${U.fmt(st.best.r, 2)} (n = ${st.best.n}).`);
      const significatif = st.p != null && st.p < 0.05;
      const tendance = Math.abs(st.r) >= 0.5 && st.rDiff != null && Math.abs(st.rDiff) < 0.3;
      const decale = st.best && Math.abs(st.best.r) > Math.abs(st.r) + 0.15 && Math.abs(st.best.r) >= 0.5;
      if (decale) {
        conclusion = `${st.best.k > 0 ? npb : npa} semble réagir à ${st.best.k > 0 ? npa : npb} avec ${Math.abs(st.best.k)} période(s) de retard (r = ${U.fmt(st.best.r, 2)}), une piste plus intéressante que la corrélation simultanée`;
      } else if (tendance) {
        conclusion = `la corrélation entre ${npa} et ${npb} (r = ${U.fmt(st.r, 2)}) tient surtout à leur tendance commune : d’une période à l’autre, elle tombe à ${U.fmt(st.rDiff, 2)}, ce qui la rend suspecte`;
      } else if (Math.abs(st.r) >= 0.5 && significatif) {
        conclusion = `${npa} et ${npb} évoluent nettement ${sens} (r = ${U.fmt(st.r, 2)}, ${U.fmtP(st.p)}), y compris d’une période à l’autre : un lien est plausible, mais il reste à l’expliquer`;
      } else if (Math.abs(st.r) >= 0.3) {
        conclusion = `un lien ${force(st.r)} apparaît entre ${npa} et ${npb} (r = ${U.fmt(st.r, 2)}), ${significatif ? 'statistiquement significatif mais' : 'non significatif sur si peu de points, donc'} fragile`;
      } else {
        conclusion = `aucune corrélation solide entre ${npa} et ${npb} sur la période (r = ${U.fmt(st.r, 2)})`;
      }
      resume = `Lexinode a aligné les deux séries sur leurs ${st.n} périodes communes, mesuré leur corrélation, puis vérifié si elle résiste quand on retire la tendance et si l’une des courbes suit l’autre avec retard.`;
      gardes.push('Corrélation n’est pas causalité : un lien statistique ne dit ni qui agit sur qui, ni s’il existe un lien direct.');
      if (st.n < 10) gardes.push(`Peu de points (n = ${st.n}) : un seul point atypique peut tout faire basculer.`);
      if (tendance) gardes.push('Deux séries qui montent (ou baissent) toutes les deux avec le temps paraissent toujours corrélées : c’est le piège de la tendance commune.');
      if (Math.abs(st.r - st.rho) > 0.25) gardes.push('Pearson et Spearman divergent : des valeurs extrêmes pèsent sur le résultat.');
      if (st.lags.length > 2) gardes.push(`${st.lags.length + 1} décalages testés : à force de tester, on finit par trouver un « bon » décalage par hasard.`);
      for (const q of [qa, qb]) if (q.statut === 'fictif' || q.statut === 'estimé') gardes.push(`${U.cap(H.withArticle(q.libelle))} : valeurs ${q.statut === 'fictif' ? 'fictives' : 'estimées'}.`);
      visuel = {
        type: 'nuage', r: st.r, labels: { a: la, b: lb }, emojis: { a: emoA, b: emoB },
        points: st.commun.map((p) => ({ x: p.a, y: p.b, label: p.x })),
        items: [{ label: la, emoji: emoA }, { label: lb, emoji: emoB }],
      };
    }

    // ---------- 2. hypothèses de liens (toujours proposées)
    const own = (it) => [C.title(it), it.question, it.unite, it.description, it.kind === 'texte' ? U.stripMarks(it.texte).slice(0, 400) : ''].filter(Boolean).join(' ');
    const textA = own(A), textB = own(B);
    const scored = MECAS.map((m) => ({ m, ia: m.re.test(textA), ib: m.re.test(textB), r: g.r() })).map((s) => Object.assign(s, { score: (s.ia ? 1 : 0) + (s.ib ? 1 : 0) + s.r * 0.5 }));
    scored.sort((u, v) => v.score - u.score);
    const both = scored.filter((s) => s.ia && s.ib);
    const one = scored.filter((s) => s.ia !== s.ib);
    const nb = Math.max(2, Math.min(6, Number(d.hypotheses) || 4));
    const hyp = [];
    const pushH = (h) => { if (hyp.length < nb && !hyp.some((x) => x.mecanisme === h.mecanisme && x.type === h.type)) hyp.push(h); };
    for (const s of both.slice(0, 2)) pushH({
      type: 'variable cachée', mecanisme: s.m.x, force: 'plausible',
      texte: `Facteur commun possible : ${s.m.x}. Il pourrait faire varier à la fois ${npa} et ${npb}, sans aucun lien direct entre les deux.`,
      test: `Mesurer ${s.m.x} sur la même période, puis vérifier si la corrélation résiste quand on neutralise ce facteur (corrélation partielle).`,
    });
    for (const s of one.slice(0, 2)) {
      const fromA = s.ia;
      pushH({
        type: 'chaîne causale', mecanisme: s.m.x, force: 'à tester',
        texte: `Chaîne possible : ${fromA ? npa : npb} → ${s.m.x} → ${fromA ? npb : npa}. Le premier phénomène agirait sur ce relais, qui pèserait à son tour sur le second.`,
        test: `Chercher un décalage : si le lien passe par ${s.m.x}, ${fromA ? 'B' : 'A'} devrait réagir après ${fromA ? 'A' : 'B'}.`,
      });
    }
    if (!both.length) pushH({
      type: 'variable cachée', mecanisme: TENDANCE.x, force: 'classique',
      texte: `Si les deux séries montent ou baissent avec le temps, ${TENDANCE.x} suffit à les faire paraître liées.`,
      test: 'Retirer la tendance (comparer les variations d’une période à l’autre) et voir s’il reste un lien.',
    });
    pushH({
      type: 'causalité inverse', mecanisme: '—', force: 'à tester',
      texte: `Et si le sens était inverse : ${npb} à l’origine de ${npa} ?`,
      test: 'Regarder laquelle des deux séries bouge en premier (analyse de décalage).',
    });
    pushH({
      type: 'effet de mesure', mecanisme: MESURE.x, force: 'spéculatif',
      texte: `${U.cap(npa)} et ${npb} pourraient simplement être comptés par les mêmes canaux, ce qui fabrique une ressemblance.`,
      test: 'Comparer les sources et les méthodes de comptage des deux séries.',
    });
    pushH({
      type: 'coïncidence', mecanisme: 'le hasard', force: 'hypothèse nulle',
      texte: 'Pure coïncidence : avec assez de séries, on trouve toujours deux courbes qui se ressemblent.',
      test: 'Tester sur une autre période ou un autre lieu : une coïncidence ne se reproduit pas.',
    });
    // lectures par les langages branchés
    const lectures = lexes.slice(0, 3).map((x) => {
      const cad = g.r.pick(x.lx.cadres);
      const vars = { sujet: `le lien entre ${npa} et ${npb}`, element: `le lien entre ${npa} et ${npb}`, a: npa, b: npb, conclusion: conclusion || 'le lien reste à établir', terme: g.term(x.lx), public: 'le public' };
      const q = cad ? U.fill(cad.question, vars) : '';
      const f = g.fill(x.lx.formules, vars, 'a') || g.fill(x.lx.formules, vars);
      return { lex: x.lx.id, nom: x.lx.nom, icone: x.lx.icone, texte: LX.lex.markTerms([cad ? `« ${cad.nom} » : ${q}` : '', f].filter(Boolean).join(' '), [x.lx]) };
    });
    const top = hyp[0];
    if (!st) {
      resume = `Sans séries chiffrées, Lexinode ne peut pas mesurer de corrélation : il propose ${hyp.length} pistes de liens entre ${npa} et ${npb}, chacune avec la manière de la vérifier.`;
      conclusion = top.type === 'variable cachée'
        ? `${npa} et ${npb} n’ont a priori rien à voir, mais un facteur commun (${top.mecanisme}) pourrait les faire varier ensemble, ce qu’il faut vérifier dans les chiffres`
        : `un lien indirect entre ${npa} et ${npb} est envisageable via ${top.mecanisme}, une piste à vérifier dans les chiffres`;
      gardes.push('Ce sont des hypothèses : aucune n’est démontrée tant que des données n’ont pas été collectées et comparées.');
      visuel = { type: 'schema', boxes: [U.truncateWords(la, 5), U.truncateWords(top.mecanisme, 5), U.truncateWords(lb, 5)] };
    }
    const sugg = [A, B].map((it, i) => ({
      cote: i ? 'b' : 'a', libelle: C.title(it),
      question: it.question || (it.kind === 'donnee' ? it.question : `Quelle est l’évolution annuelle de ${C.nounPhrase(it)} sur les vingt dernières années ?`),
      unite: it.unite || '', deja: it.kind === 'donnee' && it.serie && it.serie.length >= 4,
    }));
    if (st && Math.abs(st.r) >= 0.5 && both.length) conclusion += `, la piste la plus probable restant un facteur commun : ${both[0].m.x}`;
    for (const hh of hyp) hh.texte = U.fixFr(hh.texte);
    if (ctxItems.length) constats.push('Contexte pris en compte : ' + ctxItems.map((x) => C.title(x)).join(', ') + '.');
    if (d.question) resume = U.sentence(d.question.replace(/\?$/, '') + ' ?').replace(/\.$/, '') + ' ' + resume;
    return {
      titre: `${la} × ${lb}`, a: Object.assign({ libelle: la }, qa || {}), b: Object.assign({ libelle: lb }, qb || {}),
      mode: st ? 'correlation' : 'hypotheses', chiffres, constats, resume: U.fixFr(resume), conclusion: U.fixFr(conclusion).replace(/\.$/, ''),
      mises_en_garde: Array.from(new Set(gardes)), visuel, hypotheses: hyp, lectures, donnees_suggerees: sugg,
      chaine: top ? [la, top.mecanisme, lb] : null,
    };
  };

  // ------------------------------------------------------------------ node Topic aléatoire
  LX.local.hasard = (node) => {
    const d = node.data;
    if (!d.tirage || !d.tirage.a) d.tirage = LX.topics.draw({ mode: d.mode, source: d.source, categorie: d.categorie, folie: d.folie });
    const a = LX.topics.toSujet(d.tirage.a), b = LX.topics.toSujet(d.tirage.b);
    return { _ports: { out: a, outB: b }, a, b, pourquoi: d.tirage.pourquoi || '', mode: d.mode, titre: a.titre };
  };

  LX.correlationHelpers = { MECAS, stats };
})(window.LX = window.LX || {});
