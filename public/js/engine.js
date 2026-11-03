/*
 * LEXINODE — exécution du graphe.
 * Tri topologique, exécution en parallèle des branches indépendantes (« armée d'agents »),
 * cache par signature (seuls les nodes modifiés et leur aval sont recalculés), routage local / IA par node.
 */
(function (LX) {
  'use strict';
  const U = LX.U;
  const N = LX.nodes;
  const LOCAL_ONLY = ['sujet', 'brief', 'note', 'evenement', 'lexique', 'mixeur', 'style', 'hasard'];

  function engineFor(node) {
    if (LOCAL_ONLY.includes(node.type) || window.LEXINODE_DEMO) return 'local';
    const e = node.data.engine && node.data.engine !== 'global' ? node.data.engine : LX.settings.engine;
    return e === 'ia' ? 'ia' : 'local';
  }

  function gatherInputs(ed, node) {
    const def = N.DEFS[node.type];
    const inputs = {};
    for (const p of def.inputs) inputs[p.key] = [];
    const links = ed.inputsOf(node.id).slice().sort((a, b) => (ed.node(a.from) || {}).y - (ed.node(b.from) || {}).y);
    for (const l of links) {
      const src = ed.node(l.from);
      if (!src || !inputs[l.toPort]) continue;
      // nodes à plusieurs sorties (ex. Topic aléatoire) : chaque port porte sa propre valeur
      const out = src.out && src.out._ports ? src.out._ports[l.fromPort] : src.out;
      inputs[l.toPort].push({ type: ed.outputType(src, l.fromPort), nodeId: src.id, nodeType: src.type, out });
    }
    return inputs;
  }

  function signature(ed, node) {
    const ups = ed.inputsOf(node.id).map((l) => l.toPort + ':' + ((ed.node(l.from) || {})._sig || 'x')).sort().join('|');
    const lexSig = node.type === 'lexique' ? (LX.lex.get(node.data.lexique) || {}).id : '';
    return String(U.hash(node.type + JSON.stringify(node.data) + ups + engineFor(node) + lexSig + (LX.settings.engine === 'ia' ? JSON.stringify(LX.ai.routeFor(LX.ai.ROLE_OF[node.type] || 'redacteur')) : '')));
  }

  /**
   * Exécute le graphe (ou un node et son amont).
   * opts : { only: nodeId, force: bool, log: fn, onNodeDone: fn }
   */
  async function run(ed, opts) {
    opts = opts || {};
    const g = ed.graph;
    let ids = g.nodes.map((n) => n.id);
    if (opts.only) {
      const set = new Set([opts.only]);
      const up = (id) => { for (const l of ed.inputsOf(id)) if (!set.has(l.from)) { set.add(l.from); up(l.from); } };
      up(opts.only);
      ids = Array.from(set);
    }
    const target = new Set(ids);
    const deps = {};
    for (const id of ids) deps[id] = ed.inputsOf(id).map((l) => l.from).filter((x) => target.has(x));
    const done = new Set(), failed = new Set(), running = new Set();
    const limit = Math.max(1, Number(LX.settings.concurrency) || 3);
    const stats = { computed: 0, cached: 0, errors: 0, t0: performance.now() };
    // un node en aval d'une panne cite le node d'origine, pas seulement son voisin
    const cause = {};
    const titleOf = (id) => { const n = ed.node(id); return n ? (n.data && n.data._label) || (N.DEFS[n.type] || {}).title || id : id; };
    const failFrom = (id, bad) => {
      failed.add(id);
      cause[id] = cause[bad] || bad;
      ed.setStatus(id, 'error', 'Un node en amont est en erreur : « ' + titleOf(cause[id]) + ' »');
    };

    return new Promise((resolve) => {
      const pump = () => {
        if (done.size + failed.size === ids.length) {
          stats.ms = Math.round(performance.now() - stats.t0);
          return resolve(stats);
        }
        for (const id of ids) {
          if (done.has(id) || failed.has(id) || running.has(id)) continue;
          if (deps[id].some((d) => failed.has(d))) {
            failFrom(id, deps[id].find((d) => failed.has(d)));
            continue;
          }
          if (!deps[id].every((d) => done.has(d))) continue;
          const node = ed.node(id);
          const iaNode = engineFor(node) === 'ia';
          const iaRunning = Array.from(running).filter((x) => engineFor(ed.node(x)) === 'ia').length;
          if (iaNode && iaRunning >= limit) continue;
          running.add(id);
          execNode(ed, node, opts, stats).then((ok) => {
            running.delete(id);
            (ok ? done : failed).add(id);
            if (opts.onNodeDone) opts.onNodeDone(node, ok);
            pump();
          });
        }
        // une panne se propage : un node examiné avant son amont en erreur doit dire « amont en erreur », pas « Bloqué »
        let changed = false;
        for (let again = true; again;) {
          again = false;
          for (const id of ids) {
            if (done.has(id) || failed.has(id) || running.has(id)) continue;
            const bad = deps[id].find((d) => failed.has(d));
            if (bad) { failFrom(id, bad); again = true; changed = true; }
          }
        }
        if (changed) { pump(); return; }
        if (!running.size && done.size + failed.size < ids.length) {
          // sécurité : rien ne peut plus avancer
          for (const id of ids) if (!done.has(id) && !failed.has(id)) { failed.add(id); ed.setStatus(id, 'error', 'Bloqué'); }
          pump();
        }
      };
      pump();
    });
  }

  async function execNode(ed, node, opts, stats) {
    const sig = signature(ed, node);
    const st0 = (ed.status[node.id] || {}).state;
    if (!opts.force && node.out && node._sig === sig && st0 !== 'error' && st0 !== 'stale') {
      stats.cached++;
      ed.setStatus(node.id, 'done', 'à jour');
      return true;
    }
    const mode = engineFor(node);
    ed.setStatus(node.id, 'running', mode === 'ia' ? 'agent IA au travail…' : 'calcul local…');
    ed.drawLinks();
    let inputs = gatherInputs(ed, node);
    const def = N.DEFS[node.type];
    const ctx = { nodeTitle: node.data._label || def.title, log: opts.log };
    try {
      let out;
      // voix off en anglais : une traduction par le LLM, quel que soit le moteur du node (le reste du calcul ne change pas)
      const voiceIn = (inputs.voice || []).some((x) => x.out);
      const wantsEn = node.type === 'voice' ? node.data.langue === 'en' : (node.type === 'generateur' || node.type === 'qbuilder') && node.data.voix === 'native_en' && !voiceIn;
      if (wantsEn && !window.LEXINODE_DEMO) inputs = await LX.ai.translateVO(inputs, ctx);
      if (mode === 'ia' && LX.ai.compute[node.type]) out = await LX.ai.compute[node.type](node, inputs, ctx);
      else {
        out = await LX.local[node.type](node, inputs, ctx);
        // en local, une donnée « à rechercher » reçoit au moins des pistes (recherche web sans LLM)
        if (node.type === 'donnee' && node.data.mode === 'recherche' && out.statut === 'inconnu' && !window.LEXINODE_DEMO) {
          try {
            const res = await LX.ai.search(node.data.question || node.data.libelle, ctx);
            out.pistes = res.results || [];
            out.note = 'Pistes trouvées par la recherche web : choisissez une valeur, ou passez en moteur IA pour l’extraction automatique.';
          } catch (e) { out.note += ' (Recherche web indisponible : ' + e.message + ')'; }
        }
      }
      out._engine = mode;
      out._at = new Date().toISOString();
      node.out = out;
      node._sig = signature(ed, node);
      stats.computed++;
      ed.setStatus(node.id, 'done', mode === 'ia' ? 'calculé par IA' : 'calculé localement');
      ed.drawLinks();
      return true;
    } catch (e) {
      console.error(node.type, e);
      stats.errors++;
      ed.setStatus(node.id, 'error', e.message);
      ed.drawLinks();
      return false;
    }
  }

  LX.engine = { run, engineFor, gatherInputs, LOCAL_ONLY };
})(window.LX = window.LX || {});
