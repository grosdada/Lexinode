/*
 * LEXINODE — animatique : prévisualisation jouable du short (SVG/CSS animés + voix off de synthèse).
 * Chaque scène est rendue d'après son « visuel » : chiffre, barres, courbes, pictos, frise, balance, schéma, citation, mots, titre.
 */
(function (LX) {
  'use strict';
  const U = LX.U;

  function contrast(hex) {
    const m = String(hex || '').match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!m) return '#ffffff';
    const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? '#111111' : '#ffffff';
  }
  const lum = (hex) => {
    const m = String(hex || '').match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!m) return 0.5;
    return [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  };

  function sceneHTML(sc, pal) {
    const v = sc.visuel || { type: 'titre', titre: sc.titre };
    const [c0, c1, c2, c3] = pal;
    const accent = c2 || '#FFB703';
    const second = c1 || '#4FC3F7';
    const esc = U.esc;
    switch (v.type) {
      case 'chiffre':
        return `<div class="am-big">${v.emoji ? `<div class="am-emoji pop">${v.emoji}</div>` : ''}
          <div class="am-num" data-count="${v.valeur != null ? v.valeur : ''}" style="color:${accent}">${esc(v.valeurTexte || '')}</div>
          <div class="am-unit fade d1">${esc(v.unite || '')}</div><div class="am-label fade d2">${esc(v.label || '')}</div></div>`;
      case 'barres': {
        const items = (v.items || []).filter((i) => i.value != null);
        const max = Math.max(...items.map((i) => Math.abs(i.value)), 1);
        const useLog = items.length > 1 && max / Math.max(1e-9, Math.min(...items.map((i) => Math.abs(i.value) || max))) > 50;
        return `<div class="am-bars">${items.map((it, k) => {
          const h = useLog ? (Math.log10(Math.abs(it.value) + 1) / Math.log10(max + 1)) * 100 : (Math.abs(it.value) / max) * 100;
          return `<div class="am-bar-col"><div class="am-bar-val fade d2">${esc(U.fmtBig(it.value))} ${esc(it.unite || '')}</div>
            <div class="am-bar" style="--h:${Math.max(4, h)}%;background:${k ? second : accent};animation-delay:${0.2 + k * 0.35}s"></div>
            <div class="am-bar-lbl">${it.emoji || ''} ${esc(U.truncateWords(it.label, 5))}</div></div>`;
        }).join('')}</div>${useLog ? '<div class="am-foot">échelle logarithmique</div>' : ''}`;
      }
      case 'courbes': {
        const W = 300, H = 170;
        const series = v.series || [];
        // chaque série est ramenée à sa propre échelle (min → bas, max → haut) pour montrer les co-variations
        const n = Math.max(2, (series[0] || { values: [] }).values.length);
        const px = (i) => 20 + (i * (W - 40)) / (n - 1);
        const paths = series.map((s, k) => {
          const mn = Math.min(...s.values), mx = Math.max(...s.values);
          const py = (val) => H - 24 - ((val - mn) / (mx - mn || 1)) * (H - 44);
          return `<path d="${s.values.map((val, i) => (i ? 'L' : 'M') + px(i).toFixed(1) + ',' + py(val).toFixed(1)).join(' ')}" class="am-line" style="stroke:${k ? second : accent};animation-delay:${0.2 + k * 0.5}s"/>`;
        }).join('');
        const legend = series.map((s, k) => `<span><i style="background:${k ? second : accent}"></i>${s.emoji || ''} ${esc(U.truncateWords(s.label, 4))}</span>`).join('');
        return `<svg class="am-chart" viewBox="0 0 ${W} ${H}"><line x1="20" y1="${H - 20}" x2="${W - 20}" y2="${H - 20}" class="am-axis"/>${paths}
          <text x="20" y="${H - 4}" class="am-tick">${esc((v.x || [])[0] || '')}</text><text x="${W - 20}" y="${H - 4}" text-anchor="end" class="am-tick">${esc((v.x || []).slice(-1)[0] || '')}</text></svg>
          <div class="am-legend fade d2">${legend}</div><div class="am-foot">échelles normalisées</div>`;
      }
      case 'pictos': {
        const [A, B] = v.items || [];
        const ratio = Math.max(1, v.ratio || 1);
        const bigIsA = A && B && A.value != null && B.value != null ? Math.abs(A.value) >= Math.abs(B.value) : true;
        const big = bigIsA ? A : B, small = bigIsA ? B : A;
        const shown = Math.min(60, Math.round(ratio));
        const icons = Array.from({ length: shown }, (_, i) => `<span style="animation-delay:${0.3 + i * 0.03}s">${(big && big.emoji) || '●'}</span>`).join('');
        return `<div class="am-pictos"><div class="am-picto-one pop">${(small && small.emoji) || '●'}</div><div class="am-eq fade d1">=</div>
          <div class="am-picto-grid">${icons}${ratio > 60 ? '<span class="more">…</span>' : ''}</div></div>
          <div class="am-label fade d3">${esc(v.ratioText || '')}</div>`;
      }
      case 'nuage': {
        const W = 300, H = 200, pts = v.points || [];
        if (pts.length < 2) return '';
        const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
        const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        const px = (x) => 28 + ((x - x0) / (x1 - x0 || 1)) * (W - 44);
        const py = (y) => H - 26 - ((y - y0) / (y1 - y0 || 1)) * (H - 44);
        const mx = U.mean(xs), my = U.mean(ys);
        let num = 0, den = 0;
        for (let i = 0; i < pts.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
        const b = den ? num / den : 0, a0 = my - b * mx;
        const dots = pts.map((p, i) => `<circle class="am-pt" cx="${px(p.x).toFixed(1)}" cy="${py(p.y).toFixed(1)}" r="5" fill="${accent}" style="animation-delay:${0.15 + i * 0.07}s"/>`).join('');
        const reg = `<path class="am-reg" d="M${px(x0).toFixed(1)},${py(a0 + b * x0).toFixed(1)} L${px(x1).toFixed(1)},${py(a0 + b * x1).toFixed(1)}" stroke="${second}" stroke-width="2.5" fill="none"/>`;
        const lab = v.labels || {};
        return `<svg class="am-scatter" viewBox="0 0 ${W} ${H}"><path d="M24 8V${H - 22}H${W - 8}" class="am-axis" fill="none"/>${dots}${reg}
          <text x="${W - 10}" y="${H - 8}" text-anchor="end" class="am-tick">${esc(U.truncateWords(lab.a || 'A', 5))} →</text>
          <text x="8" y="14" class="am-tick">↑ ${esc(U.truncateWords(lab.b || 'B', 5))}</text></svg>
          <div class="am-r fade d3" style="color:${accent}">r = ${esc(U.fmt(v.r, 2))}</div>`;
      }
      case 'frise': {
        const pts = v.points || [];
        return `<div class="am-timeline"><div class="am-tl-line"></div>${pts.map((p, i) => `<div class="am-tl-pt" style="animation-delay:${0.3 + i * 0.45}s;left:${pts.length > 1 ? 6 + (i * 88) / (pts.length - 1) : 50}%">
          <div class="am-tl-dot" style="background:${accent}"></div><div class="am-tl-date">${esc(p.date)}</div><div class="am-tl-lbl">${esc(p.label)}</div></div>`).join('')}</div>`;
      }
      case 'balance': {
        const [A, B] = v.items || [{ label: 'A' }, { label: 'B' }];
        return `<div class="am-balance"><div class="am-beam"><div class="am-pan l"><span>${(A && A.emoji) || '⚖️'}</span><b>${esc(U.truncateWords((A || {}).label, 4))}</b></div>
          <div class="am-pan r"><span>${(B && B.emoji) || '⚖️'}</span><b>${esc(U.truncateWords((B || {}).label, 4))}</b></div></div><div class="am-pivot" style="border-bottom-color:${accent}"></div></div>`;
      }
      case 'schema': {
        const boxes = (v.boxes || []).slice(0, 4);
        return `<div class="am-schema">${boxes.map((b, i) => `${i ? `<div class="am-arrow fade" style="animation-delay:${0.2 + i * 0.5}s">➜</div>` : ''}<div class="am-box pop" style="animation-delay:${i * 0.5}s;border-color:${i % 2 ? second : accent}">${esc(U.truncateWords(b, 6))}</div>`).join('')}</div>`;
      }
      case 'mots':
        return `<div class="am-words">${(v.mots || []).map((m, i) => `<span class="pop" style="animation-delay:${i * 0.3}s;background:${i % 2 ? second : accent};color:${contrast(i % 2 ? second : accent)}">${esc(m)}</span>`).join('')}</div>`;
      case 'citation':
        return `<div class="am-quote"><div class="am-qmark" style="color:${accent}">“</div><div class="am-qtext type">${esc(v.texte || '')}</div></div>`;
      default:
        return `<div class="am-title"><div class="am-title-bar" style="background:${accent}"></div><h2 class="fade">${esc(v.titre || sc.titre || '')}</h2></div>`;
    }
  }

  function countUp(el) {
    const target = Number(el.dataset.count);
    if (!isFinite(target) || el.dataset.count === '') return;
    const original = el.textContent;
    const t0 = performance.now();
    const dur = 1200;
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = p < 1 ? U.fmtBig(target * e) : original;
      if (p < 1 && el.isConnected) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /** Ouvre le lecteur d'animatique dans `host` pour le script donné */
  function open(host, script) {
    host.innerHTML = '';
    const pal = (script.palette && script.palette.length ? script.palette : ['#0B3C5D', '#328CC1', '#D9B310', '#F2F2F2']).slice();
    // fond = couleur la plus sombre ou la plus claire selon la palette
    const sorted = pal.slice().sort((a, b) => lum(a) - lum(b));
    const bg = sorted[0];
    const fg = contrast(bg);
    const accentPal = [bg].concat(pal.filter((c) => c !== bg).sort((a, b) => Math.abs(lum(b) - lum(bg)) - Math.abs(lum(a) - lum(bg))));
    const ratio = script.format === '16:9' ? '16 / 9' : script.format === '1:1' ? '1 / 1' : '9 / 16';
    const stage = U.h('div', { class: 'am-stage', style: { aspectRatio: ratio, background: bg, color: fg } });
    const sceneBox = U.h('div', { class: 'am-scene' });
    const caption = U.h('div', { class: 'am-caption' });
    const onscreen = U.h('div', { class: 'am-onscreen' });
    const progress = U.h('div', { class: 'am-progress' }, U.h('i'));
    const badge = U.h('div', { class: 'am-badge' });
    stage.append(sceneBox, onscreen, caption, progress, badge);
    const btnPlay = U.h('button', { class: 'btn primary', html: LX.icon.svg('play') + ' Lire' });
    const btnPrev = U.h('button', { class: 'btn', title: 'Scène précédente', html: LX.icon.svg('prev') });
    const btnNext = U.h('button', { class: 'btn', title: 'Scène suivante', html: LX.icon.svg('next') });
    const tts = U.h('input', { type: 'checkbox', id: 'am-tts' });
    tts.checked = U.store.get('animaticTTS', true);
    tts.addEventListener('change', () => U.store.set('animaticTTS', tts.checked));
    const sceneSel = U.h('span', { class: 'am-counter' });
    const controls = U.h('div', { class: 'am-controls' }, btnPrev, btnPlay, btnNext, sceneSel,
      U.h('label', { class: 'am-tts' }, tts, ' voix de synthèse'));
    host.append(stage, controls);

    let idx = 0, playing = false, timer = null, startAt = 0, raf = null;
    const scenes = script.scenes || [];
    const total = scenes.reduce((s, x) => s + (x.duree || 4), 0);
    const speak = (text) => {
      if (!tts.checked || !('speechSynthesis' in window)) return;
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(U.stripMarks(text));
        u.lang = 'fr-FR';
        u.rate = script.voix === 'dynamique' ? 1.12 : script.voix === 'solennelle' ? 0.9 : 1;
        const fr = speechSynthesis.getVoices().find((vv) => /^fr/i.test(vv.lang));
        if (fr) u.voice = fr;
        speechSynthesis.speak(u);
      } catch (e) { /* synthèse vocale indisponible */ }
    };
    function show(i) {
      idx = Math.max(0, Math.min(scenes.length - 1, i));
      const sc = scenes[idx];
      if (!sc) return;
      sceneBox.innerHTML = sceneHTML(sc, accentPal.slice(1).concat(accentPal.slice(0, 1)));
      sceneBox.classList.remove('enter');
      void sceneBox.offsetWidth;
      sceneBox.classList.add('enter');
      U.$$('[data-count]', sceneBox).forEach(countUp);
      onscreen.textContent = sc.texte_ecran || '';
      caption.textContent = U.stripMarks(sc.vo || '');
      badge.textContent = `${sc.n}/${scenes.length} · ${sc.titre}`;
      sceneSel.textContent = `Scène ${sc.n} / ${scenes.length} — ${sc.duree} s`;
      if (playing) speak(sc.vo);
    }
    function loop() {
      if (!playing) return;
      const sc = scenes[idx];
      const elapsed = (performance.now() - startAt) / 1000;
      const before = scenes.slice(0, idx).reduce((s, x) => s + (x.duree || 4), 0);
      progress.firstChild.style.width = Math.min(100, ((before + elapsed) / total) * 100) + '%';
      if (elapsed >= (sc.duree || 4)) {
        if (idx >= scenes.length - 1) return stop(true);
        startAt = performance.now();
        show(idx + 1);
      }
      raf = requestAnimationFrame(loop);
    }
    function play() {
      playing = true;
      btnPlay.innerHTML = LX.icon.svg('pause') + ' Pause';
      startAt = performance.now();
      show(idx);
      loop();
    }
    function stop(ended) {
      playing = false;
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      btnPlay.innerHTML = LX.icon.svg('play') + ' Lire';
      try { speechSynthesis.cancel(); } catch (e) { /* ignore */ }
      if (ended) { idx = 0; }
    }
    btnPlay.addEventListener('click', () => (playing ? stop() : play()));
    btnPrev.addEventListener('click', () => { startAt = performance.now(); show(idx - 1); });
    btnNext.addEventListener('click', () => { startAt = performance.now(); show(idx + 1); });
    show(0);
    return { stop, play, show };
  }

  LX.animatic = { open, sceneHTML };
})(window.LX = window.LX || {});
