/* LEXINODE — application : barre d'outils, palette, inspecteur, réglages, bibliothèque de lexiques, projets, journal des agents */
(function (LX) {
  'use strict';
  const U = LX.U;
  const N = LX.nodes;
  const h = U.h;
  const $ = U.$;

  // ------------------------------------------------------------------ réglages
  const DEFAULT_SETTINGS = {
    engine: 'local', provider: 'anthropic', model: '', effort: 'medium', concurrency: 3,
    searchProvider: 'auto', keys: {}, baseUrls: {}, roles: {},
  };
  LX.settings = Object.assign({}, DEFAULT_SETTINGS, U.store.get('settings', {}));
  const saveSettings = () => U.store.set('settings', LX.settings);
  LX.api = { server: false, status: null };

  // Coffre du serveur : les clés y sont chiffrées et ne reviennent jamais dans le navigateur
  const VAULT_IDS = ['anthropic', 'openai', 'gemini', 'deepseek', 'compatible', 'tavily', 'brave', 'fal', 'minimax', 'dashscope', 'elevenlabs'];
  const vaultOn = () => { const v = LX.api.server && LX.api.status && LX.api.status.vault; return !!(v && v.enabled && !v.locked); };
  async function refreshStatus() {
    try { const r = await fetch('api/status'); if (r.ok) LX.api.status = await r.json(); } catch (e) { /* statut inchangé */ }
  }
  async function vaultCall(payload) {
    const r = await fetch('api/vault', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Erreur serveur');
    await refreshStatus();
    return j;
  }
  // Clés saisies dans ce navigateur avant l'activation du coffre : déplacées dans le coffre, puis effacées ici
  async function migrateKeysToVault() {
    if (!vaultOn()) return;
    const s = LX.settings;
    const set = {};
    for (const k of VAULT_IDS) if (typeof (s.keys || {})[k] === 'string' && s.keys[k].trim()) set[k] = s.keys[k].trim();
    const ids = Object.keys(set);
    if (!ids.length) return;
    try {
      await vaultCall({ set });
      ids.forEach((k) => { delete s.keys[k]; });
      saveSettings();
      toast(`${ids.length} clé(s) déplacée(s) dans le coffre chiffré du serveur et effacée(s) de ce navigateur.`);
    } catch (e) { toast('Coffre indisponible, clés laissées dans ce navigateur : ' + e.message, 'warn'); }
  }

  let ed;
  let currentTab = 'params';
  let logEntries = [];

  // ------------------------------------------------------------------ toasts & modales
  function toast(msg, kind) {
    const t = h('div', { class: 'toast ' + (kind || '') }, msg);
    $('#toasts').append(t);
    setTimeout(() => t.classList.add('out'), 3200);
    setTimeout(() => t.remove(), 3800);
  }
  LX.toast = toast;
  function modal(title, body, opts) {
    opts = opts || {};
    const close = () => { back.remove(); if (opts.onClose) opts.onClose(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const back = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) close(); } },
      h('div', { class: 'modal ' + (opts.wide ? 'wide' : '') },
        h('div', { class: 'modal-h' }, h('h2', {}, title), h('button', { class: 'btn ghost', onclick: close, 'aria-label': 'Fermer', html: LX.icon.svg('close') })),
        h('div', { class: 'modal-b' }, body)));
    document.body.append(back);
    document.addEventListener('keydown', onKey);
    return { close, el: back };
  }

  // ------------------------------------------------------------------ journal des agents
  function log(entry) {
    if (entry.id) {
      const e = logEntries.find((x) => x.id === entry.id);
      if (e) Object.assign(e, entry);
    } else {
      entry.id = U.uid('log');
      entry.t = new Date();
      logEntries.unshift(entry);
      logEntries = logEntries.slice(0, 200);
    }
    renderLog();
    return entry.id;
  }
  function renderLog() {
    const box = $('#log-list');
    if (!box) return;
    box.innerHTML = '';
    const running = logEntries.filter((e) => e.state === 'running').length;
    $('#log-count').textContent = running ? `${running} agent(s) au travail` : `${logEntries.length} appel(s)`;
    $('#log-toggle').classList.toggle('busy', running > 0);
    for (const e of logEntries.slice(0, 80)) {
      box.append(h('div', { class: 'log-row ' + e.state },
        h('span', { class: 'log-state', html: e.state === 'running' ? '<i class="spin"></i>' : LX.icon.svg(e.state === 'done' ? 'check' : 'close') }),
        h('span', { class: 'log-time' }, e.t.toLocaleTimeString('fr-FR')),
        h('span', { class: 'log-node' }, e.node || ''),
        h('span', { class: 'log-role' }, e.role || ''),
        h('span', { class: 'log-prov' }, [e.provider, e.model].filter(Boolean).join(' · ')),
        h('span', { class: 'log-ms' }, e.ms != null ? (e.ms / 1000).toFixed(1) + ' s' : ''),
        h('span', { class: 'log-msg' }, e.msg || (e.sources ? e.sources + ' source(s)' : ''))));
    }
  }

  // ------------------------------------------------------------------ palette
  function renderPalette() {
    const pal = $('#palette');
    pal.innerHTML = '';
    for (const cat of N.CATS) {
      pal.append(h('div', { class: 'pal-cat' }, cat));
      for (const [type, def] of Object.entries(N.DEFS).filter(([, d]) => d.cat === cat)) {
        const color = (N.TYPES[def.outputs[0].type] || {}).color;
        const b = h('button', { class: 'pal-item', draggable: 'true', title: def.desc, style: { '--c': color } },
          LX.icon.el(def.ico, color, 'pi-icon'), h('span', { class: 'pi-t' }, def.title));
        b.addEventListener('click', () => {
          const c = ed.center();
          ed.addNode(type, c.x - 110 + (Math.random() * 60 - 30), c.y - 60 + (Math.random() * 60 - 30));
          if (window.innerWidth < 760) document.body.classList.remove('show-palette');
        });
        b.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/lexinode-node', type); e.dataTransfer.effectAllowed = 'copy'; });
        pal.append(b);
      }
    }
    pal.append(h('div', { class: 'pal-tip' }, 'Astuce : double-cliquez sur le canvas pour chercher un node, ou tirez un fil depuis une sortie vers le vide.'));
  }

  // ------------------------------------------------------------------ inspecteur
  let snapTimer = null;
  const snapLater = () => { clearTimeout(snapTimer); snapTimer = setTimeout(() => ed.snapshot(), 500); };
  function onFieldChange(node) {
    ed.refreshNode(node.id);
    ed.markStale(node.id);
    if ((ed.status[node.id] || {}).state === 'done') ed.setStatus(node.id, 'stale');
    snapLater();
    autosave();
  }
  function upstreamLexIds(node) {
    const ids = [];
    const walk = (id, depth) => {
      for (const l of ed.inputsOf(id)) {
        const src = ed.node(l.from);
        if (!src) continue;
        if (src.type === 'lexique') ids.push(src.data.lexique);
        else if (src.type === 'mixeur' && depth < 3) walk(src.id, depth + 1);
        if (src.out && src.out.ids && src.type !== 'lexique') ids.push(...src.out.ids);
      }
    };
    walk(node.id, 0);
    return Array.from(new Set(ids)).filter((x) => LX.lex.byId[x]);
  }
  function lexSelect(value, onChange) {
    const sel = h('select', {});
    const groups = [['Métiers', LX.lex.metiers()], ['Grilles sociologiques', LX.lex.sociologies()], ['Autre', [LX.lex.get('neutre')]]];
    for (const [label, list] of groups) {
      if (!list.length) continue;
      const og = h('optgroup', { label });
      for (const lx of list) og.append(h('option', { value: lx.id, selected: lx.id === value }, lx.nom));
      sel.append(og);
    }
    if (!LX.lex.byId[value]) sel.prepend(h('option', { value, selected: true }, value + ' (introuvable)'));
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  }
  function fieldEl(node, f) {
    const d = node.data;
    const set = (v) => { d[f.key] = v; onFieldChange(node); };
    let input;
    switch (f.type) {
      case 'textarea':
        input = h('textarea', { rows: f.rows || 3, placeholder: f.ph || '' });
        input.value = d[f.key] || '';
        input.addEventListener('input', () => set(input.value));
        break;
      case 'select':
        input = h('select', {}, f.options.map((o) => h('option', { value: o.v, selected: String(d[f.key]) === String(o.v) }, o.l)));
        input.addEventListener('change', () => set(input.value));
        break;
      case 'range': {
        const val = h('span', { class: 'range-v' }, String(d[f.key]));
        const r = h('input', { type: 'range', min: f.min, max: f.max, step: f.step || 1, value: d[f.key] });
        r.addEventListener('input', () => { val.textContent = r.value; set(Number(r.value)); });
        input = h('div', { class: 'range' }, r, val);
        break;
      }
      case 'checkbox':
        input = h('input', { type: 'checkbox' });
        input.checked = !!d[f.key];
        input.addEventListener('change', () => set(input.checked));
        break;
      case 'lexselect': {
        const info = h('div', { class: 'small muted lexinfo' });
        const upd = (id) => { const lx = LX.lex.get(id); info.textContent = lx ? lx.description : ''; };
        input = h('div', {}, lexSelect(d[f.key], (v) => { upd(v); set(v); }), info);
        upd(d[f.key]);
        break;
      }
      case 'dice': {
        const t = d.tirage;
        const pv = h('div', { class: 'dice-box' },
          t && t.a ? h('div', { class: 'dice-t' }, U.cap(t.a.t)) : h('div', { class: 'muted small' }, 'Aucun topic tiré pour l’instant.'),
          t && t.b ? h('div', { class: 'dice-vs' }, '×') : null,
          t && t.b ? h('div', { class: 'dice-t' }, U.cap(t.b.t)) : null,
          h('div', { class: 'row wrap' },
            h('button', { class: 'btn primary', type: 'button', onclick: (e) => { e.preventDefault(); drawTopic(node.id); } }, LX.icon.el('die'), ' Tirer un topic'),
            h('button', { class: 'btn sm ghost', type: 'button', title: 'Permet de retomber sur des topics déjà vus', onclick: (e) => { e.preventDefault(); LX.topics.resetHistory(); toast('Historique des tirages effacé'); renderInspector(); } }, 'Oublier l’historique (' + LX.topics.historySize() + ')')));
        return h('div', { class: 'field' }, pv);
      }
      case 'topiccat':
        input = h('select', {}, [h('option', { value: 'toutes', selected: d[f.key] === 'toutes' }, 'Toutes les catégories')].concat(Object.entries(LX.topics.CATS).map(([k, l]) => h('option', { value: k, selected: d[f.key] === k }, l))));
        input.addEventListener('change', () => set(input.value));
        break;
      case 'styleselect':
        input = h('select', {}, Object.entries(LX.STYLES).map(([k, s]) => h('option', { value: k, selected: d[f.key] === k }, s.nom)));
        input.addEventListener('change', () => set(input.value));
        break;
      case 'structselect': {
        input = h('select', {});
        input.append(h('option', { value: 'auto', selected: d[f.key] === 'auto' }, 'Automatique (structure du langage dominant)'));
        const og1 = h('optgroup', { label: 'Structures génériques' });
        for (const [k, s] of Object.entries(LX.GENERIC_STRUCTS)) og1.append(h('option', { value: k, selected: d[f.key] === k }, s.nom));
        input.append(og1);
        for (const id of upstreamLexIds(node)) {
          const lx = LX.lex.get(id);
          const og = h('optgroup', { label: lx.nom });
          lx.structures.forEach((s, i) => og.append(h('option', { value: id + '::' + i, selected: d[f.key] === id + '::' + i }, s.nom)));
          input.append(og);
        }
        input.addEventListener('change', () => set(input.value));
        break;
      }
      case 'weights': {
        input = h('div', { class: 'weights' });
        const ids = upstreamLexIds(node);
        if (!ids.length) input.append(h('div', { class: 'small muted' }, 'Branchez des nodes « Éléments de langage » sur l’entrée.'));
        d[f.key] = d[f.key] || {};
        for (const id of ids) {
          const lx = LX.lex.get(id);
          const cur = d[f.key][id] != null ? d[f.key][id] : 1;
          const val = h('span', { class: 'range-v' }, String(cur));
          const r = h('input', { type: 'range', min: 0, max: 3, step: 0.5, value: cur });
          r.addEventListener('input', () => { val.textContent = r.value; d[f.key][id] = Number(r.value); onFieldChange(node); });
          input.append(h('div', { class: 'wrow', style: { '--c': lx.couleur } }, h('span', { class: 'wl' }, LX.icon.lex(lx), ' ', lx.nom), r, val));
        }
        break;
      }
      case 'seed': {
        const n = h('input', { type: 'number', min: 1, value: d[f.key] || 1, style: { width: '70px' } });
        n.addEventListener('input', () => set(Number(n.value) || 1));
        const b = h('button', { class: 'btn sm', title: 'Nouvelle variante' }, LX.icon.el('refresh'), ' varier');
        b.addEventListener('click', () => { n.value = (Number(n.value) || 1) + 1; set(Number(n.value)); runNode(node.id); });
        input = h('div', { class: 'row' }, n, b);
        break;
      }
      default:
        input = h('input', { type: 'text', placeholder: f.ph || '' });
        input.value = d[f.key] == null ? '' : d[f.key];
        input.addEventListener('input', () => set(input.value));
    }
    return h('label', { class: 'field' }, h('span', { class: 'fl' }, f.label), input);
  }

  function renderInspector() {
    const box = $('#inspector');
    box.innerHTML = '';
    const sel = ed.selected;
    const node = sel && sel.kind === 'node' ? ed.node(sel.id) : null;
    if (!node) {
      box.append(projectPanel());
      return;
    }
    const def = N.DEFS[node.type];
    const st = ed.status[node.id] || { state: 'idle' };
    const titleIn = h('input', { class: 'insp-title', value: node.data._label || def.title });
    titleIn.addEventListener('input', () => { node.data._label = titleIn.value === def.title ? '' : titleIn.value; ed.refreshNode(node.id); snapLater(); });
    const engineBadge = LX.engine.LOCAL_ONLY.includes(node.type) ? [LX.icon.el('cpu'), ' local'] : LX.engine.engineFor(node) === 'ia' ? [LX.icon.el('sparkle'), ' IA · ' + LX.ai.routeFor(LX.ai.ROLE_OF[node.type]).provider] : [LX.icon.el('cpu'), ' local'];
    box.append(h('div', { class: 'insp-h', style: { '--c': (def.color && def.color(node.data)) || (N.TYPES[def.outputs[0].type] || {}).color } },
      LX.icon.el(def.ico, null, 'insp-icon'), titleIn,
      h('div', { class: 'insp-actions' },
        def.dice ? h('button', { class: 'btn sm', title: 'Tirer un nouveau topic', onclick: () => drawTopic(node.id) }, LX.icon.el('die'), ' Tirer') : '',
        h('button', { class: 'btn primary sm', onclick: () => runNode(node.id) }, LX.icon.el('play'), ' Exécuter'),
        h('button', { class: 'btn sm', title: 'Dupliquer', onclick: () => ed.duplicate(node.id), html: LX.icon.svg('copy') }),
        h('button', { class: 'btn sm danger', title: 'Supprimer', onclick: () => ed.removeNode(node.id), html: LX.icon.svg('trash') }))),
    h('div', { class: 'insp-desc' }, def.desc, ' ', h('span', { class: 'chip ghost' }, engineBadge)),
    st.state === 'error' ? h('div', { class: 'error-box' }, LX.icon.el('alert'), ' ', st.msg || 'Erreur') : '');
    const tabs = h('div', { class: 'tabs' },
      h('button', { class: 'tab' + (currentTab === 'params' ? ' on' : ''), onclick: () => { currentTab = 'params'; renderInspector(); } }, 'Paramètres'),
      h('button', { class: 'tab' + (currentTab === 'result' ? ' on' : ''), onclick: () => { currentTab = 'result'; renderInspector(); } }, 'Résultat' + (node.out ? ' ●' : '')));
    box.append(tabs);
    if (currentTab === 'params') {
      const form = h('div', { class: 'form' });
      const adv = h('details', { class: 'adv' }, h('summary', {}, 'Avancé'));
      for (const f of def.fields) (f.advanced ? adv : form).append(fieldEl(node, f));
      if (adv.children.length > 1) form.append(adv);
      // entrées branchées
      if (def.inputs.length) {
        const ins = h('div', { class: 'insp-inputs' }, h('div', { class: 'k' }, 'Entrées'));
        for (const p of def.inputs) {
          const links = ed.inputsOf(node.id).filter((l) => l.toPort === p.key);
          ins.append(h('div', { class: 'small' }, h('b', {}, p.label), ' : ', links.length ? links.map((l) => { const s = ed.node(l.from); return s ? (s.data._label || N.DEFS[s.type].title) + (s.type === 'lexique' ? ' (' + LX.lex.get(s.data.lexique).nom + ')' : '') : '?'; }).join(', ') : h('span', { class: 'muted' }, 'rien de branché')));
        }
        form.append(ins);
      }
      box.append(form);
    } else {
      box.append(LX.render.output(node, { onAnimatic: openAnimatic, onDice: () => drawTopic(node.id), onSpawn: (what) => spawn(node.id, what), onGenerate: (key) => generateVideo(node.id, key), onGenerateVoice: (key) => generateVoice(node.id, key), onPickVoice: () => pickVoice(node.id) }));
    }
  }

  function projectPanel() {
    const g = ed.graph;
    const counts = {};
    for (const n of g.nodes) counts[n.type] = (counts[n.type] || 0) + 1;
    const nIA = g.nodes.filter((n) => !LX.engine.LOCAL_ONLY.includes(n.type) && LX.engine.engineFor(n) === 'ia').length;
    const shorts = g.nodes.filter((n) => n.type === 'short' && n.out);
    return h('div', { class: 'project' },
      h('h3', {}, 'Projet'),
      h('div', { class: 'small muted' }, `${g.nodes.length} nodes · ${g.links.length} liens · ${nIA} agent(s) IA`),
      h('div', { class: 'chips' }, Object.entries(counts).map(([t, c]) => h('span', { class: 'chip', title: N.DEFS[t].title, style: { '--c': (N.TYPES[N.DEFS[t].outputs[0].type] || {}).color } }, LX.icon.el(N.DEFS[t].ico, (N.TYPES[N.DEFS[t].outputs[0].type] || {}).color), ' ' + c))),
      shorts.length ? h('div', {}, h('div', { class: 'k' }, 'Shorts prêts'), shorts.map((n) => h('button', { class: 'btn', onclick: () => openAnimatic(n.out) }, LX.icon.el('play'), ' ' + n.out.titre))) : null,
      h('div', { class: 'k' }, 'Comment ça marche'),
      h('ol', { class: 'small howto' },
        h('li', {}, 'Ajoutez des nodes depuis la palette (ou double-cliquez sur le canvas).'),
        h('li', {}, 'Reliez une sortie (point plein, à droite) à une entrée compatible (point creux, à gauche). La couleur du fil indique le type de donnée.'),
        h('li', {}, 'Choisissez des langages (métiers, sociologies) et branchez-les sur une Réflexion, un Prisme ou une Table ronde.'),
        h('li', {}, 'Cliquez sur « Tout exécuter ». Les branches indépendantes tournent en parallèle.'),
        h('li', {}, 'Terminez par un node « Short animé » pour obtenir storyboard, prompts et animatique.'),
        h('li', {}, 'En panne d’idée ? Le node « Topic aléatoire » tire un sujet (ou une paire à corréler) dans une banque de centaines de topics.')),
      h('div', { class: 'k' }, 'Moteur'),
      h('div', { class: 'small' }, LX.settings.engine === 'ia'
        ? `IA — fournisseur par défaut : ${(LX.providers.INFO[LX.settings.provider] || {}).label || LX.settings.provider}. Chaque rôle d’agent peut être routé ailleurs dans ⚙ Réglages.`
        : 'Local — aucun appel réseau : le moteur raisonne avec la base de connaissances (gabarits, formules, cadres) et calcule les comparaisons. Passez en IA pour des textes plus riches et la recherche de données.'),
      h('div', { class: 'k' }, 'Légende des fils'),
      h('div', { class: 'legend' }, Object.entries(N.TYPES).map(([k, t]) => h('span', {}, h('i', { style: { background: t.color } }), t.label))));
  }

  // ------------------------------------------------------------------ topics aléatoires
  function drawTopic(id) {
    const node = ed.node(id);
    if (!node) return;
    const d = node.data;
    d.tirage = LX.topics.draw({ mode: d.mode, source: d.source, categorie: d.categorie, folie: d.folie });
    ed.refreshNode(id);
    ed.markStale(id);
    snapLater();
    autosave();
    toast('Nouveau topic : ' + d.tirage.a.t + (d.tirage.b ? '  ×  ' + d.tirage.b.t : ''));
    runNode(id);
  }
  // crée des nodes à partir d'un tirage ou des données suggérées par une corrélation
  function spawn(id, what) {
    const node = ed.node(id);
    if (!node || !node.out) return;
    const o = node.out;
    const mkData = (sug, x, y) => ed.addNode('donnee', x, y, {
      question: sug.question || `Quelle est l’évolution annuelle de ${sug.titre || sug.libelle} ?`,
      libelle: U.truncateWords(sug.libelle || sug.titre || '', 7).replace(/…$/, ''), unite: sug.unite || '', mode: 'recherche',
    });
    if (node.type === 'hasard' && what === 'donnees') {
      [['out', o.a], ['outB', o.b]].filter(([, t]) => t).forEach(([port, t], i) => {
        const dn = mkData({ question: t.question, titre: t.titre, unite: t.unite }, node.x + 300, node.y + i * 260);
        ed.connect(node.id, port, dn.id, 'contexte');
      });
      toast('Données créées en mode « recherche » : passez en IA pour que l’agent chercheur trouve les valeurs.');
    } else if (node.type === 'hasard' && what === 'correlation') {
      const c = ed.addNode('correlation', node.x + 320, node.y);
      ed.connect(node.id, 'out', c.id, 'a');
      ed.connect(node.id, 'outB', c.id, 'b');
      runNode(c.id);
    } else if (node.type === 'correlation' && what === 'donnees-correlation') {
      (o.donnees_suggerees || []).filter((s) => !s.deja).forEach((sug, i) => {
        const port = sug.cote === 'b' ? 'b' : 'a';
        const prev = ed.inputsOf(node.id).find((l) => l.toPort === port);
        const dn = mkData(sug, node.x - 300, node.y + (port === 'b' ? 240 : -20));
        if (prev) {
          const src = ed.node(prev.from);
          if (src && ed.canConnect(src.id, prev.fromPort, dn.id, 'contexte')) ed.connect(src.id, prev.fromPort, dn.id, 'contexte');
        }
        ed.connect(dn.id, 'out', node.id, port);
        void i;
      });
      toast('Nodes Donnée créés et branchés : en mode IA, l’agent chercheur trouvera les séries, puis la corrélation sera mesurée.');
    }
    renderInspector();
  }

  // ------------------------------------------------------------------ génération vidéo (fal.ai, MiniMax, DashScope)
  async function videoCall(kind, body) {
    const s = LX.settings;
    const keys = {};
    for (const k of ['fal', 'minimax', 'dashscope']) if ((s.keys || {})[k]) keys[k] = s.keys[k];
    if (LX.api.server) {
      const r = await fetch('api/video/' + kind, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ baseUrl: (s.baseUrls || {})[body.provider] }, body, { keys })) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Erreur serveur');
      return j;
    }
    const fn = kind === 'submit' ? LX.providers.videoSubmit : LX.providers.videoStatus;
    return fn(Object.assign({ baseUrl: (s.baseUrls || {})[body.provider] }, body, { key: keys[body.provider] }));
  }
  function videoRequest(node, seg) {
    const o = node.out;
    const P = LX.VIDEO_MODELS[o.modele];
    const s = LX.settings;
    const seed = Number(node.data.seed) || 0;
    if (node.data.passerelle !== 'direct') {
      const endpoint = ((s.falModels || {})[o.modele] || P.falId || '').trim();
      if (!endpoint) throw new Error(`Identifiant fal.ai du modèle ${P.nom} manquant : Réglages → Génération vidéo.`);
      const tpl = ((s.falTemplates || {})[o.modele] || P.falTemplate).trim();
      let payload;
      try {
        const filled = tpl.replace(/"\{prompt\}"/g, () => JSON.stringify(seg.prompt)).replace(/\{duration\}/g, seg.duree).replace(/\{ratio\}/g, o.ratio).replace(/\{resolution\}/g, String(o.resolution).toLowerCase()).replace(/\{RESOLUTION\}/g, String(o.resolution).toUpperCase()).replace(/\{seed\}/g, seed);
        payload = JSON.parse(filled);
      } catch (e) { throw new Error('Modèle de requête fal.ai invalide (Réglages → Génération vidéo) : ' + e.message); }
      if (seed && payload.seed === undefined) payload.seed = seed;
      // voix du node Voice : H3 / H3 Max l'acceptent comme piste audio imposée ; le serveur fabrique le data URI à l'envoi
      if (seg.voice && seg.voice.refs.length && ['h3', 'h3max'].includes(o.modele)) payload.target_audio_url = 'lexinode-voice:' + btoa(unescape(encodeURIComponent(JSON.stringify(seg.voice.refs))));
      return { provider: 'fal', endpoint, payload };
    }
    const ctx = { ratio: o.ratio, resolution: o.resolution, seed };
    if (o.modele === 'h3') return { provider: 'minimax', payload: P.directPayload(seg, seg.prompt, ctx) };
    if (o.modele === 'wan30') return { provider: 'dashscope', payload: P.directPayload(seg, seg.prompt, ctx) };
    throw new Error(`${P.nom} n’a pas d’API directe intégrée : choisissez la passerelle fal.ai.`);
  }
  // ------------------------------------------------------------------ voix off (ElevenLabs, via le serveur)
  async function voiceCall(route, body) {
    const keys = {};
    if ((LX.settings.keys || {}).elevenlabs) keys.elevenlabs = LX.settings.keys.elevenlabs;
    const r = await fetch('api/' + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ keys }, body)) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Erreur serveur');
    return j;
  }
  function generateVoice(nodeId, key) {
    const node = ed.node(nodeId);
    if (!node || !node.out) return;
    if (!LX.api.server) { toast('La voix off ElevenLabs passe par le serveur : lancez Lexinode avec son serveur.', 'warn'); return; }
    const o = node.out;
    node.jobs = node.jobs || {};
    const items = key ? o.items.filter((x) => x.key === key) : o.items.filter((x) => !(node.jobs[x.key] && node.jobs[x.key].state === 'done'));
    if (!items.length) return;
    if (!o.voiceId) { toast('Choisissez d’abord une voix.', 'warn'); return; }
    const chars = items.reduce((s, x) => s + x.chars, 0);
    askConfirm(`Générer ${items.length} voix off avec ElevenLabs (${chars} caractères, environ ${chars} crédits au tarif standard) ? Un texte déjà généré avec les mêmes réglages n’est pas refacturé.`, 'Générer la voix', async () => {
      for (const x of items) {
        node.jobs[x.key] = { state: 'running', at: Date.now() };
        renderInspector();
        try {
          const r = await voiceCall('voice', { text: x.texte, voice_id: o.voiceId, model_id: o.modele, settings: o.settings });
          node.jobs[x.key] = { state: 'done', id: r.id, url: r.url, bytes: r.bytes, cached: r.cached };
          log({ node: node.data._label || 'Voice', role: 'Voix off', provider: 'ElevenLabs', model: o.modele, state: 'done', msg: `scène ${x.n} : ${r.cached ? 'déjà générée' : Math.round(r.bytes / 1024) + ' Ko'}` });
        } catch (e) {
          node.jobs[x.key] = { state: 'error', error: e.message };
          log({ node: node.data._label || 'Voice', role: 'Voix off', provider: 'ElevenLabs', state: 'error', msg: e.message });
        }
        ed.refreshNode(node.id);
        renderInspector();
        autosave();
      }
    });
  }
  async function pickVoice(nodeId) {
    const node = ed.node(nodeId);
    if (!node) return;
    if (!LX.api.server) { toast('La liste des voix passe par le serveur : lancez Lexinode avec son serveur.', 'warn'); return; }
    let voices;
    try { voices = await voiceCall('voice/voices', {}); } catch (e) { toast(e.message, 'warn'); return; }
    const m = modal('Mes voix ElevenLabs', h('div', {}, voices.length ? h('div', { class: 'cards' }, voices.map((v) => h('button', { class: 'card', onclick: () => { m.close(); node.data.voice_id = v.id; ed.markStale(node.id); runNode(node.id); autosave(); } }, h('b', {}, v.name), h('span', { class: 'small muted' }, v.category || '')))) : h('p', {}, 'Aucune voix trouvée sur ce compte.')));
  }
  function generateVideo(nodeId, key) {
    const node = ed.node(nodeId);
    if (!node || !node.out) return;
    if (window.LEXINODE_DEMO) return demoInfo();
    node.jobs = node.jobs || {};
    const segs = key ? node.out.segments.filter((x) => x.key === key)
      : node.out.segments.filter((x) => !(node.jobs[x.key] && ['done', 'queued', 'running', 'submitting'].includes(node.jobs[x.key].state)));
    if (!segs.length) return;
    const total = segs.reduce((s2, x) => s2 + x.duree, 0);
    const go = async () => {
      for (const seg of segs) {
        node.jobs[seg.key] = { state: 'submitting', at: Date.now(), n: seg.n };
        renderInspector();
        try {
          const req = videoRequest(node, seg);
          const r = await videoCall('submit', req);
          node.jobs[seg.key] = Object.assign({ state: 'queued', at: Date.now(), n: seg.n }, r);
          log({ node: (node.data._label || 'Générateur vidéo') + ' · segment ' + seg.n, role: 'Génération vidéo', provider: r.provider, model: node.out.modeleNom, state: 'done', msg: 'envoyé (' + (r.id || '').slice(0, 12) + ')' });
        } catch (e) {
          node.jobs[seg.key] = { state: 'error', error: e.message, at: Date.now(), n: seg.n };
          log({ node: 'Générateur vidéo · segment ' + seg.n, role: 'Génération vidéo', provider: node.data.passerelle, state: 'error', msg: e.message });
        }
        ed.refreshNode(node.id);
        renderInspector();
        autosave();
      }
      startVideoPolling();
    };
    const cout = node.out.prixSeconde ? ` Coût estimé : ~${(total * node.out.prixSeconde).toFixed(2)} $ (tarif fal public, à vérifier).` : ' Coût : tarif non publié pour ce modèle, vérifiez sur fal.ai.';
    askConfirm(`Lancer ${segs.length} génération(s) avec ${node.out.modeleNom} (${total} s de vidéo au total) ?${cout}`, 'Lancer la génération', go);
  }
  let videoTimer = null;
  function startVideoPolling() {
    if (videoTimer) return;
    videoTimer = setInterval(async () => {
      const pending = [];
      for (const n of ed.graph.nodes) for (const [k, j] of Object.entries(n.jobs || {})) if (j.state === 'queued' || j.state === 'running') pending.push([n, k, j]);
      if (!pending.length) { clearInterval(videoTimer); videoTimer = null; return; }
      for (const [n, k, j] of pending) {
        try {
          const st = await videoCall('status', j);
          if (st.state !== j.state || st.url) {
            Object.assign(j, { state: st.state, url: st.url || j.url, error: st.error });
            if (st.state === 'done') toast(`Segment ${j.n} prêt`, 'ok');
            if (st.state === 'error') toast(`Segment ${j.n} : ${st.error}`, 'warn');
            ed.refreshNode(n.id);
            if (ed.selected && ed.selected.id === n.id) renderInspector();
            autosave();
          }
        } catch (e) { j.lastError = e.message; }
      }
    }, 6000);
  }

  // ------------------------------------------------------------------ exécution
  async function runAll(force) {
    if (!ed.graph.nodes.length) return toast('Ajoutez d’abord des nodes.');
    if (LX.settings.engine === 'ia' && !checkIA()) return;
    setBusy(true);
    const st = await LX.engine.run(ed, { force, log, onNodeDone: (n) => { if (ed.selected && ed.selected.id === n.id) renderInspector(); } });
    setBusy(false);
    toast(`Terminé en ${(st.ms / 1000).toFixed(1)} s — ${st.computed} calculé(s), ${st.cached} à jour${st.errors ? ', ' + st.errors + ' erreur(s)' : ''}`, st.errors ? 'warn' : 'ok');
    renderInspector();
    autosave();
  }
  async function runNode(id) {
    const node = ed.node(id);
    if (!node) return;
    if (LX.engine.engineFor(node) === 'ia' && !checkIA()) return;
    setBusy(true);
    delete node._sig; // ▶ sur un node = on le régénère (l'amont reste en cache)
    await LX.engine.run(ed, { only: id, force: false, log });
    ed.markStale(id);
    if ((ed.status[id] || {}).state === 'stale') ed.setStatus(id, 'done');
    setBusy(false);
    if (ed.selected && ed.selected.id === id) { currentTab = (ed.status[id] || {}).state === 'done' ? 'result' : currentTab; renderInspector(); }
    autosave();
  }
  function checkIA() {
    const s = LX.settings;
    const p = s.provider;
    const srv = LX.api.status && LX.api.status.providers && LX.api.status.providers[p];
    const ok = p === 'ollama' || p === 'compatible' || (s.keys || {})[p] || (srv && srv.configured);
    if (!ok) {
      toast(`Aucune clé pour ${(LX.providers.INFO[p] || {}).label || p} : ajoutez-la dans Réglages (ou .env), ou repassez en moteur local.`, 'warn');
      openSettings();
      return false;
    }
    return true;
  }
  function setBusy(b) {
    document.body.classList.toggle('busy', b);
    $('#btn-run').innerHTML = b ? '<i class="spin"></i><span class="t"> En cours…</span>' : LX.icon.svg('play') + '<span class="t"> Tout exécuter</span>';
  }

  // ------------------------------------------------------------------ animatique
  function openAnimatic(script) {
    const host = h('div', { class: 'animatic' });
    let player;
    modal('Animatique — ' + script.titre, host, { wide: true, onClose: () => player && player.stop() });
    player = LX.animatic.open(host, script);
  }

  // ------------------------------------------------------------------ projets
  let autosaveTimer = null;
  function autosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => U.store.set('autosave', serialize()), 400);
  }
  function serialize() {
    const g = ed.graph;
    return { version: 1, meta: Object.assign({}, g.meta, { updated: new Date().toISOString() }), nodes: g.nodes.map((n) => ({ id: n.id, type: n.type, x: n.x, y: n.y, data: n.data, out: n.out, _sig: n._sig, jobs: n.jobs })), links: g.links };
  }
  function loadGraph(g) {
    ed.load(JSON.parse(JSON.stringify(g)));
    $('#title').value = ed.graph.meta.title || 'Sans titre';
    renderInspector();
    autosave();
    startVideoPolling();
  }
  async function saveProject() {
    const g = serialize();
    if (LX.api.server) {
      try {
        const r = await fetch('api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(g) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        toast('Projet enregistré : projects/' + j.file, 'ok');
        return;
      } catch (e) { toast('Enregistrement serveur impossible : ' + e.message, 'warn'); }
    }
    U.download(U.slug(g.meta.title) + '.lexinode.json', JSON.stringify(g, null, 2));
  }
  async function openProjects() {
    const body = h('div', { class: 'projects' });
    const m = modal('Ouvrir', body, { wide: true });
    let examples = [], projects = [];
    if (LX.api.server) {
      try { const j = await (await fetch('api/projects')).json(); examples = j.examples; projects = j.projects; } catch (e) { /* ignore */ }
    } else if (window.LEXINODE_EXAMPLES) {
      examples = window.LEXINODE_EXAMPLES.map((g, i) => ({ file: String(i), title: g.meta.title, description: g.meta.description, inline: g }));
    }
    const open = async (item, isExample) => {
      let g = item.inline;
      if (!g) {
        const r = await fetch('api/projects/' + encodeURIComponent(item.file) + (isExample ? '?example=1' : ''));
        g = await r.json();
      }
      loadGraph(g);
      m.close();
      toast('« ' + g.meta.title + ' » ouvert');
    };
    body.append(h('h3', {}, 'Exemples'), examples.length ? h('div', { class: 'cards' }, examples.map((x) => h('button', { class: 'card', onclick: () => open(x, true) }, h('b', {}, x.title), h('div', { class: 'small muted' }, x.description || '')))) : h('div', { class: 'muted' }, 'Aucun exemple disponible.'));
    if (projects.length) body.append(h('h3', {}, 'Mes projets (dossier projects/)'), h('div', { class: 'cards' }, projects.map((x) => h('button', { class: 'card', onclick: () => open(x, false) }, h('b', {}, x.title), h('div', { class: 'small muted' }, new Date(x.updated).toLocaleString('fr-FR'))))));
    const file = h('input', { type: 'file', accept: '.json,application/json' });
    file.addEventListener('change', async () => {
      const f = file.files[0];
      if (!f) return;
      try { loadGraph(JSON.parse(await f.text())); m.close(); } catch (e) { toast('Fichier invalide : ' + e.message, 'warn'); }
    });
    body.append(h('h3', {}, 'Importer un fichier'), file);
  }
  function askConfirm(msg, yesLabel, onYes) {
    const m = modal('Confirmer', h('div', {}, h('p', {}, msg), h('div', { class: 'row' },
      h('button', { class: 'btn primary', onclick: () => { m.close(); onYes(); } }, yesLabel),
      h('button', { class: 'btn', onclick: () => m.close() }, 'Annuler'))));
  }
  LX.showText = (name, content) => {
    const ta = h('textarea', { class: 'json-edit', rows: 22, readonly: true, id: 'export-text' });
    ta.value = content;
    const b = h('button', { class: 'btn primary' }, 'Copier');
    b.addEventListener('click', async () => { const ok = await U.copy(content); b.textContent = ok ? '✓ Copié' : 'Sélectionnez le texte puis copiez-le'; if (!ok) { ta.focus(); ta.select(); } });
    modal('Export — ' + name, h('div', {}, h('div', { class: 'small muted' }, 'Le téléchargement direct n’est pas disponible ici : copiez le contenu ci-dessous.'), ta, h('div', { class: 'row' }, b)), { wide: true });
  };
  function newProject() {
    if (ed.graph.nodes.length) return askConfirm('Créer un nouveau projet ? Le projet actuel sera remplacé (pensez à l’exporter si vous voulez le garder).', 'Nouveau projet', doNewProject);
    doNewProject();
  }
  function doNewProject() {
    loadGraph({ version: 1, meta: { title: 'Nouveau projet' }, nodes: [{ id: U.uid('n'), type: 'sujet', x: 80, y: 120, data: {} }], links: [] });
  }

  // ------------------------------------------------------------------ réglages
  function demoInfo() {
    modal('Agents IA', h('div', { class: 'help' },
      h('p', {}, 'Cette page est la version de démonstration : elle tourne entièrement avec le moteur local (base de connaissances de 21 lexiques, gabarits, calculs de comparaison), sans clé ni appel réseau.'),
      h('p', {}, 'La version complète, à installer chez vous, branche chaque rôle d’agent (chercheur, analyste, rédacteur, traducteur, débatteur, scénariste) sur Claude, OpenAI / Codex, Gemini, Ollama ou tout serveur compatible OpenAI, avec recherche web (recherche intégrée des LLM, SearXNG, Wikipédia, Tavily, Brave).'),
      h('pre', { class: 'prompt' }, 'node server.js   →   http://localhost:5177\n# ou, 100 % open source :\ndocker compose up -d'),
      (() => { const cb = h('input', { type: 'checkbox', id: 'demo-mono' }); cb.checked = !!LX.settings.monoIcons; cb.addEventListener('change', () => { LX.settings.monoIcons = cb.checked; saveSettings(); document.body.classList.toggle('mono-icons', cb.checked); }); return h('label', { class: 'row' }, cb, ' Icônes monochromes'); })()));
  }
  function openSettings() {
    if (window.LEXINODE_DEMO) return demoInfo();
    const s = LX.settings;
    const srv = LX.api.status;
    const body = h('div', { class: 'settings' });
    const provSel = (value, withDefault) => {
      const sel = h('select', {});
      if (withDefault) sel.append(h('option', { value: '', selected: !value }, '— fournisseur par défaut —'));
      for (const [k, info] of Object.entries(LX.providers.INFO)) sel.append(h('option', { value: k, selected: value === k }, info.label));
      return sel;
    };
    const modelIn = (provider, value) => {
      const id = 'dl-' + U.uid('m');
      const inp = h('input', { type: 'text', value: value || '', placeholder: (LX.providers.INFO[provider] || {}).defaultModel || 'modèle', list: id });
      const dl = h('datalist', { id }, ((LX.providers.INFO[provider] || {}).models || []).map((m) => h('option', { value: m })));
      return h('span', {}, inp, dl);
    };
    // moteur par défaut
    const pSel = provSel(s.provider);
    let mBox = modelIn(s.provider, s.model);
    const mWrap = h('span', {}, mBox);
    pSel.addEventListener('change', () => { s.provider = pSel.value; s.model = ''; mBox = modelIn(s.provider, ''); mWrap.innerHTML = ''; mWrap.append(mBox); bindModel(); saveSettings(); });
    const bindModel = () => U.$('input', mBox).addEventListener('input', (e) => { s.model = e.target.value; saveSettings(); });
    bindModel();
    body.append(h('h3', {}, 'Moteur IA par défaut'),
      h('div', { class: 'row wrap' }, pSel, mWrap),
      h('div', { class: 'small muted' }, 'Les modèles sont modifiables : saisissez l’identifiant exact disponible sur votre compte (les suggestions ne sont qu’indicatives).'));

    // clés
    // Champ de clé. Avec le coffre : la valeur part chiffrée au serveur et le champ reste vide.
    // Sans coffre : la valeur est gardée dans ce navigateur (et envoyée au serveur à chaque appel).
    const secretRow = (k, label, inEnv) => {
      if (!vaultOn()) {
        const inp = h('input', { type: 'password', value: (s.keys || {})[k] || '', placeholder: inEnv() ? 'défini dans .env ✓' : 'non défini', autocomplete: 'off' });
        inp.addEventListener('input', () => { s.keys = s.keys || {}; s.keys[k] = inp.value.trim(); saveSettings(); });
        return h('label', { class: 'field' }, h('span', { class: 'fl' }, label), inp);
      }
      const inp = h('input', { type: 'password', value: '', autocomplete: 'off' });
      const rm = h('button', { class: 'btn sm', type: 'button' }, 'Retirer');
      const paint = () => {
        const inVault = ((LX.api.status.vault || {}).keys || []).includes(k);
        inp.placeholder = inVault ? '✓ enregistrée, chiffrée — saisir pour remplacer' : inEnv() ? 'défini dans .env ✓' : 'non défini';
        rm.style.display = inVault ? '' : 'none';
      };
      let busy = false;
      const commit = async () => {
        const v = inp.value.trim();
        if (!v || busy) return;
        busy = true;
        try { await vaultCall({ set: { [k]: v } }); inp.value = ''; toast('Clé enregistrée, chiffrée sur le serveur.'); } catch (e) { toast(e.message, 'warn'); }
        busy = false;
        paint();
      };
      inp.addEventListener('change', commit);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
      inp.addEventListener('paste', () => setTimeout(commit, 60));
      rm.addEventListener('click', async (e) => {
        e.preventDefault();
        try { await vaultCall({ remove: [k] }); toast('Clé retirée du coffre.'); } catch (er) { toast(er.message, 'warn'); }
        paint();
      });
      paint();
      return h('label', { class: 'field' }, h('span', { class: 'fl' }, label), h('span', { class: 'key-row' }, inp, rm));
    };
    const provEnv = (k) => () => !!(LX.api.status && LX.api.status.providers && LX.api.status.providers[k] && LX.api.status.providers[k].configured);
    const keyRow = (k, label) => secretRow(k, label, provEnv(k));
    const vs = LX.api.status && LX.api.status.vault;
    const keyHelp = vaultOn() ? 'Coffre actif : une clé saisie ici est chiffrée (AES-256-GCM) sur le serveur de cette installation et ne revient jamais dans le navigateur. Elle reste propre à cette installation.'
      : vs && vs.error ? 'Coffre indisponible : ' + vs.error + ' En attendant, une clé saisie ici est gardée dans ce navigateur.'
        : LX.api.server ? 'Serveur détecté, coffre désactivé : définissez LEXINODE_MASTER_KEY dans .env pour enregistrer les clés chiffrées sur le serveur. En attendant, une clé saisie ici est gardée en clair dans ce navigateur et envoyée au serveur ; le plus sûr reste le fichier .env.'
          : 'Mode autonome (sans serveur) : les clés restent dans ce navigateur et les appels partent directement vers les fournisseurs.';
    body.append(h('h3', {}, 'Clés API'),
      h('div', { class: 'small muted' }, keyHelp),
      h('div', { class: 'grid2' }, keyRow('anthropic', 'Anthropic (Claude)'), keyRow('openai', 'OpenAI (GPT / Codex)'), keyRow('gemini', 'Google Gemini'), keyRow('deepseek', 'DeepSeek'), keyRow('compatible', 'Serveur compatible OpenAI (si clé)'), keyRow('tavily', 'Tavily (recherche)'), keyRow('brave', 'Brave Search (recherche)'), secretRow('elevenlabs', 'ElevenLabs (voix off)', () => !!(LX.api.status && LX.api.status.voice && LX.api.status.voice.elevenlabs))));

    // URL locales
    const urlRow = (k, label, ph) => {
      const inp = h('input', { type: 'text', value: (s.baseUrls || {})[k] || '', placeholder: ph });
      inp.addEventListener('input', () => { s.baseUrls = s.baseUrls || {}; s.baseUrls[k] = inp.value.trim(); saveSettings(); });
      return h('label', { class: 'field' }, h('span', { class: 'fl' }, label), inp);
    };
    const ollamaBtn = h('button', { class: 'btn sm' }, 'Lister les modèles Ollama');
    const ollamaOut = h('span', { class: 'small muted' });
    ollamaBtn.addEventListener('click', async () => {
      ollamaOut.textContent = '…';
      try {
        const base = (s.baseUrls || {}).ollama;
        const j = LX.api.server ? await (await fetch('api/ollama/models' + (base ? '?base=' + encodeURIComponent(base) : ''))).json() : { models: ((await LX.providers.fetchJSON((base || LX.providers.INFO.ollama.defaultBase) + '/api/tags', {}, 8000)).models || []).map((m) => m.name) };
        if (j.error) throw new Error(j.error);
        ollamaOut.textContent = j.models.length ? 'Disponibles : ' + j.models.join(', ') : 'Aucun modèle installé (ollama pull qwen3:14b).';
      } catch (e) { ollamaOut.textContent = 'Ollama injoignable : ' + e.message; }
    });
    body.append(h('h3', {}, 'Open source / local'),
      h('div', { class: 'grid2' }, urlRow('ollama', 'Ollama', 'http://127.0.0.1:11434'), urlRow('compatible', 'Serveur compatible OpenAI', 'http://127.0.0.1:1234/v1'), urlRow('searxng', 'SearXNG (recherche)', 'http://127.0.0.1:8888')),
      h('div', { class: 'row' }, ollamaBtn, ollamaOut));

    // routage des agents
    const table = h('table', { class: 'tbl roles' }, h('tr', {}, h('th', {}, 'Agent'), h('th', {}, 'Fournisseur'), h('th', {}, 'Modèle')));
    for (const [role, def] of Object.entries(LX.ai.ROLES)) {
      const r = (s.roles && s.roles[role]) || {};
      const sel = provSel(r.provider, true);
      const cell = h('td', {});
      const renderModel = () => {
        cell.innerHTML = '';
        const mi = modelIn(sel.value || s.provider, r.model);
        U.$('input', mi).addEventListener('input', (e) => { s.roles = s.roles || {}; s.roles[role] = Object.assign({}, s.roles[role], { model: e.target.value }); saveSettings(); });
        cell.append(mi);
      };
      sel.addEventListener('change', () => { s.roles = s.roles || {}; s.roles[role] = { provider: sel.value, model: '' }; r.model = ''; saveSettings(); renderModel(); });
      renderModel();
      table.append(h('tr', {}, h('td', {}, LX.icon.el(def.ico), ' ' + def.label), h('td', {}, sel), cell));
    }
    body.append(h('h3', {}, 'Armée d’agents — routage par rôle'),
      h('div', { class: 'small muted' }, 'Exemple : chercheur → Gemini (recherche Google intégrée), rédacteur → Claude, scénariste → Ollama local. Laissez vide pour utiliser le fournisseur par défaut.'), table);

    // recherche & divers
    const searchSel = h('select', {}, [['auto', 'Automatique (recherche native du LLM si dispo, sinon SearXNG / Tavily / Brave / Wikipédia)'], ['native', 'Recherche intégrée du LLM (Claude, OpenAI, Gemini)'], ['searxng', 'SearXNG (open source)'], ['wikipedia', 'Wikipédia'], ['tavily', 'Tavily'], ['brave', 'Brave Search']].map(([v, l]) => h('option', { value: v, selected: s.searchProvider === v }, l)));
    searchSel.addEventListener('change', () => { s.searchProvider = searchSel.value; saveSettings(); });
    const effSel = h('select', {}, ['low', 'medium', 'high'].map((v) => h('option', { value: v, selected: s.effort === v }, v)));
    effSel.addEventListener('change', () => { s.effort = effSel.value; saveSettings(); });
    const conc = h('input', { type: 'number', min: 1, max: 12, value: s.concurrency || 3 });
    conc.addEventListener('input', () => { s.concurrency = Number(conc.value) || 3; saveSettings(); });
    body.append(h('h3', {}, 'Recherche et exécution'),
      h('div', { class: 'grid2' },
        h('label', { class: 'field' }, h('span', { class: 'fl' }, 'Recherche de données'), searchSel),
        h('label', { class: 'field' }, h('span', { class: 'fl' }, 'Effort de réflexion (Claude)'), effSel),
        h('label', { class: 'field' }, h('span', { class: 'fl' }, 'Agents IA en parallèle'), conc)));

    // génération vidéo
    const vidKey = (k, label) => secretRow(k, label, () => !!(LX.api.status && LX.api.status.video && LX.api.status.video[k]));
    const vidBox = h('div', {});
    for (const [id, P] of Object.entries(LX.VIDEO_MODELS)) {
      const ep = h('input', { type: 'text', value: (s.falModels || {})[id] || '', placeholder: P.falId ? 'par défaut : ' + P.falId : 'identifiant fal.ai du modèle' });
      ep.addEventListener('input', () => { s.falModels = s.falModels || {}; s.falModels[id] = ep.value.trim(); saveSettings(); });
      const tpl = h('textarea', { rows: 3, spellcheck: 'false', class: 'json-edit' });
      tpl.value = (s.falTemplates || {})[id] || P.falTemplate;
      tpl.addEventListener('input', () => { s.falTemplates = s.falTemplates || {}; s.falTemplates[id] = tpl.value; saveSettings(); });
      vidBox.append(h('div', { class: 'vid-model' }, h('b', {}, P.nom), h('label', { class: 'field' }, h('span', { class: 'fl' }, 'Identifiant du modèle sur fal.ai'), ep),
        h('details', {}, h('summary', {}, 'Corps de la requête fal.ai (JSON, avec {prompt}, {duration}, {ratio}, {resolution} en minuscules, {RESOLUTION} en majuscules, {seed})'), tpl)));
    }
    body.append(h('h3', {}, 'Génération vidéo'),
      h('div', { class: 'small muted' }, 'Avec une clé fal.ai, rien d’autre à régler : les identifiants des trois modèles sont préremplis (laissez les champs vides). Ne les modifiez que si fal change de version.'),
      h('div', { class: 'grid2' }, vidKey('fal', 'Clé fal.ai (FAL_KEY)'), vidKey('minimax', 'Clé MiniMax (H3, direct)'), vidKey('dashscope', 'Clé DashScope (Wan 3.0, direct)')),
      vidBox);
    // apparence
    const monoCb = h('input', { type: 'checkbox', id: 'set-mono' });
    monoCb.checked = !!s.monoIcons;
    monoCb.addEventListener('change', () => { s.monoIcons = monoCb.checked; saveSettings(); document.body.classList.toggle('mono-icons', s.monoIcons); });
    body.append(h('h3', {}, 'Apparence'), h('label', { class: 'row' }, monoCb, ' Icônes monochromes (sinon : une couleur à plat par type de node et par langage)'));
    // test
    const testOut = h('div', { class: 'small' });
    const testBtn = h('button', { class: 'btn primary' }, 'Tester le fournisseur par défaut');
    testBtn.addEventListener('click', async () => {
      testOut.textContent = 'Appel en cours…';
      try {
        const r = await LX.ai.call('redacteur', { prompt: 'Réponds exactement : {"ok": true, "message": "Lexinode est connecté"}' }, { log, nodeTitle: 'Test de connexion' });
        testOut.textContent = '✓ ' + (r.model || '') + ' : ' + r.text.slice(0, 160);
      } catch (e) { testOut.textContent = '✕ ' + e.message; }
    });
    body.append(h('div', { class: 'row' }, testBtn), testOut);
    if (srv) {
      body.append(h('h3', {}, 'État du serveur local'), h('ul', { class: 'small' }, Object.entries(srv.providers).map(([k, p]) => h('li', {}, `${p.label} : ${p.configured ? '✓ configuré' : '—'}${p.baseUrl ? ' (' + p.baseUrl + ')' : ''}`))));
    }
    modal('Réglages', body, { wide: true, onClose: () => { renderEngineToggle(); renderInspector(); } });
  }

  // ------------------------------------------------------------------ bibliothèque de lexiques
  function openLexicons(focusId) {
    const body = h('div', { class: 'lexlib' });
    const list = h('div', { class: 'lexlist' });
    const detail = h('div', { class: 'lexdetail' });
    body.append(list, detail);
    const m = modal('Bibliothèque d’éléments de langage', body, { wide: true });
    const show = (lx) => {
      U.$$('.lexlist button', body).forEach((b) => b.classList.toggle('on', b.dataset.id === lx.id));
      detail.innerHTML = '';
      const sec = (title, content) => (content ? h('section', {}, h('h4', {}, title), content) : null);
      detail.append(
        h('div', { class: 'lexdetail-h', style: { '--c': lx.couleur } }, h('h3', {}, LX.icon.lex(lx, 'big'), ' ', lx.nom), h('div', { class: 'small muted' }, lx.categorie + (lx._custom ? ' · fiche personnalisée' : '')),
          h('div', { class: 'row' },
            h('button', { class: 'btn primary sm', onclick: () => { const c = ed.center(); ed.addNode('lexique', c.x - 100, c.y - 60, { lexique: lx.id }); m.close(); } }, LX.icon.el('plus'), ' Ajouter au canvas'),
            h('button', { class: 'btn sm', onclick: () => editLexicon(lx, m) }, LX.icon.el('pen'), ' Dupliquer / éditer (JSON)'),
            h('button', { class: 'btn sm', onclick: () => U.download(lx.id + '.json', JSON.stringify(stripInternal(lx), null, 2)) }, LX.icon.el('download'), ' JSON'))),
        h('p', {}, lx.description), lx.posture ? h('p', { class: 'small' }, h('b', {}, 'Posture : '), lx.posture) : null,
        sec('Valeurs invoquées', lx.valeurs.length ? h('div', { class: 'chips' }, lx.valeurs.map((v) => h('span', { class: 'chip' }, v))) : null),
        sec(`Vocabulaire (${lx.vocabulaire.length})`, h('table', { class: 'tbl' }, lx.vocabulaire.map((v) => h('tr', {}, h('td', {}, h('b', {}, v.terme)), h('td', {}, v.sens), h('td', { class: 'muted small' }, v.usage || ''))))),
        sec(`Formules (${lx.formules.length})`, h('ul', {}, lx.formules.map((f) => h('li', {}, '« ' + f + ' »')))),
        sec('Connecteurs', h('div', { class: 'chips' }, lx.connecteurs.map((c) => h('span', { class: 'chip' }, c)))),
        sec('Euphémismes / reformulations', lx.euphemismes.length ? h('table', { class: 'tbl' }, lx.euphemismes.map((e) => h('tr', {}, h('td', {}, e.brut), h('td', {}, '→ ', h('b', {}, e.edl)), h('td', { class: 'muted small' }, e.commentaire || '')))) : null),
        sec('Grilles de lecture', h('ul', {}, lx.cadres.map((c) => h('li', {}, h('b', {}, c.nom), ' — ', c.question, c.explication ? h('div', { class: 'small muted' }, c.explication) : null)))),
        sec('Structures argumentatives', h('div', {}, lx.structures.map((s) => h('div', { class: 'struct' }, h('b', {}, s.nom), s.description ? h('div', { class: 'small muted' }, s.description) : null, h('ol', {}, s.etapes.map((e) => h('li', {}, h('b', {}, e.titre), ` [${e.role}] — ${e.consigne || ''}`))))))),
        sec('Rapport aux chiffres', lx.rapport_aux_chiffres.posture ? h('div', {}, h('p', { class: 'small' }, lx.rapport_aux_chiffres.posture), h('div', { class: 'chips' }, (lx.rapport_aux_chiffres.unites || []).map((u) => h('span', { class: 'chip' }, u)))) : null),
        sec('Métaphores', lx.metaphores.length ? h('ul', {}, lx.metaphores.map((x) => h('li', {}, x))) : null),
        sec('Travers et critiques', lx.pieges.length ? h('ul', {}, lx.pieges.map((x) => h('li', {}, x))) : null),
        sec('Registres', h('dl', { class: 'kv' }, Object.entries(lx.registres).flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]))),
        sec('Codes visuels', h('div', {}, h('div', { class: 'swatches' }, lx.visuel.palette.map((c) => h('span', { style: { background: c }, title: c }))), h('div', { class: 'small' }, lx.visuel.style_motion || ''), h('div', { class: 'chips' }, lx.visuel.motifs.concat(lx.visuel.pictogrammes).map((x) => h('span', { class: 'chip', title: x.en }, x.fr))))),
        sec('Exemples', lx.exemples.length ? h('div', {}, lx.exemples.map((x) => h('blockquote', {}, h('div', { class: 'small muted' }, x.contexte), x.texte))) : null),
        sec('Sources', lx.sources.length ? h('ol', { class: 'small' }, lx.sources.map((s) => h('li', {}, h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.titre), s.auteur ? ' — ' + s.auteur : '', s.apport ? h('div', { class: 'muted' }, s.apport) : null))) : null));
      detail.scrollTop = 0;
    };
    const groups = [['Métiers', LX.lex.metiers()], ['Grilles sociologiques', LX.lex.sociologies()]];
    for (const [label, lst] of groups) {
      list.append(h('div', { class: 'pal-cat' }, `${label} (${lst.length})`));
      for (const lx of lst) list.append(h('button', { 'data-id': lx.id, style: { '--c': lx.couleur }, onclick: () => show(lx) }, LX.icon.lex(lx), ' ', lx.nom));
    }
    list.append(h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => editLexicon(null, m) }, LX.icon.el('plus'), ' Nouveau lexique')));
    const first = (focusId && LX.lex.byId[focusId]) || LX.lex.metiers()[0] || LX.lex.get('neutre');
    show(first);
  }
  const stripInternal = (lx) => { const o = JSON.parse(JSON.stringify(lx)); delete o._terms; delete o._custom; return o; };
  function editLexicon(lx, parentModal) {
    const base = lx ? stripInternal(lx) : stripInternal(LX.lex.NEUTRE);
    if (!lx) { base.id = 'mon-metier'; base.nom = 'Mon métier'; base.description = 'Décrivez le corps de métier.'; }
    else if (!lx._custom) { base.id = lx.id; }
    const ta = h('textarea', { class: 'json-edit', rows: 24, spellcheck: 'false' });
    ta.value = JSON.stringify(base, null, 2);
    const msg = h('div', { class: 'small' });
    const save = h('button', { class: 'btn primary' }, 'Enregistrer');
    const body = h('div', {}, h('div', { class: 'small muted' }, 'Format : voir docs/SCHEMA-LEXIQUE.md. Garder le même « id » remplace la fiche d’origine par votre version ; un nouvel « id » crée une nouvelle fiche.'), ta, h('div', { class: 'row' }, save), msg);
    const m = modal('Édition de lexique', body, { wide: true });
    save.addEventListener('click', async () => {
      let obj;
      try { obj = JSON.parse(ta.value); } catch (e) { msg.textContent = '✕ JSON invalide : ' + e.message; return; }
      if (!obj.id || !obj.nom) { msg.textContent = '✕ "id" et "nom" sont obligatoires.'; return; }
      obj.id = U.slug(obj.id);
      if (LX.api.server) {
        try {
          const r = await fetch('api/lexicons', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(obj) });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error);
        } catch (e) { msg.textContent = '✕ ' + e.message; return; }
      } else {
        const custom = U.store.get('customLexicons', []).filter((x) => x.id !== obj.id);
        custom.push(Object.assign(obj, { _custom: true }));
        U.store.set('customLexicons', custom);
      }
      await LX.lex.load();
      ed.render();
      toast('Lexique « ' + obj.nom + ' » enregistré', 'ok');
      m.close();
      if (parentModal) parentModal.close();
      openLexicons(obj.id);
    });
  }

  function openHelp() {
    const body = h('div', { class: 'help' },
      h('p', {}, 'Lexinode fabrique des raisonnements à partir des éléments de langage de corps de métier et de grilles sociologiques, puis les transforme en shorts animés pédagogiques.'),
      h('h3', {}, 'Les nodes'),
      h('ul', { class: 'help-nodes' }, Object.values(N.DEFS).map((d) => h('li', {}, LX.icon.el(d.ico, (N.TYPES[d.outputs[0].type] || {}).color), ' ', h('b', {}, d.title), ' — ', d.desc))),
      h('h3', {}, 'Raccourcis'),
      h('ul', { class: 'small' },
        h('li', {}, 'Double-clic sur le canvas : ajouter un node · Clic droit : menu'),
        h('li', {}, 'Tirer un fil depuis une sortie vers le vide : ajouter un node déjà branché'),
        h('li', {}, 'Glisser depuis une entrée branchée : débrancher / rebrancher · depuis une entrée libre : brancher sur un node compatible'),
        h('li', {}, 'Glisser sur le fond : sélectionner plusieurs nodes (Maj : ajouter) · Clic molette ou Alt + glisser : déplacer la vue'),
        h('li', {}, 'Suppr : supprimer la sélection · Ctrl+D : dupliquer · Ctrl+Z / Ctrl+Y : annuler / rétablir'),
        h('li', {}, 'Ctrl+Entrée : tout exécuter · Ctrl+S : enregistrer · Molette : zoom')),
      h('h3', {}, 'Rapport au réel'),
      h('p', { class: 'small' }, 'Chaque donnée porte un statut (sourcé, saisi, estimé, fictif, inconnu) qui se propage jusqu’à la réflexion (indice de fiabilité) et au short (mention obligatoire « estimation » ou « fictif »). Les comparaisons rappellent qu’une corrélation n’est pas une causalité.'));
    modal('Aide', body, { wide: true });
  }

  // ------------------------------------------------------------------ barre d'outils
  // Menu du moteur IA : fournisseur + modèle. Il lit et écrit LX.settings.provider / model, comme « Moteur IA par défaut »
  // dans Réglages : les deux restent donc synchronisés.
  let engineMenu = null;
  function closeEngineMenu() {
    if (!engineMenu) return;
    engineMenu.el.remove();
    document.removeEventListener('mousedown', engineMenu.onDown, true);
    document.removeEventListener('keydown', engineMenu.onKey);
    engineMenu = null;
  }
  function openEngineMenu(anchor) {
    closeEngineMenu();
    const s = LX.settings;
    const INFO = LX.providers.INFO;
    const st = (LX.api.status && LX.api.status.providers) || {};
    const hasKey = (k) => k === 'ollama' || k === 'compatible' || !!(s.keys || {})[k] || !!(st[k] && st[k].configured);
    const pSel = h('select', {}, Object.entries(INFO).map(([k, info]) => h('option', { value: k, selected: s.provider === k }, info.label + (hasKey(k) ? '' : ' — pas de clé'))));
    const mSel = h('select', {});
    const fillModels = () => {
      const info = INFO[s.provider] || {};
      const list = (info.models || []).slice();
      if (s.model && !list.includes(s.model)) list.unshift(s.model);
      mSel.innerHTML = '';
      mSel.append(h('option', { value: '', selected: !s.model }, 'Modèle par défaut' + (info.defaultModel ? ' (' + info.defaultModel + ')' : '')));
      list.forEach((m) => mSel.append(h('option', { value: m, selected: s.model === m }, m)));
    };
    fillModels();
    pSel.addEventListener('change', () => { s.provider = pSel.value; s.model = ''; saveSettings(); fillModels(); renderEngineToggle(); });
    mSel.addEventListener('change', () => { s.model = mSel.value; saveSettings(); renderEngineToggle(); });
    const el = h('div', { class: 'engine-menu' },
      h('label', { class: 'field' }, h('span', { class: 'fl' }, 'Fournisseur'), pSel),
      h('label', { class: 'field' }, h('span', { class: 'fl' }, 'Modèle'), mSel),
      h('div', { class: 'small muted' }, 'Même réglage que « Moteur IA par défaut » dans Réglages, où l’on peut aussi saisir un autre identifiant de modèle.'));
    document.body.append(el);
    const r = anchor.getBoundingClientRect();
    el.style.top = (r.bottom + 6) + 'px';
    el.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
    const onDown = (e) => { if (!el.contains(e.target) && !e.target.closest('#engine-toggle')) closeEngineMenu(); };
    const onKey = (e) => { if (e.key === 'Escape') closeEngineMenu(); };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey);
    engineMenu = { el, onDown, onKey };
  }

  function renderEngineToggle() {
    const box = $('#engine-toggle');
    box.innerHTML = '';
    const mk = (v, l, tip) => h('button', {
      class: LX.settings.engine === v ? 'on' : '',
      title: tip || '',
      onclick: (e) => {
        if (v === 'ia' && LX.settings.engine === 'ia') { if (engineMenu) closeEngineMenu(); else openEngineMenu(e.currentTarget); return; }
        closeEngineMenu();
        LX.settings.engine = v; saveSettings(); renderEngineToggle(); for (const n of ed.graph.nodes) if (!LX.engine.LOCAL_ONLY.includes(n.type)) ed.markStale(n.id); renderInspector();
      },
    }, l);
    const p = LX.providers.INFO[LX.settings.provider];
    if (window.LEXINODE_DEMO) {
      LX.settings.engine = 'local';
      box.append(mk('local', h('span', {}, LX.icon.el('cpu'), h('span', { class: 't' }, ' Local'))), h('button', { onclick: () => demoInfo() }, LX.icon.el('sparkle'), h('span', { class: 't' }, ' IA')));
      return;
    }
    box.append(mk('local', h('span', {}, LX.icon.el('cpu'), h('span', { class: 't' }, ' Local'))), mk('ia', h('span', {}, LX.icon.el('sparkle'), h('span', { class: 't' }, ' IA' + (LX.settings.engine === 'ia' && p ? ' · ' + p.label.split(' ')[0] + ' ▾' : ''))),
      LX.settings.engine === 'ia' && p ? `${p.label} · ${LX.settings.model || p.defaultModel} — cliquez pour changer de fournisseur ou de modèle` : 'Moteur IA'));
  }

  function bindToolbar() {
    $('#title').addEventListener('input', (e) => { ed.graph.meta.title = e.target.value; autosave(); });
    $('#btn-new').addEventListener('click', newProject);
    $('#btn-open').addEventListener('click', openProjects);
    $('#btn-save').addEventListener('click', saveProject);
    $('#btn-export').addEventListener('click', () => U.download(U.slug(ed.graph.meta.title) + '.lexinode.json', JSON.stringify(serialize(), null, 2)));
    $('#btn-dossier').addEventListener('click', () => {
      const md = LX.render.dossier(ed);
      U.download(U.slug(ed.graph.meta.title) + '-dossier.md', md, 'text/markdown');
    });
    $('#btn-run').addEventListener('click', () => runAll(false));
    $('#btn-settings').addEventListener('click', openSettings);
    $('#btn-lex').addEventListener('click', () => openLexicons());
    $('#btn-help').addEventListener('click', openHelp);
    $('#btn-undo').addEventListener('click', () => ed.undo());
    $('#btn-redo').addEventListener('click', () => ed.redo());
    $('#btn-fit').addEventListener('click', () => ed.fit());
    $('#btn-zin').addEventListener('click', () => ed.zoom(1.2));
    $('#btn-zout').addEventListener('click', () => ed.zoom(1 / 1.2));
    $('#btn-palette').addEventListener('click', () => document.body.classList.toggle('show-palette'));
    $('#btn-insp').addEventListener('click', () => document.body.classList.toggle('show-insp'));
    $('#log-toggle').addEventListener('click', () => document.body.classList.toggle('show-log'));
    $('#btn-clearlog').addEventListener('click', () => { logEntries = []; renderLog(); });
    document.addEventListener('keydown', (e) => {
      const inField = e.target.closest && e.target.closest('input,textarea,select,[contenteditable]');
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'Enter') { e.preventDefault(); runAll(false); return; }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveProject(); return; }
      if (inField || document.querySelector('.modal-back')) return;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? ed.redo() : ed.undo(); }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); ed.redo(); }
      else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); if (ed.selected && ed.selected.kind === 'node') ed.duplicate(ed.selected.id); }
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!ed.selected) return;
        e.preventDefault();
        if (ed.selected.kind === 'node') { if (ed.multi.size > 1) ed.removeNodes([...ed.multi]); else ed.removeNode(ed.selected.id); } else ed.removeLink(ed.selected.id);
      } else if (e.key === 'Escape') { ed.hideMenu(); ed.select(null); }
    });
    // glisser-déposer depuis la palette
    const canvas = $('#canvas');
    canvas.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/lexinode-node')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
    canvas.addEventListener('drop', (e) => {
      const type = e.dataTransfer.getData('text/lexinode-node');
      if (!type) return;
      e.preventDefault();
      const p = ed.toWorld(e.clientX, e.clientY);
      ed.addNode(type, p.x - 20, p.y - 20);
    });
  }

  // ------------------------------------------------------------------ démarrage
  async function init() {
    if (!window.LEXINODE_STANDALONE) {
      try {
        const r = await fetch('api/status');
        if (r.ok) { LX.api.status = await r.json(); LX.api.server = true; }
      } catch (e) { /* mode autonome */ }
    }
    await migrateKeysToVault();
    await LX.lex.load();
    await LX.topics.load();
    U.$$('[data-ico]').forEach((el) => el.prepend(LX.icon.el(el.dataset.ico)));
    document.body.classList.toggle('mono-icons', !!LX.settings.monoIcons);
    const pv = LX.api.status && LX.api.status.providers;
    if (pv && pv.fal && pv.fal.configured && !(pv[LX.settings.provider] || {}).configured && !(LX.settings.keys || {})[LX.settings.provider]) { LX.settings.provider = 'fal'; LX.settings.model = ''; saveSettings(); }
    ed = LX.editor.create($('#canvas'), {
      preview: (n) => LX.render.preview(n),
      onSelect: (node) => {
        if (node) currentTab = node.out ? 'result' : 'params';
        renderInspector();
        if (node && window.innerWidth < 760) document.body.classList.add('show-insp');
      },
      onChange: () => { autosave(); if (!ed.selected) renderInspector(); },
      onRunNode: (id) => runNode(id),
      onDice: (id) => drawTopic(id),
      onConnect: (toId) => { if (ed.selected && ed.selected.id === toId) renderInspector(); },
      onStatus: (id) => { if (ed.selected && ed.selected.id === id && (ed.status[id] || {}).state !== 'running') renderInspector(); },
    });
    LX.ed = ed;
    renderPalette();
    renderEngineToggle();
    bindToolbar();
    renderLog();
    $('#mode-badge').textContent = window.LEXINODE_DEMO ? 'démo' : LX.api.server ? 'serveur local' : 'autonome';
    $('#mode-badge').title = LX.api.server ? 'Connecté au serveur Node : clés .env, recherche, sauvegarde dans projects/' : 'Sans serveur : moteur local, appels IA directs depuis le navigateur';
    $('#lex-count').textContent = `${LX.lex.all.length - 1} lexiques`;
    const saved = U.store.get('autosave', null);
    if (saved && saved.nodes && saved.nodes.length) loadGraph(saved);
    else {
      let example = null;
      try {
        if (window.LEXINODE_EXAMPLES) example = window.LEXINODE_EXAMPLES[0];
        else if (LX.api.server) {
          const j = await (await fetch('api/projects')).json();
          const first = j.examples.find((x) => /pantoufle/i.test(x.title)) || j.examples[0];
          if (first) example = await (await fetch('api/projects/' + encodeURIComponent(first.file) + '?example=1')).json();
        }
      } catch (e) { /* ignore */ }
      if (example) loadGraph(example);
      else loadGraph({ version: 1, meta: { title: 'Nouveau projet' }, nodes: [{ id: U.uid('n'), type: 'sujet', x: 80, y: 120, data: {} }], links: [] });
    }
    document.body.classList.add('ready');
  }

  LX.app = { init, runAll, runNode, openAnimatic, openSettings, openLexicons, serialize, loadGraph, toast };
  document.addEventListener('DOMContentLoaded', init);
})(window.LX = window.LX || {});
