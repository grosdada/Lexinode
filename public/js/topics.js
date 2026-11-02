/*
 * LEXINODE — banque de topics et tirage au sort (node « 🎲 Topic aléatoire »).
 * Sources : sujets écrits à la main, paires à corréler, et un générateur combinatoire (gabarits × listes).
 * Anti-répétition : un historique (navigateur) écarte les topics déjà tirés jusqu'à épuisement du filtre.
 */
(function (LX) {
  'use strict';
  const U = LX.U;

  const CATS = {
    insolite: 'Insolite', histoire: 'Histoire', science: 'Science & cosmos', nature: 'Nature & animaux', societe: 'Société & mœurs',
    economie: 'Économie & business', tech: 'Tech & internet', culture: 'Culture & médias', sport: 'Sport & jeux',
    alimentation: 'Alimentation', corps: 'Corps humain', absurde: 'Absurde & et si… ?',
  };

  // Mini-banque de secours (si data/topics est vide)
  const FALLBACK = {
    sujets: [
      { t: 'les ventes de pantoufles en Irlande dans les années 80', a: 'Que racontent ces pantoufles de l’Irlande de l’époque ?', c: 'insolite', f: 4, q: 'Combien de paires de pantoufles ont été vendues en Irlande entre 1980 et 1989 ?', u: 'paires' },
      { t: 'les naissances de girafons dans les zoos australiens', a: 'Qu’est-ce qu’une naissance au zoo dit de notre rapport au sauvage ?', c: 'nature', f: 3, q: 'Combien de girafons sont nés dans les zoos australiens depuis 1980 ?', u: 'naissances' },
      { t: 'la guerre de l’émeu en Australie en 1932', a: 'Comment une armée perd-elle face à des oiseaux ?', c: 'histoire', f: 4 },
      { t: 'un monde où les chats auraient inventé l’imprimerie', a: 'Que publieraient-ils en premier ?', c: 'absurde', f: 5 },
    ],
    paires: [
      { a: 'les ventes de glaces à Marseille', b: 'le nombre de noyades en Méditerranée', f: 2, pourquoi: 'Cas d’école de variable cachée : la chaleur estivale fait monter les deux.' },
    ],
    generateur: {
      listes: {
        objets: ['pantoufles', 'parapluies', 'nains de jardin', 'boules à neige', 'tondeuses', 'cerfs-volants'],
        lieux: ['en Irlande', 'au Japon', 'au Pérou', 'en Islande', 'à Melbourne', 'au Québec'],
        periodes: ['dans les années 80', 'depuis l’an 2000', 'pendant la Coupe du monde 1998', 'un vendredi 13'],
      },
      gabarits: [{ t: 'les ventes de {objets} {lieux} {periodes}', a: 'Que disent les ventes de {objets} {lieux} {periodes} ?', q: 'Quel volume de ventes de {objets} {lieux} {periodes} ?', u: 'unités', c: 'absurde', f: 4 }],
    },
  };

  const T = { bank: { sujets: [], paires: [], generateur: { listes: {}, gabarits: [] } }, CATS };
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

  T.merge = (parts) => {
    const b = { sujets: [], paires: [], generateur: { listes: {}, gabarits: [] } };
    const seen = new Set();
    for (const p of parts) {
      for (const s of p.sujets || []) { const k = norm(s.t); if (!seen.has(k)) { seen.add(k); b.sujets.push(s); } }
      for (const s of p.paires || []) b.paires.push(s);
      const g = p.generateur || {};
      for (const [n, l] of Object.entries(g.listes || {})) b.generateur.listes[n] = Array.from(new Set((b.generateur.listes[n] || []).concat(l)));
      b.generateur.gabarits.push(...(g.gabarits || []));
    }
    return b;
  };
  T.load = async () => {
    let parts = [];
    if (Array.isArray(window.LEXINODE_TOPICS)) parts = window.LEXINODE_TOPICS;
    else if (!window.LEXINODE_STANDALONE) {
      try { const r = await fetch('api/topics'); if (r.ok) parts = await r.json(); } catch (e) { /* hors serveur */ }
    }
    const merged = T.merge(parts);
    T.bank = merged.sujets.length ? merged : T.merge([FALLBACK]);
    return T.bank;
  };
  T.stats = () => {
    const g = T.bank.generateur;
    let combos = 0;
    for (const gb of g.gabarits) {
      const names = Array.from(new Set(Array.from(String(gb.t).matchAll(/\{([a-z_]+)\}/g)).map((m) => m[1])));
      combos += names.reduce((p, n) => p * ((g.listes[n] || []).length || 1), 1);
    }
    return { sujets: T.bank.sujets.length, paires: T.bank.paires.length, gabarits: g.gabarits.length, combinaisons: combos };
  };

  // ---------------------------------------------------------------- historique (anti-répétition)
  const HKEY = 'topicHistory';
  const history = () => new Set(U.store.get(HKEY, []));
  const remember = (keys) => {
    const h = U.store.get(HKEY, []);
    for (const k of keys) if (k) h.push(k);
    U.store.set(HKEY, h.slice(-6000));
  };
  T.resetHistory = () => U.store.set(HKEY, []);
  T.historySize = () => U.store.get(HKEY, []).length;

  const folieOk = (f, filtre) => {
    if (!filtre || filtre === 'toutes') return true;
    const [lo, hi] = String(filtre).split('-').map(Number);
    return f >= lo && f <= (hi || lo);
  };

  // ---------------------------------------------------------------- générateur combinatoire
  function fillGabarit(gb, rnd) {
    const L = T.bank.generateur.listes;
    const chosen = {};
    const fill = (s) => (s ? U.fixFr(String(s).replace(/\{([a-z_]+)\}/g, (m, n) => {
      if (!(n in chosen)) chosen[n] = (L[n] && L[n].length) ? L[n][Math.floor(rnd() * L[n].length)] : n;
      return chosen[n];
    })) : s);
    const t = fill(gb.t);
    return { t, a: fill(gb.a) || `Que révèle ${t} ?`, q: fill(gb.q), u: gb.u || '', c: gb.c || 'absurde', f: gb.f || 4, gen: true };
  }
  function drawGenerated(opts, seen, rnd) {
    const gbs = T.bank.generateur.gabarits.filter((g) => (!opts.categorie || opts.categorie === 'toutes' || g.c === opts.categorie) && folieOk(g.f || 4, opts.folie));
    if (!gbs.length) return null;
    for (let i = 0; i < 40; i++) {
      const tp = fillGabarit(gbs[Math.floor(rnd() * gbs.length)], rnd);
      if (!seen.has(norm(tp.t))) return tp;
    }
    return fillGabarit(gbs[Math.floor(rnd() * gbs.length)], rnd);
  }
  function drawBank(opts, seen, rnd, excludeCat) {
    let pool = T.bank.sujets.filter((s) => (!opts.categorie || opts.categorie === 'toutes' || s.c === opts.categorie) && folieOk(s.f, opts.folie) && s.c !== excludeCat);
    if (!pool.length) return null;
    let fresh = pool.filter((s) => !seen.has(norm(s.t)));
    if (!fresh.length) { // filtre épuisé : on oublie ces topics et on recommence un tour
      const keys = new Set(pool.map((s) => norm(s.t)));
      U.store.set(HKEY, U.store.get(HKEY, []).filter((k) => !keys.has(k)));
      fresh = pool;
    }
    return Object.assign({}, fresh[Math.floor(rnd() * fresh.length)]);
  }
  function drawOne(opts, seen, rnd, excludeCat) {
    const src = opts.source || 'mixte';
    const useGen = src === 'generateur' || (src === 'mixte' && rnd() < 0.35);
    return (useGen && drawGenerated(opts, seen, rnd)) || drawBank(opts, seen, rnd, excludeCat) || drawGenerated(opts, seen, rnd) || drawBank({}, seen, rnd);
  }

  /**
   * Tire un topic (ou une paire).
   * opts = { mode: 'un' | 'paire' | 'croise', source: 'mixte' | 'banque' | 'generateur', categorie, folie: 'toutes' | '1-2' | '3' | '4-5' }
   * → { a: {t, a, c, f, q, u}, b?: {...}, pourquoi?: string }
   */
  T.draw = (opts) => {
    opts = opts || {};
    const rnd = Math.random;
    const seen = history();
    let res;
    if (opts.mode === 'paire' && T.bank.paires.length) {
      let pool = T.bank.paires.filter((p) => folieOk(p.f, opts.folie));
      if (!pool.length) pool = T.bank.paires;
      let fresh = pool.filter((p) => !seen.has('p:' + norm(p.a + '|' + p.b)));
      if (!fresh.length) {
        const keys = new Set(pool.map((p) => 'p:' + norm(p.a + '|' + p.b)));
        U.store.set(HKEY, U.store.get(HKEY, []).filter((k) => !keys.has(k)));
        fresh = pool;
      }
      const p = fresh[Math.floor(rnd() * fresh.length)];
      res = {
        a: { t: p.a, a: `Quel lien entre ${p.a} et ${p.b} ?`, c: 'paire', f: p.f },
        b: { t: p.b, a: `Quel lien entre ${p.b} et ${p.a} ?`, c: 'paire', f: p.f },
        pourquoi: p.pourquoi,
      };
      remember(['p:' + norm(p.a + '|' + p.b)]);
      return res;
    }
    const a = drawOne(opts, seen, rnd);
    seen.add(norm(a.t));
    res = { a };
    if (opts.mode === 'paire' || opts.mode === 'croise') {
      // deux univers différents : on interdit la même catégorie
      res.b = drawOne(Object.assign({}, opts, { categorie: 'toutes' }), seen, rnd, a.c);
    }
    remember([norm(a.t), res.b && norm(res.b.t)]);
    return res;
  };

  T.toSujet = (tp) => (tp ? {
    titre: tp.t, angle: tp.a || '', motscles: [], categorie: tp.c, categorieNom: CATS[tp.c] || (tp.c === 'paire' ? 'Paire' : tp.c),
    folie: tp.f, question: tp.q || '', unite: tp.u || '', genere: !!tp.gen,
  } : null);

  LX.topics = T;
})(window.LX = window.LX || {});
