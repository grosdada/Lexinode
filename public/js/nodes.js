/* LEXINODE — catalogue des types de nodes (ports, champs, résumé) */
(function (LX) {
  'use strict';
  const U = LX.U;

  // Types de données circulant sur les liens (couleur des ports / fils)
  const TYPES = {
    sujet: { label: 'Sujet', color: '#F2C14E' },
    brief: { label: 'Brief', color: '#F48FB1' },
    evenement: { label: 'Événement', color: '#FF8A65' },
    donnee: { label: 'Donnée', color: '#4FC3F7' },
    lexique: { label: 'Langage', color: '#B388FF' },
    comparaison: { label: 'Comparaison', color: '#4DB6AC' },
    texte: { label: 'Texte', color: '#CFD8DC' },
    reflexion: { label: 'Réflexion', color: '#81C784' },
    style: { label: 'Direction artistique', color: '#FFD54F' },
    script: { label: 'Script', color: '#FFFFFF' },
    video: { label: 'Vidéo', color: '#FF6B8B' },
    voice: { label: 'Voix', color: '#26C6DA' },
  };
  const CONTENT = ['sujet', 'evenement', 'donnee', 'comparaison', 'texte', 'reflexion', 'brief'];

  const opt = (arr) => arr.map((x) => (typeof x === 'string' ? { v: x, l: x } : x));
  const ENGINE_FIELD = {
    key: 'engine', label: 'Moteur', type: 'select', def: 'global', advanced: true,
    options: opt([{ v: 'global', l: 'Réglage global' }, { v: 'local', l: 'Local (sans IA)' }, { v: 'ia', l: 'IA (agent)' }]),
  };

  const DEFS = {
    // ------------------------------------------------------------------ ENTRÉES
    sujet: {
      title: 'Sujet', icon: '🎯', ico: 'target', cat: 'Entrées', desc: 'Le thème ou la question de départ.',
      inputs: [], outputs: [{ key: 'out', type: 'sujet', label: 'sujet' }],
      fields: [
        { key: 'titre', label: 'Thème', type: 'text', def: '', ph: 'ex. la vente de pantoufles en Irlande' },
        { key: 'angle', label: 'Angle / problématique', type: 'textarea', def: '', ph: 'Quelle question pose-t-on ?' },
        { key: 'motscles', label: 'Mots-clés', type: 'text', def: '', ph: 'séparés par des virgules' },
      ],
      summary: (d) => d.titre || '—',
    },
    hasard: {
      title: 'Topic aléatoire', icon: '🎲', ico: 'die', cat: 'Entrées', dice: true,
      desc: 'Tire un sujet (ou une paire de sujets à corréler) dans une banque de centaines de topics et un générateur combinatoire. Jamais deux fois le même.',
      inputs: [],
      outputs: [{ key: 'out', type: 'sujet', label: 'sujet' }, { key: 'outB', type: 'sujet', label: 'sujet B' }],
      fields: [
        { key: 'tirage', label: 'Tirage', type: 'dice', def: null },
        { key: 'mode', label: 'Tirer', type: 'select', def: 'un', options: opt([
          { v: 'un', l: 'Un sujet' },
          { v: 'paire', l: 'Une paire à corréler (sélection de la banque)' },
          { v: 'croise', l: 'Deux sujets sans rapport (univers différents)' },
        ]) },
        { key: 'source', label: 'Source', type: 'select', def: 'mixte', options: opt([
          { v: 'mixte', l: 'Mixte (banque + générateur)' }, { v: 'banque', l: 'Banque de sujets écrits' }, { v: 'generateur', l: 'Générateur combinatoire' },
        ]) },
        { key: 'categorie', label: 'Catégorie', type: 'topiccat', def: 'toutes' },
        { key: 'folie', label: 'Niveau de folie', type: 'select', def: 'toutes', options: opt([
          { v: 'toutes', l: 'Tous niveaux' }, { v: '1-2', l: '1-2 — sérieux' }, { v: '3-3', l: '3 — décalé' }, { v: '4-5', l: '4-5 — complètement délirant' },
        ]) },
      ],
      summary: (d) => (d.tirage && d.tirage.a ? d.tirage.a.t + (d.tirage.b ? '  ⟷  ' + d.tirage.b.t : '') : 'tirez un topic'),
    },
    brief: {
      title: 'Brief & public', icon: '🧭', ico: 'compass', cat: 'Entrées', desc: 'Public visé, objectif, ton et niveau d’exigence factuelle.',
      inputs: [], outputs: [{ key: 'out', type: 'brief', label: 'brief' }],
      fields: [
        { key: 'public', label: 'Public visé', type: 'text', def: 'le grand public' },
        { key: 'objectif', label: 'Objectif', type: 'select', def: 'expliquer', options: opt(['expliquer', 'convaincre', 'alerter', 'former', 'divertir', 'vendre']) },
        { key: 'ton', label: 'Ton', type: 'select', def: 'pédagogique', options: opt(['institutionnel', 'pédagogique', 'solennel', 'ironique', 'enthousiaste', 'neutre']) },
        { key: 'mode', label: 'Rapport au réel', type: 'select', def: 'plausible', options: opt([
          { v: 'documentaire', l: 'Documentaire — faits sourcés uniquement' },
          { v: 'plausible', l: 'Plausible — estimations signalées' },
          { v: 'fiction', l: 'Fiction / satire assumée' },
        ]) },
        { key: 'contraintes', label: 'Contraintes', type: 'textarea', def: '', ph: 'mots interdits, durée, mentions obligatoires…' },
      ],
      summary: (d) => `${d.objectif || ''} · ${d.public || ''}`,
    },
    note: {
      title: 'Note / citation', icon: '📝', ico: 'note', cat: 'Entrées', desc: 'Texte libre : citation, extrait de document, contexte.',
      inputs: [], outputs: [{ key: 'out', type: 'texte', label: 'texte' }],
      fields: [
        { key: 'titre', label: 'Titre', type: 'text', def: '' },
        { key: 'texte', label: 'Texte', type: 'textarea', def: '', rows: 6 },
        { key: 'source', label: 'Source', type: 'text', def: '' },
      ],
      summary: (d) => d.titre || U.truncateWords(d.texte, 8) || '—',
    },
    evenement: {
      title: 'Événement', icon: '📅', ico: 'calendar', cat: 'Entrées', desc: 'Un fait daté. Branchez des événements précédents pour bâtir une chronologie.',
      inputs: [{ key: 'precedents', type: ['evenement'], label: 'précédents', multi: true }],
      outputs: [{ key: 'out', type: 'evenement', label: 'événement' }],
      fields: [
        { key: 'titre', label: 'Événement', type: 'text', def: '', ph: 'ex. la fermeture de l’usine de Cork' },
        { key: 'date', label: 'Date', type: 'text', def: '', ph: '1986 ou 1986-03-12' },
        { key: 'lieu', label: 'Lieu', type: 'text', def: '' },
        { key: 'type', label: 'Nature', type: 'select', def: 'déclencheur', options: opt(['précédent', 'déclencheur', 'rupture', 'jalon', 'crise', 'annonce', 'conséquence']) },
        { key: 'description', label: 'Description', type: 'textarea', def: '' },
        { key: 'impact', label: 'Importance (1-5)', type: 'range', def: 3, min: 1, max: 5 },
      ],
      summary: (d) => [d.date, d.titre].filter(Boolean).join(' · ') || '—',
    },
    donnee: {
      title: 'Donnée', icon: '📊', ico: 'bars', cat: 'Entrées', desc: 'Une valeur ou une série chiffrée — saisie, recherchée par un agent, ou estimée.',
      inputs: [{ key: 'contexte', type: ['sujet', 'texte', 'evenement'], label: 'contexte', multi: true }],
      outputs: [{ key: 'out', type: 'donnee', label: 'donnée' }],
      fields: [
        { key: 'question', label: 'Question', type: 'textarea', def: '', ph: 'ex. Combien de pantoufles ont été vendues en Irlande dans les années 80 ?' },
        { key: 'libelle', label: 'Libellé court', type: 'text', def: '', ph: 'ex. pantoufles vendues en Irlande' },
        { key: 'mode', label: 'Obtention', type: 'select', def: 'saisie', options: opt([
          { v: 'saisie', l: 'Saisie manuelle' },
          { v: 'recherche', l: 'Recherche par agent (web)' },
          { v: 'estimation', l: 'Estimation raisonnée (Fermi)' },
        ]) },
        { key: 'valeur', label: 'Valeur', type: 'text', def: '', ph: 'ex. 1,2 million' },
        { key: 'unite', label: 'Unité', type: 'text', def: '', ph: 'ex. paires' },
        { key: 'periode', label: 'Période', type: 'text', def: '' },
        { key: 'lieu', label: 'Lieu', type: 'text', def: '' },
        { key: 'serie', label: 'Série (une ligne par point)', type: 'textarea', def: '', ph: '1980: 120000\n1981: 118500', rows: 4 },
        { key: 'source', label: 'Source', type: 'text', def: '' },
        { key: 'fiabilite', label: 'Statut', type: 'select', def: 'auto', options: opt([
          { v: 'auto', l: 'Automatique' }, { v: 'sourcé', l: 'Sourcé' }, { v: 'estimé', l: 'Estimé' }, { v: 'fictif', l: 'Fictif (démo / satire)' },
        ]) },
        ENGINE_FIELD,
      ],
      summary: (d, out) => {
        const v = out && out.valeur != null ? U.fmtBig(out.valeur) : d.valeur;
        return [d.libelle || U.truncateWords(d.question, 6), v ? v + ' ' + (d.unite || (out && out.unite) || '') : d.mode === 'recherche' ? 'à rechercher' : d.mode === 'estimation' ? 'à estimer' : ''].filter(Boolean).join(' → ');
      },
    },
    // ------------------------------------------------------------------ LANGAGE
    lexique: {
      title: 'Éléments de langage', icon: '🗣️', ico: 'speech', cat: 'Langage', desc: 'Le langage d’un corps de métier ou une grille de lecture sociologique.',
      inputs: [], outputs: [{ key: 'out', type: 'lexique', label: 'langage' }],
      fields: [
        { key: 'lexique', label: 'Corps de métier / grille', type: 'lexselect', def: 'medecine' },
        { key: 'registre', label: 'Registre', type: 'select', def: 'institutionnel', options: opt(['institutionnel', 'technique', 'vulgarisation', 'critique']) },
        { key: 'intensite', label: 'Dose de jargon (1-5)', type: 'range', def: 3, min: 1, max: 5 },
        { key: 'ajouts', label: 'Termes ajoutés', type: 'text', def: '', ph: 'vos propres mots-clés, séparés par des virgules' },
      ],
      summary: (d) => { const lx = LX.lex.get(d.lexique); return lx ? lx.nom : d.lexique; },
      color: (d) => (LX.lex.get(d.lexique) || {}).couleur,
    },
    mixeur: {
      title: 'Mixeur de langages', icon: '🎛️', ico: 'sliders', cat: 'Langage', desc: 'Mélange plusieurs langages avec des poids.',
      inputs: [{ key: 'lexiques', type: ['lexique'], label: 'langages', multi: true }],
      outputs: [{ key: 'out', type: 'lexique', label: 'langage mixé' }],
      fields: [
        { key: 'poids', label: 'Poids de chaque langage', type: 'weights', def: {} },
        { key: 'mode', label: 'Mode de mélange', type: 'select', def: 'fusion', options: opt([
          { v: 'fusion', l: 'Fusion (phrases hybrides)' },
          { v: 'alternance', l: 'Alternance (une voix par étape)' },
          { v: 'dominante', l: 'Dominante + touches' },
        ]) },
      ],
      summary: (d, out) => (out && out.ids ? out.ids.map((id) => LX.lex.get(id).nom.split(/[ /—]/)[0]).join(' + ') : 'branchez 2 langages ou plus'),
    },
    prisme: {
      title: 'Prisme / traduction', icon: '🔮', ico: 'prism', cat: 'Langage', desc: 'Réécrit n’importe quel contenu à travers un langage métier ou une sociologie.',
      inputs: [
        { key: 'contenu', type: CONTENT, label: 'contenu', multi: true },
        { key: 'lexique', type: ['lexique'], label: 'langage' },
      ],
      outputs: [{ key: 'out', type: 'texte', label: 'texte' }],
      fields: [
        { key: 'lexique', label: 'Langage (si rien n’est branché)', type: 'lexselect', def: 'bourdieu' },
        { key: 'intention', label: 'Intention', type: 'select', def: 'traduire', options: opt([
          { v: 'traduire', l: 'Traduire dans ce langage' },
          { v: 'defendre', l: 'Défendre / valoriser' },
          { v: 'critiquer', l: 'Critiquer / problématiser' },
          { v: 'vulgariser', l: 'Vulgariser' },
          { v: 'languedebois', l: 'Langue de bois maximale' },
          { v: 'satiriser', l: 'Satiriser' },
        ]) },
        { key: 'longueur', label: 'Longueur', type: 'select', def: 'moyen', options: opt(['court', 'moyen', 'long']) },
        { key: 'seed', label: 'Variante', type: 'seed', def: 1 },
        ENGINE_FIELD,
      ],
      summary: (d) => d.intention,
    },
    decodeur: {
      title: 'Décodeur', icon: '🔍', ico: 'decode', cat: 'Langage', desc: 'Détecte jargon et euphémismes, traduit en clair et mesure la « langue de bois ».',
      inputs: [{ key: 'texte', type: CONTENT, label: 'texte', multi: true }],
      outputs: [{ key: 'out', type: 'texte', label: 'en clair' }],
      fields: [
        { key: 'cible', label: 'Langages à détecter', type: 'select', def: 'tous', options: opt([{ v: 'tous', l: 'Tous les lexiques' }, { v: 'metiers', l: 'Métiers seulement' }]) },
        ENGINE_FIELD,
      ],
      summary: (d, out) => (out && out.scores ? `jargon ${out.scores.jargon} % · lisibilité ${out.scores.lisibilite}` : 'texte → en clair'),
    },
    // ------------------------------------------------------------------ ANALYSE
    comparaison: {
      title: 'Comparaison', icon: '⚖️', ico: 'scales', cat: 'Analyse', desc: 'Compare A et B (chiffres, séries, ou idées) et en tire une conclusion.',
      inputs: [
        { key: 'a', type: CONTENT, label: 'A' },
        { key: 'b', type: CONTENT, label: 'B' },
        { key: 'contexte', type: CONTENT, label: 'contexte', multi: true },
      ],
      outputs: [{ key: 'out', type: 'comparaison', label: 'comparaison' }],
      fields: [
        { key: 'question', label: 'Question de comparaison', type: 'text', def: '', ph: 'ex. Qu’est-ce que ces deux chiffres racontent ensemble ?' },
        { key: 'mode', label: 'Mode', type: 'select', def: 'auto', options: opt([
          { v: 'auto', l: 'Automatique' }, { v: 'quantitatif', l: 'Quantitatif (ratio, écart)' },
          { v: 'grandeur', l: 'Ordre de grandeur / unité de mesure' }, { v: 'correlation', l: 'Corrélation temporelle' },
          { v: 'analogie', l: 'Analogie' }, { v: 'absurde', l: 'Absurde / décalé' }, { v: 'contrefactuel', l: 'Contrefactuel (et si…)' },
        ]) },
        { key: 'agregation', label: 'Si série : agréger par', type: 'select', def: 'somme', options: opt([{ v: 'somme', l: 'Somme' }, { v: 'moyenne', l: 'Moyenne' }, { v: 'derniere', l: 'Dernière valeur' }]) },
        { key: 'popA', label: 'Population de A (optionnel, pour « par habitant »)', type: 'text', def: '', advanced: true },
        { key: 'popB', label: 'Population de B (optionnel)', type: 'text', def: '', advanced: true },
        { key: 'seed', label: 'Variante', type: 'seed', def: 1 },
        ENGINE_FIELD,
      ],
      summary: (d, out) => (out && out.chiffres && out.chiffres.ratio ? 'ratio ' + U.fmt(out.chiffres.ratio) : d.mode),
    },
    correlation: {
      title: 'Corrélation', icon: '🔗', ico: 'scatter', cat: 'Analyse',
      desc: 'Cherche des corrélations entre deux sujets ou deux données : coefficient, significativité, tendance commune, décalage temporel, variables cachées et chaînes causales à tester.',
      inputs: [
        { key: 'a', type: CONTENT, label: 'A' },
        { key: 'b', type: CONTENT, label: 'B' },
        { key: 'lexiques', type: ['lexique'], label: 'grilles', multi: true },
        { key: 'contexte', type: CONTENT, label: 'contexte', multi: true },
      ],
      outputs: [{ key: 'out', type: 'comparaison', label: 'corrélation' }],
      fields: [
        { key: 'question', label: 'Question', type: 'text', def: '', ph: 'ex. Les deux phénomènes sont-ils liés ?' },
        { key: 'methode', label: 'Méthode', type: 'select', def: 'auto', options: opt([
          { v: 'auto', l: 'Automatique (statistique si deux séries, sinon hypothèses)' },
          { v: 'statistique', l: 'Statistique (séries chiffrées)' },
          { v: 'hypotheses', l: 'Hypothèses de liens (sujets)' },
        ]) },
        { key: 'decalage', label: 'Décalage maximal testé (périodes)', type: 'range', def: 3, min: 0, max: 6 },
        { key: 'hypotheses', label: 'Nombre de pistes de liens', type: 'range', def: 4, min: 2, max: 6 },
        { key: 'seed', label: 'Variante', type: 'seed', def: 1 },
        ENGINE_FIELD,
      ],
      summary: (d, out) => (out && out.chiffres && out.chiffres.correlation != null ? 'r = ' + U.fmt(out.chiffres.correlation, 2) + ' · ' + U.fmtP(out.chiffres.p) : out && out.hypotheses ? out.hypotheses.length + ' pistes de liens' : d.methode),
    },
    reflexion: {
      title: 'Réflexion', icon: '🧠', ico: 'bulb', cat: 'Analyse', desc: 'Déroule un raisonnement structuré à partir de tout ce qui est branché, dans le(s) langage(s) choisi(s).',
      inputs: [
        { key: 'sujet', type: ['sujet', 'texte'], label: 'sujet' },
        { key: 'lexiques', type: ['lexique'], label: 'langages', multi: true },
        { key: 'elements', type: CONTENT, label: 'éléments', multi: true },
        { key: 'brief', type: ['brief'], label: 'brief' },
      ],
      outputs: [{ key: 'out', type: 'reflexion', label: 'réflexion' }],
      fields: [
        { key: 'structure', label: 'Structure', type: 'structselect', def: 'auto' },
        { key: 'longueur', label: 'Longueur', type: 'select', def: 'moyen', options: opt(['court', 'moyen', 'long']) },
        { key: 'consigne', label: 'Consigne additionnelle', type: 'textarea', def: '', ph: 'facultatif (surtout utile en mode IA)' },
        { key: 'seed', label: 'Variante', type: 'seed', def: 1 },
        ENGINE_FIELD,
      ],
      summary: (d, out) => (out && out.structure ? out.structure : 'raisonnement'),
    },
    debat: {
      title: 'Table ronde', icon: '🎙️', ico: 'debate', cat: 'Analyse', desc: 'Fait débattre plusieurs langages (un intervenant par langage branché).',
      inputs: [
        { key: 'sujet', type: ['sujet', 'texte'], label: 'sujet' },
        { key: 'voix', type: ['lexique'], label: 'intervenants', multi: true },
        { key: 'elements', type: CONTENT, label: 'éléments', multi: true },
      ],
      outputs: [{ key: 'out', type: 'texte', label: 'débat' }],
      fields: [
        { key: 'format', label: 'Format', type: 'select', def: 'contradictoire', options: opt([
          { v: 'contradictoire', l: 'Débat contradictoire' }, { v: 'consensuel', l: 'Table ronde consensuelle' }, { v: 'interview', l: 'Interview croisée' },
        ]) },
        { key: 'tours', label: 'Nombre de tours', type: 'range', def: 2, min: 1, max: 4 },
        { key: 'moderateur', label: 'Avec modérateur', type: 'checkbox', def: true },
        { key: 'seed', label: 'Variante', type: 'seed', def: 1 },
        ENGINE_FIELD,
      ],
      summary: (d) => d.format,
    },
    agent: {
      title: 'Agent spécialiste', icon: '🤖', ico: 'robot', cat: 'Analyse', desc: 'Un agent avec un rôle : contradicteur, vérificateur, statisticien, prospectiviste…',
      inputs: [{ key: 'entree', type: CONTENT.concat(['lexique']), label: 'entrées', multi: true }],
      outputs: [{ key: 'out', type: 'texte', label: 'texte' }],
      fields: [
        { key: 'role', label: 'Rôle', type: 'select', def: 'contradicteur', options: opt([
          { v: 'contradicteur', l: 'Contradicteur (avocat du diable)' },
          { v: 'verificateur', l: 'Vérificateur (fact-check)' },
          { v: 'statisticien', l: 'Statisticien' },
          { v: 'prospectiviste', l: 'Prospectiviste (et si… ?)' },
          { v: 'vulgarisateur', l: 'Vulgarisateur' },
          { v: 'analogiste', l: 'Analogiste' },
          { v: 'scenariste', l: 'Scénariste (pitch)' },
          { v: 'libre', l: 'Consigne libre' },
        ]) },
        { key: 'consigne', label: 'Consigne', type: 'textarea', def: '', ph: 'Précisez la mission (indispensable en « consigne libre »)' },
        { key: 'seed', label: 'Variante', type: 'seed', def: 1 },
        ENGINE_FIELD,
      ],
      summary: (d) => d.role,
    },
    // ------------------------------------------------------------------ SORTIE
    style: {
      title: 'Direction artistique', icon: '🎨', ico: 'palette', cat: 'Sortie', desc: 'Style graphique du film animé (motion design, isométrique, tableau blanc…).',
      inputs: [{ key: 'lexique', type: ['lexique'], label: 'codes visuels' }],
      outputs: [{ key: 'out', type: 'style', label: 'style' }],
      fields: [
        { key: 'style', label: 'Style', type: 'styleselect', def: 'motion_flat' },
        { key: 'palette', label: 'Palette (hex, optionnel)', type: 'text', def: '', ph: '#0B3C5D, #328CC1, #D9B310 — sinon celle du langage' },
        { key: 'typo', label: 'Typographie', type: 'text', def: '', ph: 'ex. sans-serif géométrique, chiffres en gras' },
        { key: 'ambiance', label: 'Ambiance / références', type: 'textarea', def: '', ph: 'ex. film institutionnel de l’OMS, rythme posé' },
      ],
      summary: (d) => (LX.STYLES && LX.STYLES[d.style] ? LX.STYLES[d.style].nom : d.style),
    },
    short: {
      title: 'Short animé', icon: '🎬', ico: 'film', cat: 'Sortie', desc: 'Storyboard + voix off + prompts image/vidéo par scène + animatique jouable.',
      inputs: [
        { key: 'contenu', type: CONTENT, label: 'contenu', multi: true },
        { key: 'style', type: ['style'], label: 'style' },
        { key: 'lexiques', type: ['lexique'], label: 'langages', multi: true },
        { key: 'brief', type: ['brief'], label: 'brief' },
      ],
      outputs: [{ key: 'out', type: 'script', label: 'script' }],
      fields: [
        { key: 'duree', label: 'Durée', type: 'select', def: '45', options: opt([{ v: '15', l: '15 s' }, { v: '30', l: '30 s' }, { v: '45', l: '45 s' }, { v: '60', l: '60 s' }, { v: '90', l: '90 s' }]) },
        { key: 'format', label: 'Format', type: 'select', def: '9:16', options: opt([{ v: '9:16', l: '9:16 vertical (shorts)' }, { v: '16:9', l: '16:9 horizontal' }, { v: '1:1', l: '1:1 carré' }]) },
        { key: 'voix', label: 'Voix off', type: 'select', def: 'posée', options: opt(['posée', 'dynamique', 'chaleureuse', 'solennelle', 'ironique']) },
        { key: 'cible', label: 'Modèle vidéo visé', type: 'select', def: 'generique', options: opt([
          { v: 'generique', l: 'Générique' }, { v: 'veo', l: 'Google Veo' }, { v: 'kling', l: 'Kling' }, { v: 'seedance', l: 'Seedance' },
          { v: 'wan30', l: 'Wan 3.0' }, { v: 'seedance25', l: 'Seedance 2.5' }, { v: 'h3max', l: 'MiniMax H3 Max' }, { v: 'h3', l: 'MiniMax H3 classique' },
          { v: 'runway', l: 'Runway' }, { v: 'sora', l: 'Sora' }, { v: 'opensource', l: 'Open source (Wan 2.2 / LTX / Hunyuan)' },
        ]) },
        { key: 'langue', label: 'Langue des prompts', type: 'select', def: 'en', options: opt([{ v: 'en', l: 'Anglais (recommandé)' }, { v: 'fr', l: 'Français' }]) },
        { key: 'seed', label: 'Variante', type: 'seed', def: 1 },
        ENGINE_FIELD,
      ],
      summary: (d, out) => (out && out.scenes ? out.scenes.length + ' scènes · ' + d.duree + ' s' : d.duree + ' s · ' + d.format),
    },
  };

  DEFS.generateur = {
    title: 'Générateur vidéo', icon: '', ico: 'clapper', cat: 'Sortie',
    desc: 'Découpe le short en segments de 15 ou 30 s, écrit un prompt par segment selon les règles du modèle (Wan 3.0, Seedance 2.5, MiniMax H3) et lance la génération via fal.ai.',
    inputs: [{ key: 'script', type: ['script'], label: 'script' }, { key: 'voice', type: ['voice'], label: 'voix (facultatif)' }],
    outputs: [{ key: 'out', type: 'video', label: 'vidéos' }],
    fields: [
      { key: 'modele', label: 'Modèle vidéo', type: 'select', def: 'h3max', options: opt([
        { v: 'h3max', l: 'MiniMax H3 Max · jusqu’à 1080p, 15 s par génération' },
        { v: 'seedance25', l: 'Seedance 2.5 (ByteDance) · jusqu’à 30 s par génération' },
        { v: 'wan30', l: 'Wan 3.0 (Alibaba) · jusqu’à 30 s par génération' },
        { v: 'h3', l: 'MiniMax H3 classique · 2K, 15 s par génération' },
      ]) },
      { key: 'segment', label: 'Découper en segments de', type: 'select', def: '15', options: opt([{ v: '15', l: '15 secondes' }, { v: '30', l: '30 secondes' }]) },
      { key: 'voix', label: 'Voix off', type: 'select', def: 'native', options: opt([
        { v: 'native', l: 'Dite par le modèle (audio natif, en français)' },
        { v: 'native_en', l: 'Dite par le modèle (audio natif, en anglais · traduite par l’IA)' },
        { v: 'post', l: 'Ajoutée au montage (le modèle ne fait que musique et sons)' },
      ]) },
      { key: 'passerelle', label: 'Passerelle de génération', type: 'select', def: 'fal', options: opt([
        { v: 'fal', l: 'fal.ai (clé FAL_KEY)' },
        { v: 'direct', l: 'API directe (MiniMax pour H3, DashScope pour Wan 3.0)' },
      ]) },
      { key: 'resolution', label: 'Résolution', type: 'select', def: 'auto', options: opt([
        { v: 'auto', l: 'La meilleure du modèle' }, { v: '1080', l: '1080p' }, { v: '720', l: '720p (moins cher, pour tester)' }, { v: '480', l: '480p (prévisualisation)' },
      ]) },
      { key: 'seed', label: 'Graine (0 = aléatoire)', type: 'text', def: '0', advanced: true },
      ENGINE_FIELD,
    ],
    summary: (d, out) => (out && out.segments ? `${out.segments.length} segment(s) · ${out.modeleNom}` : (d.modele || '') + ' · ' + d.segment + ' s'),
  };

  DEFS.qbuilder = {
    title: 'Sortie Queue Builder', icon: '', ico: 'cpu', cat: 'Sortie',
    desc: 'Prépare la page HTML de prompts que Workflows Q-Builder charge (« Load prompts HTML ») pour envoyer les films aux machines ComfyUI locales, avec MiniMax H3 (T2V) ou LTX 2.5. Rien n’est lancé depuis Lexinode.',
    inputs: [{ key: 'script', type: ['script'], label: 'script' }, { key: 'voice', type: ['voice'], label: 'voix (facultatif)' }],
    outputs: [{ key: 'out', type: 'video', label: 'lot' }],
    fields: [
      { key: 'moteur', label: 'Modèle local', type: 'select', def: 'h3', options: opt([
        { v: 'h3', l: 'MiniMax H3 (T2V local) · un prompt par scène, 15 s au plus' },
        { v: 'ltx25', l: 'LTX 2.5 (local) · un prompt par plan, 9 s au plus' },
      ]) },
      { key: 'voix', label: 'Voix off', type: 'select', def: 'native', options: opt([
        { v: 'native', l: 'Dite par le modèle (audio natif, en français)' },
        { v: 'native_en', l: 'Dite par le modèle (audio natif, en anglais · traduite par l’IA)' },
        { v: 'post', l: 'Ajoutée au montage (le modèle ne fait que musique et sons)' },
      ]) },
      { key: 'prefixe', label: 'Préfixe des noms de plans (vide : titre du short)', type: 'text', def: '' },
    ],
    summary: (d, out) => (out && out.nbPrompts ? `${out.nbPrompts} prompt(s) · ${out.moteurNom}` : (d.moteur === 'ltx25' ? 'LTX 2.5' : 'H3') + ' · local'),
  };

  DEFS.voice = {
    title: 'Voice (ElevenLabs)', icon: '', ico: 'mic', cat: 'Sortie',
    desc: 'Génère seulement la voix off du short avec ElevenLabs, scène par scène. Branchez-la sur l’entrée « voix » d’une sortie vidéo pour l’utiliser à la place de la voix du modèle. Les crédits ElevenLabs ne sont dépensés que sur le bouton « Générer ».',
    inputs: [{ key: 'script', type: ['script'], label: 'script' }],
    outputs: [{ key: 'out', type: 'voice', label: 'voix' }],
    fields: [
      { key: 'voice_id', label: 'Identifiant de la voix (ou bouton « Mes voix » dans le résultat)', type: 'text', def: '' },
      { key: 'modele', label: 'Modèle ElevenLabs', type: 'select', def: 'eleven_multilingual_v2', options: opt([
        { v: 'eleven_multilingual_v2', l: 'Eleven Multilingual v2' },
        { v: 'eleven_v3', l: 'Eleven v3' },
        { v: 'eleven_turbo_v2_5', l: 'Eleven Turbo v2.5' },
        { v: 'eleven_flash_v2_5', l: 'Eleven Flash v2.5' },
      ]) },
      { key: 'langue', label: 'Langue de la voix off', type: 'select', def: 'fr', options: opt([{ v: 'fr', l: 'Français (texte du short)' }, { v: 'en', l: 'Anglais (traduit par l’IA)' }]) },
      { key: 'stabilite', label: 'Stabilité (0 à 1)', type: 'text', def: '0.5', advanced: true },
      { key: 'similarite', label: 'Similarité (0 à 1)', type: 'text', def: '0.75', advanced: true },
      { key: 'style', label: 'Style (0 à 1)', type: 'text', def: '0', advanced: true },
      { key: 'vitesse', label: 'Vitesse (0,7 à 1,2)', type: 'text', def: '1', advanced: true },
    ],
    summary: (d, out) => (out && out.items ? `${out.items.length} voix · ${out.chars} car.` : (d.voice_id ? 'voix choisie' : 'choisir une voix')),
  };

  const CATS = ['Entrées', 'Langage', 'Analyse', 'Sortie'];

  function defaults(type) {
    const def = DEFS[type];
    const data = {};
    for (const f of def.fields) data[f.key] = typeof f.def === 'object' ? JSON.parse(JSON.stringify(f.def)) : f.def;
    return data;
  }

  // Un port d'entrée accepte-t-il ce type ?
  function accepts(input, type) {
    const t = Array.isArray(input.type) ? input.type : [input.type];
    return t.includes('*') || t.includes(type);
  }

  LX.nodes = { TYPES, DEFS, CATS, defaults, accepts };
})(window.LX = window.LX || {});
