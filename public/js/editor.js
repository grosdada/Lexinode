/* LEXINODE — éditeur nodal (canvas pan/zoom, nodes déplaçables, ports typés, fils de Bézier) */
(function (LX) {
  'use strict';
  const U = LX.U;
  const N = LX.nodes;

  function create(container, opts) {
    opts = opts || {};
    const ed = {
      graph: { version: 1, meta: { title: 'Sans titre' }, nodes: [], links: [] },
      view: { x: 60, y: 40, k: 0.9 },
      selected: null, // {kind:'node'|'link', id}
      status: {}, // id → {state, msg}
      undoStack: [], redoStack: [],
    };

    const world = U.h('div', { class: 'world' });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'wires');
    const gLinks = document.createElementNS(svg.namespaceURI, 'g');
    const dragPath = document.createElementNS(svg.namespaceURI, 'path');
    dragPath.setAttribute('class', 'wire dragging');
    svg.append(gLinks, dragPath);
    world.append(svg);
    container.append(world);
    const menu = U.h('div', { class: 'quickadd hidden' });
    container.append(menu);
    const nodeEls = {};

    // ------------------------------------------------------------------ vue
    function applyView() {
      world.style.transform = `translate(${ed.view.x}px, ${ed.view.y}px) scale(${ed.view.k})`;
      container.style.backgroundPosition = `${ed.view.x}px ${ed.view.y}px`;
      container.style.backgroundSize = `${24 * ed.view.k}px ${24 * ed.view.k}px`;
      if (opts.onView) opts.onView(ed.view);
    }
    function toWorld(clientX, clientY) {
      const r = container.getBoundingClientRect();
      return { x: (clientX - r.left - ed.view.x) / ed.view.k, y: (clientY - r.top - ed.view.y) / ed.view.k };
    }
    ed.zoom = (factor, cx, cy) => {
      const r = container.getBoundingClientRect();
      if (cx == null) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
      const before = toWorld(cx, cy);
      ed.view.k = Math.min(1.8, Math.max(0.25, ed.view.k * factor));
      ed.view.x = cx - r.left - before.x * ed.view.k;
      ed.view.y = cy - r.top - before.y * ed.view.k;
      applyView();
    };
    ed.fit = () => {
      const ns = ed.graph.nodes;
      if (!ns.length) { ed.view = { x: 60, y: 40, k: 0.9 }; return applyView(); }
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      for (const n of ns) {
        const el = nodeEls[n.id];
        const w = el ? el.offsetWidth : 240, h = el ? el.offsetHeight : 120;
        x1 = Math.min(x1, n.x); y1 = Math.min(y1, n.y); x2 = Math.max(x2, n.x + w); y2 = Math.max(y2, n.y + h);
      }
      const r = container.getBoundingClientRect();
      const kFit = Math.min(1.1, Math.min((r.width - 80) / (x2 - x1), (r.height - 80) / (y2 - y1)));
      const k = Math.max(r.width < 700 ? 0.45 : 0.6, kFit);
      ed.view = kFit >= k
        ? { k, x: (r.width - (x2 - x1) * k) / 2 - x1 * k, y: (r.height - (y2 - y1) * k) / 2 - y1 * k }
        : { k, x: 30 - x1 * k, y: Math.max(30, (r.height - (y2 - y1) * k) / 2) - y1 * k }; // trop grand : on cale à gauche, lisible
      applyView();
    };

    // ------------------------------------------------------------------ historique
    const serial = () => JSON.stringify({ nodes: ed.graph.nodes.map((n) => ({ id: n.id, type: n.type, x: n.x, y: n.y, data: n.data })), links: ed.graph.links });
    let lastSnap = null;
    ed.snapshot = () => {
      const s = serial();
      if (s === lastSnap) return;
      if (lastSnap) ed.undoStack.push(lastSnap);
      if (ed.undoStack.length > 60) ed.undoStack.shift();
      ed.redoStack = [];
      lastSnap = s;
      if (opts.onChange) opts.onChange('graph');
    };
    function restore(s) {
      const g = JSON.parse(s);
      const outs = {}, jobs = {};
      for (const n of ed.graph.nodes) { outs[n.id] = n.out; jobs[n.id] = n.jobs; }
      ed.graph.nodes = g.nodes.map((n) => Object.assign(n, { out: outs[n.id], jobs: jobs[n.id] }));
      ed.graph.links = g.links;
      lastSnap = s;
      ed.select(null);
      renderAll();
      if (opts.onChange) opts.onChange('graph');
    }
    ed.undo = () => { if (!ed.undoStack.length) return; ed.redoStack.push(lastSnap); restore(ed.undoStack.pop()); };
    ed.redo = () => { if (!ed.redoStack.length) return; ed.undoStack.push(lastSnap); restore(ed.redoStack.pop()); };

    // ------------------------------------------------------------------ modèle
    ed.node = (id) => ed.graph.nodes.find((n) => n.id === id);
    ed.load = (graph) => {
      ed.graph = graph;
      graph.nodes = graph.nodes || [];
      graph.links = graph.links || [];
      graph.meta = graph.meta || { title: 'Sans titre' };
      for (const n of graph.nodes) n.data = Object.assign(N.defaults(n.type), n.data || {});
      ed.status = {};
      for (const n of graph.nodes) if (n.out) ed.status[n.id] = { state: 'done' };
      ed.undoStack = []; ed.redoStack = []; lastSnap = serial();
      ed.selected = null;
      renderAll();
      requestAnimationFrame(() => { ed.fit(); drawLinks(); });
    };
    ed.addNode = (type, x, y, data) => {
      if (!N.DEFS[type]) return null;
      const n = { id: U.uid('n'), type, x: Math.round(x), y: Math.round(y), data: Object.assign(N.defaults(type), data || {}) };
      ed.graph.nodes.push(n);
      renderNode(n);
      ed.snapshot();
      ed.select({ kind: 'node', id: n.id });
      return n;
    };
    ed.removeNode = (id) => {
      ed.graph.nodes = ed.graph.nodes.filter((n) => n.id !== id);
      ed.graph.links = ed.graph.links.filter((l) => l.from !== id && l.to !== id);
      if (nodeEls[id]) { nodeEls[id].remove(); delete nodeEls[id]; }
      delete ed.status[id];
      if (ed.selected && ed.selected.id === id) ed.select(null);
      ed.markStale(null);
      drawLinks();
      ed.snapshot();
    };
    ed.duplicate = (id) => {
      const n = ed.node(id);
      if (!n) return;
      ed.addNode(n.type, n.x + 40, n.y + 40, JSON.parse(JSON.stringify(n.data)));
    };
    ed.outputType = (n, portKey) => {
      const p = N.DEFS[n.type].outputs.find((o) => o.key === portKey);
      return p ? p.type : null;
    };
    function reaches(fromId, targetId, seen) {
      if (fromId === targetId) return true;
      seen = seen || new Set();
      if (seen.has(fromId)) return false;
      seen.add(fromId);
      return ed.graph.links.filter((l) => l.from === fromId).some((l) => reaches(l.to, targetId, seen));
    }
    ed.canConnect = (fromId, fromPort, toId, toPort) => {
      if (fromId === toId) return false;
      const a = ed.node(fromId), b = ed.node(toId);
      if (!a || !b) return false;
      const type = ed.outputType(a, fromPort);
      const inp = N.DEFS[b.type].inputs.find((i) => i.key === toPort);
      if (!inp || !N.accepts(inp, type)) return false;
      if (reaches(toId, fromId)) return false; // pas de cycle
      return true;
    };
    ed.connect = (fromId, fromPort, toId, toPort, silent) => {
      if (!ed.canConnect(fromId, fromPort, toId, toPort)) return false;
      const b = ed.node(toId);
      const inp = N.DEFS[b.type].inputs.find((i) => i.key === toPort);
      if (!inp.multi) ed.graph.links = ed.graph.links.filter((l) => !(l.to === toId && l.toPort === toPort));
      if (ed.graph.links.some((l) => l.from === fromId && l.fromPort === fromPort && l.to === toId && l.toPort === toPort)) return false;
      ed.graph.links.push({ id: U.uid('l'), from: fromId, fromPort, to: toId, toPort });
      ed.markStale(toId);
      drawLinks();
      refreshPorts();
      if (!silent) ed.snapshot();
      if (opts.onConnect) opts.onConnect(toId);
      return true;
    };
    ed.removeLink = (id) => {
      const l = ed.graph.links.find((x) => x.id === id);
      ed.graph.links = ed.graph.links.filter((x) => x.id !== id);
      if (l) ed.markStale(l.to);
      if (ed.selected && ed.selected.id === id) ed.select(null);
      drawLinks();
      refreshPorts();
      ed.snapshot();
    };
    ed.inputsOf = (id) => ed.graph.links.filter((l) => l.to === id);
    ed.downstream = (id, acc) => {
      acc = acc || new Set();
      for (const l of ed.graph.links.filter((x) => x.from === id)) if (!acc.has(l.to)) { acc.add(l.to); ed.downstream(l.to, acc); }
      return acc;
    };
    // Marque un node (et tout l'aval) comme « à recalculer »
    ed.markStale = (id) => {
      if (!id) return;
      const ids = [id].concat(Array.from(ed.downstream(id)));
      for (const x of ids) if (ed.status[x] && ed.status[x].state === 'done') ed.setStatus(x, 'stale');
    };

    // ------------------------------------------------------------------ rendu des nodes
    function portEl(n, p, dir) {
      const type = dir === 'out' ? p.type : Array.isArray(p.type) ? p.type[0] : p.type;
      const color = dir === 'out' ? (N.TYPES[p.type] || {}).color : '#8895a7';
      const el = U.h('div', { class: `port ${dir}${p.multi ? ' multi' : ''}`, 'data-port': p.key, 'data-node': n.id, title: dir === 'in' ? 'accepte : ' + [].concat(p.type).map((t) => (N.TYPES[t] || {}).label || t).join(', ') : (N.TYPES[type] || {}).label },
        dir === 'in' ? U.h('span', { class: 'dot', style: { borderColor: color } }) : null,
        U.h('span', { class: 'lbl' }, p.label + (p.multi ? ' ⋯' : '')),
        dir === 'out' ? U.h('span', { class: 'dot', style: { background: color, borderColor: color } }) : null);
      return el;
    }
    function renderNode(n) {
      const def = N.DEFS[n.type];
      if (!def) return;
      if (nodeEls[n.id]) nodeEls[n.id].remove();
      const el = U.h('div', { class: 'node', 'data-id': n.id, 'data-type': n.type },
        U.h('div', { class: 'node-head' },
          LX.icon.el(def.ico, null, 'icon'),
          U.h('span', { class: 'title' }, n.data._label || def.title),
          U.h('span', { class: 'state', title: '' }),
          def.dice ? U.h('button', { class: 'run dice', title: 'Tirer un nouveau topic', html: LX.icon.svg('die') }) : null,
          U.h('button', { class: 'run', title: 'Exécuter ce node (et son amont)', html: LX.icon.svg('play') })),
        U.h('div', { class: 'node-body' },
          U.h('div', { class: 'ports' },
            U.h('div', { class: 'ports-in' }, def.inputs.map((p) => portEl(n, p, 'in'))),
            U.h('div', { class: 'ports-out' }, def.outputs.map((p) => portEl(n, p, 'out')))),
          U.h('div', { class: 'node-summary' }),
          U.h('div', { class: 'node-preview' })));
      world.append(el);
      nodeEls[n.id] = el;
      ed.refreshNode(n.id);
    }
    ed.refreshNode = (id) => {
      const n = ed.node(id), el = nodeEls[id];
      if (!n || !el) return;
      const def = N.DEFS[n.type];
      el.style.left = n.x + 'px';
      el.style.top = n.y + 'px';
      const accent = (def.color && def.color(n.data)) || (N.TYPES[(def.outputs[0] || {}).type] || {}).color || '#888';
      el.style.setProperty('--accent', accent);
      U.$('.title', el).textContent = n.data._label || def.title;
      // le node « Éléments de langage » affiche l'icône du langage choisi, dans sa couleur
      const icoName = n.type === 'lexique' && LX.lex.byId[n.data.lexique] ? 'lx-' + n.data.lexique : def.ico;
      const holder = U.$('.node-head .icon', el);
      if (holder && holder.dataset.name !== icoName) {
        holder.dataset.name = icoName;
        holder.innerHTML = LX.icon.svg(icoName);
        if (n.type === 'lexique') holder.style.setProperty('--ic', LX.lex.get(n.data.lexique).couleur);
      }
      const sum = def.summary ? def.summary(n.data, n.out) : '';
      U.$('.node-summary', el).textContent = sum || '';
      const prev = opts.preview ? opts.preview(n) : '';
      const pv = U.$('.node-preview', el);
      pv.textContent = prev || '';
      pv.style.display = prev ? '' : 'none';
      const st = ed.status[id] || { state: 'idle' };
      el.dataset.state = st.state;
      U.$('.state', el).title = st.msg || st.state;
      el.classList.toggle('selected', !!(ed.selected && ed.selected.kind === 'node' && ed.selected.id === id));
    };
    ed.setStatus = (id, state, msg) => {
      ed.status[id] = { state, msg };
      ed.refreshNode(id);
      if (opts.onStatus) opts.onStatus(id, state, msg);
    };
    function refreshPorts() {
      const connected = new Set();
      for (const l of ed.graph.links) { connected.add(l.to + ':in:' + l.toPort); connected.add(l.from + ':out:' + l.fromPort); }
      for (const el of U.$$('.port', world)) {
        const key = el.dataset.node + ':' + (el.classList.contains('in') ? 'in' : 'out') + ':' + el.dataset.port;
        el.classList.toggle('connected', connected.has(key));
      }
    }
    function renderAll() {
      for (const id of Object.keys(nodeEls)) { nodeEls[id].remove(); delete nodeEls[id]; }
      for (const n of ed.graph.nodes) renderNode(n);
      applyView();
      drawLinks();
      refreshPorts();
    }
    ed.render = renderAll;

    // ------------------------------------------------------------------ fils
    function portPos(nodeId, dir, key) {
      const el = nodeEls[nodeId];
      if (!el) return null;
      const dot = U.$(`.port.${dir}[data-port="${key}"] .dot`, el);
      if (!dot) return null;
      const n = ed.node(nodeId);
      // position relative au node (indépendante du zoom)
      let x = dot.offsetLeft + dot.offsetWidth / 2, y = dot.offsetTop + dot.offsetHeight / 2;
      let p = dot.offsetParent;
      while (p && p !== el) { x += p.offsetLeft; y += p.offsetTop; p = p.offsetParent; }
      return { x: n.x + x, y: n.y + y };
    }
    const curve = (a, b) => {
      const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
      return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`;
    };
    function drawLinks() {
      gLinks.innerHTML = '';
      for (const l of ed.graph.links) {
        const a = portPos(l.from, 'out', l.fromPort), b = portPos(l.to, 'in', l.toPort);
        if (!a || !b) continue;
        const src = ed.node(l.from);
        const color = (N.TYPES[ed.outputType(src, l.fromPort)] || {}).color || '#aaa';
        const hit = document.createElementNS(svg.namespaceURI, 'path');
        hit.setAttribute('d', curve(a, b));
        hit.setAttribute('class', 'wire-hit');
        hit.dataset.link = l.id;
        const path = document.createElementNS(svg.namespaceURI, 'path');
        path.setAttribute('d', curve(a, b));
        path.setAttribute('class', 'wire' + (ed.selected && ed.selected.id === l.id ? ' selected' : '') + ((ed.status[l.from] || {}).state === 'running' ? ' flowing' : ''));
        path.setAttribute('stroke', color);
        path.dataset.link = l.id;
        gLinks.append(path, hit);
      }
    }
    ed.drawLinks = drawLinks;

    // ------------------------------------------------------------------ sélection
    ed.select = (sel) => {
      ed.selected = sel;
      for (const n of ed.graph.nodes) ed.refreshNode(n.id);
      drawLinks();
      if (opts.onSelect) opts.onSelect(sel && sel.kind === 'node' ? ed.node(sel.id) : null, sel);
    };

    // ------------------------------------------------------------------ interactions
    let drag = null;
    container.addEventListener('pointerdown', (e) => {
      if (e.button === 2) return;
      hideMenu();
      const portDot = e.target.closest('.port');
      const nodeEl = e.target.closest('.node');
      const linkEl = e.target.closest('[data-link]');
      if (e.target.closest('.quickadd')) return;
      if (e.target.closest('button.dice') && nodeEl) {
        e.stopPropagation();
        if (opts.onDice) opts.onDice(nodeEl.dataset.id);
        return;
      }
      if (e.target.closest('button.run') && nodeEl) {
        e.stopPropagation();
        if (opts.onRunNode) opts.onRunNode(nodeEl.dataset.id);
        return;
      }
      if (portDot && portDot.classList.contains('out')) {
        e.preventDefault();
        drag = { kind: 'wire', from: portDot.dataset.node, fromPort: portDot.dataset.port, start: portPos(portDot.dataset.node, 'out', portDot.dataset.port) };
        container.setPointerCapture(e.pointerId);
        container.classList.add('wiring');
        highlightTargets(drag.from, drag.fromPort);
        return;
      }
      if (portDot && portDot.classList.contains('in')) {
        // détacher un lien existant pour le rebrancher ailleurs
        const l = ed.graph.links.filter((x) => x.to === portDot.dataset.node && x.toPort === portDot.dataset.port).pop();
        if (l) {
          e.preventDefault();
          ed.graph.links = ed.graph.links.filter((x) => x.id !== l.id);
          ed.markStale(l.to);
          drawLinks(); refreshPorts();
          drag = { kind: 'wire', from: l.from, fromPort: l.fromPort, start: portPos(l.from, 'out', l.fromPort), detached: true };
          container.setPointerCapture(e.pointerId);
          container.classList.add('wiring');
          highlightTargets(drag.from, drag.fromPort);
          return;
        }
      }
      if (linkEl) {
        ed.select({ kind: 'link', id: linkEl.dataset.link });
        return;
      }
      if (nodeEl) {
        const n = ed.node(nodeEl.dataset.id);
        if (!(ed.selected && ed.selected.id === n.id)) ed.select({ kind: 'node', id: n.id });
        if (e.target.closest('input,textarea,select,a')) return;
        const p = toWorld(e.clientX, e.clientY);
        drag = { kind: 'node', id: n.id, dx: p.x - n.x, dy: p.y - n.y, moved: false };
        container.setPointerCapture(e.pointerId);
        nodeEl.classList.add('dragging');
        return;
      }
      ed.select(null);
      drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: ed.view.x, vy: ed.view.y };
      container.setPointerCapture(e.pointerId);
      container.classList.add('panning');
    });
    container.addEventListener('pointermove', (e) => {
      if (!drag) return;
      if (drag.kind === 'pan') {
        ed.view.x = drag.vx + e.clientX - drag.sx;
        ed.view.y = drag.vy + e.clientY - drag.sy;
        applyView();
      } else if (drag.kind === 'node') {
        const n = ed.node(drag.id);
        const p = toWorld(e.clientX, e.clientY);
        n.x = Math.round(p.x - drag.dx); n.y = Math.round(p.y - drag.dy);
        drag.moved = true;
        nodeEls[n.id].style.left = n.x + 'px';
        nodeEls[n.id].style.top = n.y + 'px';
        drawLinks();
      } else if (drag.kind === 'wire') {
        const p = toWorld(e.clientX, e.clientY);
        dragPath.setAttribute('d', curve(drag.start, p));
        dragPath.style.display = '';
        const src = ed.node(drag.from);
        dragPath.setAttribute('stroke', (N.TYPES[ed.outputType(src, drag.fromPort)] || {}).color || '#fff');
      }
    });
    container.addEventListener('pointerup', (e) => {
      if (!drag) return;
      const d = drag;
      drag = null;
      container.classList.remove('panning', 'wiring');
      U.$$('.port.target', world).forEach((x) => x.classList.remove('target'));
      dragPath.style.display = 'none';
      if (d.kind === 'node') {
        nodeEls[d.id] && nodeEls[d.id].classList.remove('dragging');
        if (d.moved) ed.snapshot();
      } else if (d.kind === 'wire') {
        const target = document.elementFromPoint(e.clientX, e.clientY);
        const port = target && target.closest('.port.in');
        const nodeEl = target && target.closest('.node');
        if (port) {
          if (!ed.connect(d.from, d.fromPort, port.dataset.node, port.dataset.port) && d.detached) ed.snapshot();
        } else if (nodeEl && nodeEl.dataset.id !== d.from) {
          // lâché sur un node : premier port compatible libre (ou multiple)
          const n = ed.node(nodeEl.dataset.id);
          const type = ed.outputType(ed.node(d.from), d.fromPort);
          const ins = N.DEFS[n.type].inputs.filter((i) => N.accepts(i, type));
          const free = ins.find((i) => i.multi || !ed.graph.links.some((l) => l.to === n.id && l.toPort === i.key)) || ins[0];
          if (free) ed.connect(d.from, d.fromPort, n.id, free.key);
          else if (d.detached) ed.snapshot();
        } else {
          if (d.detached) ed.snapshot();
          const p = toWorld(e.clientX, e.clientY);
          showMenu(e.clientX, e.clientY, p, { from: d.from, fromPort: d.fromPort });
        }
      }
    });
    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > 0 && !e.shiftKey && Math.abs(e.deltaX) < 1) {
        ed.zoom(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY);
      } else {
        ed.view.x -= e.deltaX; ed.view.y -= e.deltaY; applyView();
      }
    }, { passive: false });
    container.addEventListener('dblclick', (e) => {
      if (e.target.closest('.node') || e.target.closest('.quickadd')) return;
      showMenu(e.clientX, e.clientY, toWorld(e.clientX, e.clientY));
    });
    container.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const nodeEl = e.target.closest('.node');
      if (nodeEl) return showNodeMenu(e.clientX, e.clientY, nodeEl.dataset.id);
      const linkEl = e.target.closest('[data-link]');
      if (linkEl) return ed.removeLink(linkEl.dataset.link);
      showMenu(e.clientX, e.clientY, toWorld(e.clientX, e.clientY));
    });

    function highlightTargets(fromId, fromPort) {
      for (const el of U.$$('.port.in', world)) {
        if (ed.canConnect(fromId, fromPort, el.dataset.node, el.dataset.port)) el.classList.add('target');
      }
    }

    // ------------------------------------------------------------------ menus
    function hideMenu() { menu.classList.add('hidden'); menu.innerHTML = ''; }
    ed.hideMenu = hideMenu;
    function placeMenu(cx, cy) {
      const r = container.getBoundingClientRect();
      menu.classList.remove('hidden');
      const mw = 260, mh = Math.min(420, r.height - 20);
      menu.style.left = Math.min(Math.max(8, cx - r.left), r.width - mw - 8) + 'px';
      menu.style.top = Math.min(Math.max(8, cy - r.top), r.height - mh - 8) + 'px';
      menu.style.maxHeight = mh + 'px';
    }
    function showMenu(cx, cy, at, wire) {
      menu.innerHTML = '';
      const type = wire ? ed.outputType(ed.node(wire.from), wire.fromPort) : null;
      const input = U.h('input', { class: 'qa-search', placeholder: wire ? 'Brancher sur…' : 'Ajouter un node…' });
      const list = U.h('div', { class: 'qa-list' });
      menu.append(input, list);
      const candidates = Object.entries(N.DEFS).filter(([, def]) => !type || def.inputs.some((i) => N.accepts(i, type)));
      const renderList = () => {
        list.innerHTML = '';
        const q = input.value.toLowerCase();
        for (const cat of N.CATS) {
          const items = candidates.filter(([k, def]) => def.cat === cat && (!q || (def.title + ' ' + def.desc + ' ' + k).toLowerCase().includes(q)));
          if (!items.length) continue;
          list.append(U.h('div', { class: 'qa-cat' }, cat));
          for (const [k, def] of items) {
            list.append(U.h('button', {
              class: 'qa-item', title: def.desc,
              onclick: () => {
                hideMenu();
                const n = ed.addNode(k, at.x, at.y - 20);
                if (wire && n) {
                  const inp = N.DEFS[k].inputs.find((i) => N.accepts(i, type));
                  if (inp) ed.connect(wire.from, wire.fromPort, n.id, inp.key);
                }
              },
            }, LX.icon.el(def.ico, (N.TYPES[def.outputs[0].type] || {}).color), ' ', def.title));
          }
        }
      };
      input.addEventListener('input', renderList);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hideMenu();
        if (e.key === 'Enter') { const b = U.$('.qa-item', list); if (b) b.click(); }
      });
      renderList();
      placeMenu(cx, cy);
      setTimeout(() => input.focus(), 0);
    }
    ed.showMenu = (cx, cy) => {
      const r = container.getBoundingClientRect();
      cx = cx == null ? r.left + r.width / 2 - 130 : cx;
      cy = cy == null ? r.top + 80 : cy;
      showMenu(cx, cy, toWorld(cx, cy));
    };
    function showNodeMenu(cx, cy, id) {
      menu.innerHTML = '';
      const item = (ico, label, fn) => U.h('button', { class: 'qa-item', onclick: () => { hideMenu(); fn(); } }, LX.icon.el(ico), ' ', label);
      menu.append(
        item('play', 'Exécuter', () => opts.onRunNode && opts.onRunNode(id)),
        item('copy', 'Dupliquer', () => ed.duplicate(id)),
        item('trash', 'Supprimer', () => ed.removeNode(id)));
      placeMenu(cx, cy);
    }

    // centre de la vue en coordonnées monde (pour ajouter un node « au milieu »)
    ed.center = () => {
      const r = container.getBoundingClientRect();
      return toWorld(r.left + r.width / 2, r.top + r.height / 2);
    };
    ed.toWorld = toWorld;

    window.addEventListener('resize', drawLinks);
    applyView();
    return ed;
  }

  LX.editor = { create };
})(window.LX = window.LX || {});
