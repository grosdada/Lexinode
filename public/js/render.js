/* LEXINODE — rendu des résultats (inspecteur), aperçus sur les nodes, export Markdown */
(function (LX) {
  'use strict';
  const U = LX.U;
  const h = U.h;

  // Texte avec termes marqués [[terme|lexid]] → HTML surligné à la couleur du lexique
  function richText(text) {
    const esc = U.esc(String(text || ''));
    return esc
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (m, t, id) => {
        const lx = LX.lex.get(id);
        const v = lx && lx.vocabulaire.find((x) => x.terme.toLowerCase() === t.toLowerCase());
        return `<mark class="term" style="--c:${lx ? lx.couleur : '#999'}" title="${U.esc(lx ? lx.nom : id)}${v ? ' — ' + U.esc(v.sens) : ''}">${t}</mark>`;
      })
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .split(/\n{2,}/).map((p) => '<p>' + p.replace(/\n/g, '<br>') + '</p>').join('');
  }
  const para = (text, cls) => h('div', { class: 'rich ' + (cls || ''), html: richText(text) });
  const ico = (name, color) => LX.icon.el(name, color);
  const lexChip = (id) => {
    const lx = LX.lex.get(id);
    return h('span', { class: 'chip', style: { '--c': lx.couleur } }, LX.icon.lex(lx), ' ', lx.nom);
  };
  const STATUT = { sourcé: ['ok', 'sourcé'], saisi: ['warn', 'saisi sans source'], estimé: ['est', 'estimation'], fictif: ['fic', 'fictif'], inconnu: ['err', 'inconnu'] };
  const statutBadge = (s) => { const x = STATUT[s] || ['', s || '—']; return h('span', { class: 'badge dot ' + x[0] }, x[1]); };
  const sourcesList = (sources) => (sources && sources.length ? h('div', { class: 'sources' }, h('div', { class: 'k' }, 'Sources'),
    h('ol', {}, sources.map((s) => h('li', {}, s.url ? h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.title || s.url) : s.title)))) : null);

  function sparkline(serie, color) {
    if (!serie || serie.length < 2) return null;
    const W = 260, H = 60;
    const ys = serie.map((p) => p.y);
    const mn = Math.min(...ys), mx = Math.max(...ys);
    const pts = serie.map((p, i) => `${(i * (W - 8)) / (serie.length - 1) + 4},${H - 6 - ((p.y - mn) / (mx - mn || 1)) * (H - 12)}`).join(' ');
    const el = h('div', { class: 'spark', html: `<svg viewBox="0 0 ${W} ${H}"><polyline points="${pts}" fill="none" stroke="${color || 'var(--accent)'}" stroke-width="2"/></svg><div class="spark-x"><span>${U.esc(serie[0].x)}</span><span>${U.esc(serie[serie.length - 1].x)}</span></div>` });
    return el;
  }

  function copyBtn(label, getText) {
    const b = h('button', { class: 'btn sm' }, label);
    b.addEventListener('click', async () => {
      const ok = await U.copy(typeof getText === 'function' ? getText() : getText);
      const t = b.textContent;
      b.textContent = ok ? '✓ copié' : 'copie impossible';
      setTimeout(() => (b.textContent = t), 1200);
    });
    return b;
  }

  // ------------------------------------------------------------------ rendu par type
  const R = {};
  R.sujet = (o) => h('div', {}, h('h3', {}, o.titre), o.angle ? para(o.angle) : null, o.motscles.length ? h('div', { class: 'chips' }, o.motscles.map((m) => h('span', { class: 'chip' }, m))) : null);
  R.brief = (o) => h('dl', { class: 'kv' }, ['public', 'objectif', 'ton', 'mode', 'contraintes'].flatMap((k) => (o[k] ? [h('dt', {}, k), h('dd', {}, o[k])] : [])));
  R.note = (o) => h('div', {}, h('h3', {}, o.titre), para(o.texte), o.source ? h('div', { class: 'muted' }, 'Source : ' + o.source) : null);
  R.evenement = (o) => h('div', { class: 'timeline' }, (o.chronologie || [o]).map((e) => h('div', { class: 'tl-item' + (e.id === o.id ? ' me' : '') },
    h('div', { class: 'tl-date' }, e.date || '—'), h('div', {}, h('b', {}, e.titre), h('span', { class: 'muted' }, ` · ${e.type || ''}${e.lieu ? ' · ' + e.lieu : ''}`), e.description ? h('div', { class: 'small' }, e.description) : null))));
  R.donnee = (o) => h('div', {},
    h('div', { class: 'bignum' }, h('div', { class: 'v' }, LX.content.valueText(o) || '?'), h('div', { class: 'l' }, o.libelle), statutBadge(o.statut)),
    o.periode || o.lieu ? h('div', { class: 'muted' }, [o.periode, o.lieu].filter(Boolean).join(' · ')) : null,
    sparkline(o.serie),
    o.serie && o.serie.length ? h('details', {}, h('summary', {}, `Série (${o.serie.length} points)`), h('table', { class: 'tbl' }, o.serie.map((p) => h('tr', {}, h('td', {}, p.x), h('td', { class: 'num' }, U.fmt(p.y)))))) : null,
    o.hypotheses && o.hypotheses.length ? h('div', {}, h('div', { class: 'k' }, 'Hypothèses'), h('ul', {}, o.hypotheses.map((x) => h('li', {}, x)))) : null,
    o.note ? h('div', { class: 'note' }, o.note) : null,
    sourcesList(o.sources),
    o.pistes && o.pistes.length ? h('div', { class: 'sources' }, h('div', { class: 'k' }, 'Pistes (recherche web)'), h('ol', {}, o.pistes.map((s) => h('li', {}, h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.title), h('div', { class: 'small muted' }, s.snippet))))) : null);
  R.lexique = (o) => {
    const wrap = h('div', {});
    const tot = Object.values(o.poids || {}).reduce((s, x) => s + x, 0) || 1;
    for (const id of o.ids || []) {
      const lx = LX.lex.get(id);
      const r = U.rng(id);
      wrap.append(h('div', { class: 'lexcard', style: { '--c': lx.couleur } },
        h('div', { class: 'lexhead' }, LX.icon.lex(lx), ' ', lx.nom, o.ids.length > 1 ? h('span', { class: 'muted' }, ' · ' + Math.round(((o.poids[id] || 1) / tot) * 100) + ' %') : null),
        h('div', { class: 'small' }, lx.posture || lx.description),
        h('div', { class: 'chips' }, r.sample(lx.vocabulaire, 10).map((v) => h('span', { class: 'chip', title: v.sens }, v.terme))),
        h('div', { class: 'small muted' }, r.sample(lx.formules, 2).map((f) => '« ' + f + ' »').join('  '))));
    }
    if (o.extras && o.extras.length) wrap.append(h('div', { class: 'small' }, 'Termes ajoutés : ' + o.extras.join(', ')));
    return wrap;
  };
  R.mixeur = R.lexique;
  R.comparaison = (o) => h('div', {},
    h('div', { class: 'k' }, 'Mode : ' + o.mode),
    o.visuel && (o.visuel.items || []).length ? h('div', { class: 'mini-anim', html: LX.animatic.sceneHTML({ visuel: o.visuel, titre: o.titre }, ['#FFB703', '#4FC3F7', '#FFB703', '#4FC3F7']) }) : null,
    h('ul', { class: 'constats' }, (o.constats || []).map((c) => h('li', {}, c))),
    para(o.resume),
    h('div', { class: 'conclusion' }, h('b', {}, 'Conclusion : '), U.sentence(U.stripMarks(o.conclusion))),
    o.angle ? h('div', { class: 'note' }, ico('bulbIdea'), ' ', o.angle) : null,
    o.mises_en_garde && o.mises_en_garde.length ? h('div', { class: 'warnings' }, h('div', { class: 'k' }, 'Mises en garde'), h('ul', {}, o.mises_en_garde.map((m) => h('li', {}, m)))) : null);
  const folie = (f) => h('span', { class: 'folie', title: 'folie ' + f + '/5' }, Array.from({ length: 5 }, (_, i) => h('i', { class: i < f ? 'on' : '' })));
  const topicCard = (t, label) => (t ? h('div', { class: 'topic-card' },
    h('div', { class: 'topic-meta' }, label ? h('span', { class: 'chip ghost' }, label) : null, h('span', { class: 'chip' }, t.categorieNom || t.categorie), folie(t.folie || 3), t.genere ? h('span', { class: 'muted small' }, 'généré') : null),
    h('div', { class: 'topic-t' }, U.cap(t.titre)),
    t.angle ? h('div', { class: 'topic-a' }, t.angle) : null,
    t.question ? h('div', { class: 'small muted' }, ico('bars'), ' ', t.question, t.unite ? ` (${t.unite})` : '') : null) : null);
  R.hasard = (o, opts) => h('div', {},
    topicCard(o.a, o.b ? 'A' : null), topicCard(o.b, 'B'),
    o.pourquoi ? h('div', { class: 'note' }, ico('link'), ' ', o.pourquoi) : null,
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn primary', onclick: () => opts && opts.onDice && opts.onDice() }, ico('die'), ' Relancer'),
      h('button', { class: 'btn', onclick: () => opts && opts.onSpawn && opts.onSpawn('donnees') }, ico('spawn'), o.b ? ' Créer les 2 Données' : ' Créer une Donnée'),
      o.b ? h('button', { class: 'btn', onclick: () => opts && opts.onSpawn && opts.onSpawn('correlation') }, ico('scatter'), ' Créer une Corrélation') : null),
    h('div', { class: 'small muted' }, `Banque : ${LX.topics.stats().sujets} sujets, ${LX.topics.stats().paires} paires, ${U.fmt(LX.topics.stats().combinaisons)} combinaisons générées · ${LX.topics.historySize()} déjà tirés`));
  const TYPE_CLS = { 'variable cachée': 'hid', 'chaîne causale': 'chain', 'causalité inverse': 'inv', 'effet de mesure': 'mes', 'coïncidence': 'coin' };
  R.correlation = (o, opts) => {
    const c = o.chiffres || {};
    return h('div', {},
      h('div', { class: 'k' }, o.mode === 'correlation' ? 'Corrélation mesurée' : 'Pistes de liens (hypothèses)'),
      c.correlation != null ? h('div', { class: 'corr-stats' },
        h('div', { class: 'cs' }, h('b', {}, U.fmt(c.correlation, 2)), h('span', {}, 'Pearson r')),
        h('div', { class: 'cs' }, h('b', {}, U.fmt(c.spearman, 2)), h('span', {}, 'Spearman ρ')),
        h('div', { class: 'cs' }, h('b', {}, U.fmtP(c.p).replace('p = ', '').replace('p < ', '<')), h('span', {}, 'p-valeur')),
        h('div', { class: 'cs' }, h('b', {}, c.rDiff != null ? U.fmt(c.rDiff, 2) : '—'), h('span', {}, 'sans tendance')),
        h('div', { class: 'cs' }, h('b', {}, String(c.n)), h('span', {}, 'périodes'))) : null,
      o.visuel ? h('div', { class: 'mini-anim', html: LX.animatic.sceneHTML({ visuel: o.visuel, titre: o.titre }, ['#FFB703', '#4FC3F7', '#FFB703', '#4FC3F7']) }) : null,
      o.constats && o.constats.length ? h('ul', { class: 'constats' }, o.constats.map((x) => h('li', {}, x))) : null,
      para(o.resume),
      h('div', { class: 'conclusion' }, h('b', {}, 'Conclusion : '), U.sentence(U.stripMarks(o.conclusion))),
      h('div', { class: 'k' }, 'Ce qui pourrait relier A et B'),
      (o.hypotheses || []).map((hh) => h('div', { class: 'hyp ' + (TYPE_CLS[hh.type] || '') },
        h('div', { class: 'hyp-h' }, h('b', {}, U.cap(hh.type)), hh.mecanisme && hh.mecanisme !== '—' ? h('span', { class: 'muted' }, ' · ' + hh.mecanisme) : null, h('span', { class: 'hyp-f' }, hh.force || '')),
        para(hh.texte), hh.test ? h('div', { class: 'small muted' }, ico('search'), ' ', hh.test) : null)),
      o.lectures && o.lectures.length ? h('div', {}, h('div', { class: 'k' }, 'Lectures par les grilles branchées'), o.lectures.map((l) => h('div', { class: 'tour', style: { '--c': LX.lex.get(l.lex).couleur } }, h('div', { class: 'who' }, LX.icon.lex(LX.lex.get(l.lex)), ' ', l.nom), para(l.texte)))) : null,
      o.mises_en_garde && o.mises_en_garde.length ? h('div', { class: 'warnings' }, h('div', { class: 'k' }, 'Mises en garde'), h('ul', {}, o.mises_en_garde.map((m) => h('li', {}, m)))) : null,
      (o.donnees_suggerees || []).some((x) => !x.deja) ? h('div', { class: 'row wrap' }, h('button', { class: 'btn', onclick: () => opts && opts.onSpawn && opts.onSpawn('donnees-correlation') }, ico('spawn'), ' Créer les nodes Donnée à rechercher')) : null,
      sourcesList(o.sources));
  };
  // Suivi des rendus de Workflows Q-Builder : machines, VRAM, jobs en cours. Se rafraîchit toutes les 10 s tant que le panneau est affiché.
  const qbSeen = {}; // job -> première fois vu en calcul (pour « depuis X »)
  function qbStatus(names) {
    const box = h('div', { class: 'qb-status' }, h('div', { class: 'small muted' }, 'Lecture de Q-Builder…'));
    const gb = (n) => (n / 1073741824).toFixed(1).replace('.', ',');
    const since = (key) => { const s = Math.round((Date.now() - (qbSeen[key] = qbSeen[key] || Date.now())) / 1000); return s < 90 ? s + ' s' : s < 5400 ? Math.round(s / 60) + ' min' : (s / 3600).toFixed(1).replace('.', ',') + ' h'; };
    const mine = (name) => !!name && names.some((n) => name.includes(n));
    // les films déjà rendus : dossier, derniers fichiers, ouverture du dossier ou lecture avec le lecteur du PC
    const filmsBlock = (f) => {
      if (!f || !f.dir) return;
      const when = (t) => new Date(t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      const mo = (n) => (n / 1048576).toFixed(1).replace('.', ',') + ' Mo';
      const open = async (file) => {
        try {
          const r = await LX.qbFetch('api/qbuilder/open-output', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(file ? { file } : {}) });
          const jj = await r.json();
          if (!r.ok) throw new Error(jj.error || 'Erreur');
        } catch (e) { LX.toast(e.message, 'warn'); }
      };
      box.append(h('div', { class: 'seg-card' },
        h('div', { class: 'seg-h' }, h('b', {}, 'Films'), h('span', { class: 'muted' }, ` · ${f.count} film(s)`), h('button', { class: 'btn sm', title: f.dir, onclick: () => open() }, 'Ouvrir le dossier')),
        h('div', { class: 'small muted' }, f.dir),
        f.count ? f.latest.map((x) => h('div', { class: 'small' }, h('b', {}, x.name), ` · ${mo(x.size)} · ${when(x.at)} `, h('button', { class: 'btn sm', onclick: () => open(x.name) }, ico('play'), ' Lire'))) : h('div', { class: 'small muted' }, 'Aucun film pour l’instant : chaque film arrive ici dès que son rendu est terminé.')));
    };
    const paint = (j) => {
      box.innerHTML = '';
      if (!j.ok) { box.append(h('div', { class: 'note' }, ico('alert'), ' ', j.error)); filmsBlock(j.films); return; }
      const on = j.nodes.filter((n) => n.online);
      const working = on.filter((n) => n.running);
      const waiting = on.reduce((s, n) => s + n.pending, 0);
      box.append(h('div', { class: 'row wrap' }, h('b', {}, `${working.length} machine(s) au travail`), h('span', { class: 'muted' }, ` · ${on.length - working.length} libre(s) · ${j.nodes.length - on.length} hors ligne · ${waiting} job(s) en attente · mis à jour à ${new Date(j.at).toLocaleTimeString('fr-FR')}`)));
      const idle = on.filter((n) => !n.running && !n.pending);
      const loaded = on.filter((n) => n.pending > 0);
      if (idle.length && loaded.length) box.append(h('div', { class: 'note' }, ico('alert'), ` ${idle.map((n) => n.name).join(', ')} ${idle.length > 1 ? 'sont libres' : 'est libre'} pendant que ${loaded.map((n) => n.name + ' (' + n.pending + ' en attente)').join(', ')} ${loaded.length > 1 ? 'ont' : 'a'} une file : à rééquilibrer dans Q-Builder.`));
      const freeOnes = on.filter((n) => !n.running && !n.pending);
      if (freeOnes.length) box.append(h('div', { class: 'row' }, h('button', { class: 'btn sm', title: 'Décharge les modèles de la mémoire des GPU des machines libres', onclick: () => LX.qbFreeMachines(freeOnes, refresh) }, ico('refresh'), ' Vider la VRAM des machines libres')));
      for (const n of j.nodes) {
        const used = n.vramTotal ? Math.round(((n.vramTotal - n.vramFree) / n.vramTotal) * 100) : 0;
        const low = n.online && n.vramFree < 10 * 1073741824;
        const st = !n.online ? ['err', 'hors ligne'] : n.running ? ['est', 'en calcul'] : n.pending ? ['est', 'file en attente'] : ['ok', 'libre'];
        box.append(h('div', { class: 'seg-card' },
          h('div', { class: 'seg-h' }, h('b', {}, n.name), h('span', { class: 'muted' }, n.gpu ? ' · ' + n.gpu : ''), h('span', { class: 'badge dot ' + st[0] }, st[1]), n.online && !n.running && !n.pending ? h('button', { class: 'btn sm', title: 'Décharge les modèles de la mémoire de cette machine', onclick: () => LX.qbFreeMachines([n], refresh) }, 'Vider la VRAM') : null),
          n.online ? h('div', {}, h('div', { class: 'vram' + (low ? ' low' : ''), title: `${used} % utilisés` }, h('i', { style: { width: used + '%' } })), h('div', { class: 'small muted' }, `VRAM : ${gb(n.vramFree)} Go libres sur ${gb(n.vramTotal)}`, low ? ' · ⚠ presque pleine : videz la mémoire avant de lancer un lot' : '')) : null,
          (n.jobs || []).map((jb) => {
            const key = n.name + ':' + jb.id;
            return h('div', { class: 'small' }, jb.state === 'running' ? '▶ ' : '⏳ ', h('b', {}, jb.name || jb.id.slice(0, 8)), jb.state === 'running' ? ` · en calcul depuis ${since(key)}` : ' · en attente', mine(jb.name) ? ' · de ce lot' : '');
          }),
          n.online && (n.running || n.pending) && !(n.jobs || []).length ? h('div', { class: 'small muted' }, `${n.running} en calcul, ${n.pending} en attente` + (n.jobsError ? ' (détail illisible : ' + n.jobsError + ')' : '')) : null));
      }
      filmsBlock(j.films);
    };
    let busy = false;
    const refresh = async () => {
      if (busy) return;
      busy = true;
      try {
        if (!LX.api.server) throw new Error('Le suivi passe par le serveur Lexinode : il fonctionne dans la version Windows, installée sur le même PC que Q-Builder.');
        if (LX.qbNeedsBridge && LX.qbNeedsBridge()) throw new Error('Pour suivre les rendus depuis le site en ligne, configurez le pont : Réglages → « Pont vers Q-Builder ».');
        const r = await (LX.qbFetch || fetch)('api/qbuilder/status');
        paint(await r.json());
      } catch (e) { paint({ ok: false, error: e.message }); }
      busy = false;
    };
    refresh();
    const timer = setInterval(() => { if (!box.isConnected) clearInterval(timer); else refresh(); }, 10000);
    return h('div', {}, box, h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: refresh }, ico('refresh'), ' Actualiser'), h('span', { class: 'small muted' }, 'Lecture seule : Lexinode ne lance, n’annule et ne déplace aucun job.')));
  }
  R.qbuilder = (o, opts) => h('div', { class: 'gen' },
    h('div', { class: 'chips' }, h('span', { class: 'chip' }, ico('cpu'), ' ' + o.moteurNom), h('span', { class: 'chip' }, ico('clock'), ` ${o.duree} s en ${o.nbPrompts} prompt(s)`), h('span', { class: 'chip' }, ico('frame'), ' ' + o.ratio)),
    (o.avertissements || []).map((w) => h('div', { class: 'note' }, ico('alert'), ' ', w)),
    h('div', { class: 'note' }, ico('info'), ' Dans Workflows Q-Builder : « Load prompts HTML », choisissez ', o.moteur === 'ltx25' ? 'LTX 2.5' : 'MiniMax H3 > T2V', ', vérifiez durée, format et taille, puis générez la commande. Ou lancez directement d’ici : le bouton orange exécute le script de Q-Builder, avec confirmation.'),
    h('details', {}, h('summary', {}, 'Règles de prompting appliquées (' + o.moteurNom + ')'), h('ul', { class: 'small' }, (o.regles || []).map((r) => h('li', {}, r)))),
    h('div', { class: 'row wrap' }, h('button', { class: 'btn primary', style: { background: '#FF8A00', borderColor: '#FF8A00', color: '#111' }, onclick: () => opts && opts.onRender && opts.onRender() }, ico('play'), ' Lancer le rendu sur les machines…'),
      h('span', { class: 'small muted' }, 'Demande une confirmation : essai d’un prompt, machines occupées exclues, VRAM vidée puis vérifiée.')),
    h('div', { class: 'row wrap' },
      o.lots.map((lot) => h('button', { class: 'btn primary', onclick: () => U.download(`qbuilder_${o.prefixe}_${o.moteur}${o.lots.length > 1 ? '_p' + lot.n : ''}.html`, LX.qbuilder.page(o, lot), 'text/html') }, ico('download'), ` Télécharger la page HTML${o.lots.length > 1 ? ' ' + lot.n + '/' + o.lots.length : ''} (${lot.items.length})`)),
      copyBtn('Copier tous les prompts', () => o.items.map((x) => `### ${x.name} (${x.seconds} s)\n${x.positive}`).join('\n\n')),
      h('a', { class: 'btn', href: 'http://127.0.0.1:8765/', target: '_blank', rel: 'noopener', title: 'Adresse habituelle de Q-Builder sur ce PC' }, ico('link'), ' Ouvrir Q-Builder')),
    h('details', { open: true }, h('summary', {}, 'Rendu sur les machines (Q-Builder)'), qbStatus(o.items.map((x) => x.name))),
    o.items.map((x) => h('div', { class: 'seg-card' },
      h('div', { class: 'seg-h' }, h('span', { class: 'num' }, x.n), h('b', {}, x.name), h('span', { class: 'muted' }, ` · ${x.seconds} s${x.frames ? ' · ' + x.frames + ' images' : ''} · ${x.chars} car.`)),
      h('div', { class: 'small muted' }, x.plans.map((p) => `${p.titre} (${p.duree} s)`).join(' → ')),
      h('div', { class: 'row wrap' }, copyBtn('Copier le prompt', x.positive)),
      h('details', {}, h('summary', {}, 'Prompt'), h('pre', { class: 'prompt' }, x.positive)))));
  const JOB = { submitting: ['', 'envoi…'], queued: ['est', 'en file d’attente'], running: ['est', 'génération en cours'], done: ['ok', 'vidéo prête'], error: ['err', 'échec'] };
  R.generateur = (o, opts, node) => {
    const jobs = (node && node.jobs) || {};
    const todo = o.segments.filter((s) => !(jobs[s.key] && ['done', 'queued', 'running', 'submitting'].includes(jobs[s.key].state)));
    return h('div', { class: 'gen' },
      h('div', { class: 'chips' }, h('span', { class: 'chip' }, ico('clapper'), ' ' + o.modeleNom), h('span', { class: 'chip' }, ico('clock'), ` ${o.duree} s en ${o.segments.length} segment(s)`), h('span', { class: 'chip' }, ico('frame'), ' ' + o.ratio + ' · ' + o.resolution), h('span', { class: 'chip' }, ico('mic'), o.voix === 'native' ? ' voix par le modèle' : ' voix au montage'), o.prixSeconde ? h('span', { class: 'chip' }, `≈ ${(o.duree * o.prixSeconde).toFixed(2)} $ (${o.prixSeconde} $/s)`) : null),
      (o.avertissements || []).map((w) => h('div', { class: 'note' }, ico('alert'), ' ', w)),
      h('details', {}, h('summary', {}, 'Règles de prompting appliquées (' + o.modeleNom + ')'), h('ul', { class: 'small' }, (o.regles || []).map((r) => h('li', {}, r)))),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn primary', disabled: !todo.length, onclick: () => opts && opts.onGenerate && opts.onGenerate(null) }, ico('sparkle'), todo.length ? ` Générer ${todo.length === o.segments.length ? 'tout' : 'le reste'} (${todo.length} × ~${Math.round(todo.reduce((s, x) => s + x.duree, 0) / todo.length)} s)` : ' Tout est lancé'),
        copyBtn('Copier tous les prompts', () => o.segments.map((s) => `### Segment ${s.n} (${s.debut}–${s.fin} s, ${s.duree} s)\n${s.prompt}`).join('\n\n'))),
      o.segments.map((s) => {
        const j = jobs[s.key];
        const st = j ? JOB[j.state] || ['', j.state] : null;
        return h('div', { class: 'seg-card' },
          h('div', { class: 'seg-h' }, h('span', { class: 'num' }, s.n), h('b', {}, `${s.debut}–${s.fin} s`), h('span', { class: 'muted' }, ` · ${s.duree} s · ${s.plans.length} plan(s) · ${s.chars} car.`), st ? h('span', { class: 'badge dot ' + st[0] }, st[1]) : null),
          h('div', { class: 'small muted' }, s.plans.map((p) => `${p.titre} (${p.duree} s)`).join(' → ')),
          j && j.state === 'done' && j.url ? h('div', { class: 'seg-video' }, h('video', { src: j.url, controls: true, playsinline: true, preload: 'metadata' }), h('a', { href: j.url, target: '_blank', rel: 'noopener', class: 'small' }, 'Ouvrir la vidéo')) : null,
          j && j.state === 'error' ? h('div', { class: 'error-box' }, ico('alert'), ' ', j.error || 'Échec') : null,
          h('div', { class: 'row wrap' },
            h('button', { class: 'btn sm' + (j ? '' : ' primary'), disabled: j && ['queued', 'running', 'submitting'].includes(j.state), onclick: () => opts && opts.onGenerate && opts.onGenerate(s.key) }, ico(j ? 'refresh' : 'sparkle'), j ? ' Relancer' : ' Générer ce segment'),
            copyBtn('Copier le prompt', s.prompt)),
          h('details', {}, h('summary', {}, 'Prompt envoyé'), h('pre', { class: 'prompt' }, s.prompt)));
      }));
  };
  R.voice = (o, opts, node) => {
    const jobs = (node && node.jobs) || {};
    const todo = o.items.filter((x) => !(jobs[x.key] && jobs[x.key].state === 'done'));
    const todoChars = todo.reduce((s, x) => s + x.chars, 0);
    return h('div', { class: 'gen' },
      h('div', { class: 'chips' }, h('span', { class: 'chip' }, ico('mic'), ' ElevenLabs · ' + o.modele), h('span', { class: 'chip' }, ico('clock'), ` ${o.items.length} scène(s) · ${o.chars} caractères`), h('span', { class: 'chip' }, ico('globe'), o.langue === 'en' ? ' anglais' : ' français'), o.voiceId ? h('span', { class: 'chip', title: o.voiceId }, ico('check'), ' voix ' + o.voiceId.slice(0, 6) + '…') : h('span', { class: 'chip' }, ico('alert'), ' voix à choisir')),
      (o.avertissements || []).map((w) => h('div', { class: 'note' }, ico('alert'), ' ', w)),
      h('div', { class: 'note' }, ico('info'), ' La clé ElevenLabs se colle dans Réglages. Les crédits ne sont dépensés que sur « Générer » ; une voix déjà générée avec les mêmes réglages n’est jamais refacturée. Branchez ce node sur l’entrée « voix » d’une sortie vidéo pour l’utiliser.'),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn', onclick: () => opts && opts.onPickVoice && opts.onPickVoice() }, ico('mic'), ' Mes voix (ElevenLabs)'),
        h('button', { class: 'btn primary', disabled: !todo.length || !o.voiceId, onclick: () => opts && opts.onGenerateVoice && opts.onGenerateVoice(null) }, ico('sparkle'), todo.length ? ` Générer la voix off (${todo.length} scène(s), ${todoChars} caractères)` : ' Voix off prête')),
      o.items.map((x) => {
        const j = jobs[x.key];
        const st = j ? JOB[j.state] || ['', j.state] : null;
        return h('div', { class: 'seg-card' },
          h('div', { class: 'seg-h' }, h('span', { class: 'num' }, x.n), h('b', {}, x.titre), h('span', { class: 'muted' }, ` · ${x.duree} s de scène · ${x.chars} car.`), st ? h('span', { class: 'badge dot ' + st[0] }, st[1]) : null),
          h('div', { class: 'small muted' }, x.texte),
          j && j.state === 'done' && j.url ? h('div', { class: 'seg-video' }, h('audio', { src: j.url, controls: true, preload: 'none' }), h('a', { href: j.url, download: `voix_${String(x.n).padStart(2, '0')}.mp3`, class: 'small' }, 'Télécharger le MP3' + (j.cached ? ' (déjà généré, aucun crédit dépensé)' : ''))) : null,
          j && j.state === 'error' ? h('div', { class: 'error-box' }, ico('alert'), ' ', j.error || 'Échec') : null,
          h('div', { class: 'row wrap' }, h('button', { class: 'btn sm' + (j && j.state === 'done' ? '' : ' primary'), disabled: !o.voiceId || (j && j.state === 'running'), onclick: () => opts && opts.onGenerateVoice && opts.onGenerateVoice(x.key) }, ico(j && j.state === 'done' ? 'refresh' : 'sparkle'), j && j.state === 'done' ? ' Régénérer' : ' Générer'), copyBtn('Copier le texte', x.texte)));
      }));
  };
  R.reflexion = (o) => {
    const conf = o.confiance || {};
    return h('div', {},
      h('div', { class: 'chips' }, (o.lexiques || []).map(lexChip), h('span', { class: 'chip ghost' }, ico('layers'), ' ', o.structure), conf.niveau ? h('span', { class: 'badge conf-' + U.slug(conf.niveau), title: conf.note }, 'fiabilité : ' + conf.niveau) : null),
      h('div', { class: 'these', html: richText(o.these) }),
      (o.etapes || []).map((e, i) => h('div', { class: 'etape', style: { '--c': LX.lex.get(e.lex).couleur } },
        h('div', { class: 'etape-h' }, h('span', { class: 'num' }, i + 1), h('b', {}, e.titre), h('span', { class: 'role' }, e.role)),
        para(e.texte))),
      h('div', { class: 'conclusion', html: '<b>Conclusion</b> ' + richText(o.conclusion) }),
      o.contre_arguments && o.contre_arguments.length ? h('details', {}, h('summary', {}, 'Contre-arguments / limites'), h('ul', {}, o.contre_arguments.map((c) => h('li', {}, c)))) : null,
      o.termes && o.termes.length ? h('details', {}, h('summary', {}, `Éléments de langage mobilisés (${o.termes.length})`), h('div', { class: 'chips' }, o.termes.map((t) => h('span', { class: 'chip', style: { '--c': LX.lex.get(t.lex).couleur } }, t.terme)))) : null,
      conf.note ? h('div', { class: 'note' }, conf.note) : null,
      sourcesList(o.sources));
  };
  R.texte = (o) => {
    if (o.tours) {
      return h('div', {}, h('h3', {}, o.titre),
        o.tours.map((t) => h('div', { class: 'tour', style: { '--c': t.couleur } }, h('div', { class: 'who' }, LX.lex.byId[t.voix] ? LX.icon.lex(LX.lex.byId[t.voix]) : ico('mic'), ' ', t.nom), para(t.texte))),
        o.synthese ? h('div', { class: 'conclusion' }, h('b', {}, 'Synthèse : '), o.synthese) : null);
    }
    if (o.scores) {
      const s = o.scores;
      return h('div', {},
        h('div', { class: 'gauges' },
          gauge('Indice langue de bois', s.indice, 100, s.verdict),
          gauge('Densité de jargon', s.jargon, 30, s.jargon + ' % des mots'),
          gauge('Lisibilité', s.lisibilite == null ? 0 : s.lisibilite, 100, s.lisibilite == null ? '—' : s.lisibilite >= 60 ? 'facile' : s.lisibilite >= 40 ? 'moyenne' : 'difficile', true)),
        s.signature && s.signature.length ? h('div', { class: 'small' }, 'Signature : ' + s.signature.join(', ')) : null,
        h('div', { class: 'k' }, 'En clair'), para(o.texte),
        o.detections.length ? h('details', { open: true }, h('summary', {}, `Détections (${o.detections.length})`),
          h('table', { class: 'tbl' }, h('tr', {}, h('th', {}, 'Trouvé'), h('th', {}, 'En clair'), h('th', {}, 'Type')),
            o.detections.map((d) => h('tr', {}, h('td', {}, d.trouve), h('td', {}, d.clair), h('td', { class: 'muted' }, d.type + (d.lex && d.lex !== 'neutre' ? ' · ' + LX.lex.get(d.lex).nom : '')))))) : null);
    }
    return h('div', {}, h('h3', {}, o.titre), o.satire ? h('div', { class: 'badge dot fic' }, 'satire') : null, para(o.texte),
      o.lexiques ? h('div', { class: 'chips' }, o.lexiques.map(lexChip)) : null);
  };
  function gauge(label, value, max, caption, inverse) {
    const pct = Math.max(0, Math.min(100, (value / max) * 100));
    const col = inverse ? (pct > 60 ? '#66BB6A' : pct > 40 ? '#FFCA28' : '#EF5350') : (pct < 25 ? '#66BB6A' : pct < 55 ? '#FFCA28' : '#EF5350');
    return h('div', { class: 'gauge' }, h('div', { class: 'gl' }, label), h('div', { class: 'gbar' }, h('i', { style: { width: pct + '%', background: col } })), h('div', { class: 'gv' }, String(value), ' ', h('span', { class: 'muted' }, caption)));
  }
  R.style = (o) => h('div', {}, h('h3', {}, o.nom), h('div', { class: 'swatches' }, (o.palette || []).map((c) => h('span', { style: { background: c }, title: c }))),
    h('div', { class: 'small' }, o.typo), h('pre', { class: 'prompt' }, o.prompt_en + (o.motion_en ? ', ' + o.motion_en : '')));
  R.script = (o, opts) => {
    const wrap = h('div', { class: 'script' });
    const head = h('div', { class: 'script-head' },
      h('h3', {}, o.titre), h('div', { class: 'muted' }, o.logline),
      h('div', { class: 'chips' }, h('span', { class: 'chip' }, ico('clock'), ` ${o.duree} s`), h('span', { class: 'chip' }, ico('frame'), ` ${o.format}`), h('span', { class: 'chip' }, ico('palette'), ' ' + o.styleNom), h('span', { class: 'chip' }, ico('crosshair'), ' ' + o.cible), o.mention ? h('span', { class: 'badge dot est' }, o.mention) : null),
      h('div', { class: 'swatches' }, (o.palette || []).map((c) => h('span', { style: { background: c }, title: c }))),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: () => opts && opts.onAnimatic && opts.onAnimatic(o) }, ico('play'), ' Animatique'),
        copyBtn('Copier le storyboard', o.markdown),
        copyBtn('Copier tous les prompts vidéo', () => o.scenes.map((s) => `# Scène ${s.n} (${s.debut}-${s.fin}s)\n${s.prompts.video}`).join('\n\n')),
        h('button', { class: 'btn sm', onclick: () => U.download(U.slug(o.titre) + '-storyboard.md', o.markdown, 'text/markdown') }, ico('download'), ' .md'),
        h('button', { class: 'btn sm', onclick: () => U.download(U.slug(o.titre) + '-storyboard.json', JSON.stringify(o, null, 2)) }, ico('download'), ' .json')));
    wrap.append(head, h('details', {}, h('summary', {}, 'Bible visuelle'), h('pre', { class: 'prompt' }, o.bible.style_prompt), h('ul', {}, (o.bible.regles || []).map((r) => h('li', {}, r))), h('div', { class: 'small' }, ico('music'), ' ' + o.bible.musique + ' · ', ico('mic'), ' ' + o.bible.voix)));
    for (const s of o.scenes) {
      wrap.append(h('div', { class: 'scene-card' },
        h('div', { class: 'scene-h' }, h('span', { class: 'num' }, s.n), h('b', {}, s.titre), h('span', { class: 'muted' }, ` ${s.debut}–${s.fin} s · ${s.visuel.type}`)),
        h('div', { class: 'scene-grid' },
          h('div', { class: 'thumb', html: LX.animatic.sceneHTML(s, (o.palette || []).slice(1).concat((o.palette || []).slice(0, 1))), style: { background: (o.palette || ['#222'])[0] } }),
          h('div', {}, h('div', { class: 'vo' }, ico('mic'), ' ', U.stripMarks(s.vo)), h('div', { class: 'small' }, ico('monitor'), ' ', h('b', {}, s.texte_ecran)), h('div', { class: 'small muted' }, (s.elements_graphiques || []).join(' · ')), h('div', { class: 'small muted' }, ico('camera'), ` ${s.camera} · `, ico('arrow'), ` ${s.transition}`))),
        h('details', {}, h('summary', {}, 'Prompts'),
          h('div', { class: 'k' }, 'Image (keyframe) ', copyBtn('copier', s.prompts.image)), h('pre', { class: 'prompt' }, s.prompts.image),
          h('div', { class: 'k' }, 'Vidéo ', copyBtn('copier', s.prompts.video)), h('pre', { class: 'prompt' }, s.prompts.video))));
    }
    return wrap;
  };

  function output(node, opts) {
    const o = node.out;
    if (!o) return h('div', { class: 'empty' }, 'Pas encore de résultat : cliquez sur Exécuter.');
    const def = LX.nodes.DEFS[node.type];
    const type = def.outputs[0].type;
    const fn = R[node.type] || R[type] || R.texte;
    const box = h('div', { class: 'output' });
    box.append(h('div', { class: 'out-meta' }, o._engine === 'ia' ? ico('sparkle') : ico('cpu'), o._engine === 'ia' ? ' IA' + (o.agent ? ' · ' + o.agent : '') : ' moteur local', o._at ? ' · ' + new Date(o._at).toLocaleTimeString('fr-FR') : '',
      ' ', copyBtn('Copier (Markdown)', () => toMarkdown(node))));
    try { box.append(fn(o, opts, node)); } catch (e) { console.error(e); box.append(h('pre', {}, JSON.stringify(o, null, 2))); }
    return box;
  }

  // ------------------------------------------------------------------ aperçu (sur le node)
  function preview(node) {
    const o = node.out;
    if (!o) return '';
    const s = (x) => U.truncateWords(U.stripMarks(x || ''), 18);
    switch (node.type) {
      case 'comparaison': return s(U.cap(o.conclusion));
      case 'reflexion': return s(o.these);
      case 'short': return `${o.scenes.length} scènes · « ${s(o.titre)} »`;
      case 'voice': return `${o.items.length} voix · ${o.chars} car.`;
      case 'qbuilder': return `${o.nbPrompts} prompt(s) · ${o.moteurNom}`;
      case 'generateur': { const jb = node.jobs || {}; const done = o.segments.filter((x) => jb[x.key] && jb[x.key].state === 'done').length; return `${o.segments.length} segment(s) · ${done} vidéo(s) prête(s)`; }
      case 'decodeur': return `${o.scores.verdict} (${o.scores.indice}/100)`;
      case 'debat': return `${o.tours.length} prises de parole`;
      case 'prisme': case 'agent': return s(o.texte);
      case 'donnee': return o.statut === 'inconnu' ? 'valeur inconnue' : '';
      case 'correlation': return s(U.cap(o.conclusion));
      case 'hasard': return o.b ? '' : s(o.a && o.a.angle);
      default: return '';
    }
  }

  // ------------------------------------------------------------------ export Markdown
  function toMarkdown(node) {
    const o = node.out;
    if (!o) return '';
    const def = LX.nodes.DEFS[node.type];
    const strip = U.stripMarks;
    const L = [`## ${node.data._label || def.title}`];
    switch (node.type) {
      case 'sujet': L.push(`**${o.titre}**`, o.angle || ''); break;
      case 'hasard': L.push(`**${o.a.titre}**`, o.a.angle || '', ...(o.b ? ['', `**${o.b.titre}**`, o.b.angle || ''] : []), o.pourquoi ? `\n_${o.pourquoi}_` : ''); break;
      case 'correlation':
        L.push(...(o.constats || []).map((c) => '- ' + c), '', o.resume, '', `**Conclusion** : ${U.sentence(o.conclusion)}`, '', '### Pistes de liens');
        for (const hh of o.hypotheses || []) L.push(`- **${hh.type}** (${hh.mecanisme}) : ${U.stripMarks(hh.texte)} _Test : ${hh.test}_`);
        L.push('', ...(o.mises_en_garde || []).map((m) => '> ' + m));
        break;
      case 'evenement': for (const e of o.chronologie) L.push(`- ${e.date || '—'} — **${e.titre}**${e.description ? ' : ' + e.description : ''}`); break;
      case 'donnee': L.push(`**${o.libelle}** : ${LX.content.valueText(o) || '?'} (${o.statut})`, o.periode || '', ...(o.sources || []).map((s) => `- ${s.title} ${s.url || ''}`)); break;
      case 'lexique': case 'mixeur': L.push((o.ids || []).map((id) => LX.lex.get(id).nom).join(' + ')); break;
      case 'comparaison': L.push(...(o.constats || []).map((c) => '- ' + c), '', o.resume, '', `**Conclusion** : ${U.sentence(o.conclusion)}`, '', ...(o.mises_en_garde || []).map((m) => '> ' + m)); break;
      case 'reflexion':
        L.push(`*${o.structure}* — langages : ${(o.lexiques || []).map((id) => LX.lex.get(id).nom).join(', ')}`, '', `**Thèse** : ${strip(o.these)}`, '');
        for (const e of o.etapes) L.push(`### ${e.titre}`, strip(e.texte), '');
        L.push(`**Conclusion** : ${strip(o.conclusion)}`, '', ...(o.contre_arguments || []).map((c) => '- ' + c));
        if (o.confiance) L.push('', `_Fiabilité : ${o.confiance.niveau} — ${o.confiance.note}_`);
        break;
      case 'short': L.push(o.markdown); break;
      case 'voice': L.push(`ElevenLabs · ${o.modele} · ${o.chars} caractères`, ...o.items.map((x) => `\n### ${x.titre}\n\n${x.texte}`)); break;
      case 'qbuilder': L.push(`${o.moteurNom} · ${o.duree} s · ${o.ratio} · ${o.nbPrompts} prompt(s)`, ...o.items.map((x) => `\n### ${x.name} (${x.seconds} s)\n\n${x.positive}`)); break;
      case 'generateur': L.push(`${o.modeleNom} · ${o.duree} s · ${o.ratio}`, ...o.segments.map((sg) => `\n### Segment ${sg.n} (${sg.debut}–${sg.fin} s)\n\n\`\`\`\n${sg.prompt}\n\`\`\``)); break;
      case 'style': L.push(o.nom, '```', o.prompt_en, '```'); break;
      case 'decodeur': L.push(`Indice langue de bois : ${o.scores.indice}/100 (${o.scores.verdict})`, '', strip(o.texte)); break;
      default: L.push(`**${o.titre || ''}**`, '', strip(o.texte || ''));
    }
    return L.join('\n');
  }

  function dossier(ed) {
    const g = ed.graph;
    const order = g.nodes.slice().sort((a, b) => a.x - b.x || a.y - b.y).filter((n) => n.out);
    return [`# ${g.meta.title}`, `_Dossier exporté de Lexinode le ${new Date().toLocaleString('fr-FR')}_`, ''].concat(order.map(toMarkdown)).join('\n\n');
  }

  LX.render = { output, preview, toMarkdown, dossier, richText, lexChip };
})(window.LX = window.LX || {});
