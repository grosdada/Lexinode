/* LEXINODE — utilitaires (texte français, nombres, hasard reproductible, DOM) */
(function (LX) {
  'use strict';
  const U = {};

  U.uid = (p) => (p || 'n') + Math.random().toString(36).slice(2, 9);

  // --- Hasard reproductible (mulberry32) ------------------------------------
  U.hash = (str) => {
    let h = 2166136261;
    const s = String(str);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  U.rng = (seed) => {
    let a = typeof seed === 'number' ? seed >>> 0 : U.hash(seed);
    const r = () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.pick = (arr) => (arr && arr.length ? arr[Math.floor(r() * arr.length)] : undefined);
    r.int = (min, max) => min + Math.floor(r() * (max - min + 1));
    r.shuffle = (arr) => {
      const a2 = arr.slice();
      for (let i = a2.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a2[i], a2[j]] = [a2[j], a2[i]]; }
      return a2;
    };
    r.sample = (arr, n) => r.shuffle(arr || []).slice(0, n);
    r.weighted = (items, weightOf) => {
      const tot = items.reduce((s, it) => s + Math.max(0, weightOf(it)), 0);
      if (!tot) return r.pick(items);
      let x = r() * tot;
      for (const it of items) { x -= Math.max(0, weightOf(it)); if (x <= 0) return it; }
      return items[items.length - 1];
    };
    return r;
  };

  // --- Texte -----------------------------------------------------------------
  U.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.cap = (s) => { s = String(s || '').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; };
  U.stripMarks = (s) => String(s || '').replace(/\[\[([^\]|]+)\|[^\]]*\]\]/g, '$1');
  U.words = (s) => (U.stripMarks(s).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []);
  U.truncateWords = (s, n) => {
    const w = String(s || '').split(/\s+/);
    return w.length <= n ? String(s || '') : w.slice(0, n).join(' ').replace(/[,;:]$/, '') + '…';
  };
  U.sentences = (s) => String(s || '').replace(/\s+/g, ' ').match(/[^.!?…]+[.!?…]+["»”)]*|[^.!?…]+$/g)?.map((x) => x.trim()).filter(Boolean) || [];

  // Groupe nominal inséré en milieu de phrase : « Les ventes… » → « les ventes… »
  U.np = (s) => {
    s = String(s || '').trim().replace(/[.!?;:]+$/, '');
    if (!s) return s;
    const first = s.split(/\s+/)[0];
    if (first.length > 1 && first === first.toUpperCase()) return s; // sigle
    if (/^[A-ZÀ-Ý][a-zà-ÿ]/.test(s) && /^(Le|La|Les|L'|L’|Un|Une|Des|Du|De|Ce|Cette|Ces|Son|Sa|Ses|Leur|Leurs|Notre|Nos|Votre|Vos)\b/.test(s)) {
      return s.charAt(0).toLowerCase() + s.slice(1);
    }
    return s;
  };
  // Si le groupe nominal n'a pas de déterminant, on en ajoute un neutre
  U.withArticle = (s) => {
    s = U.np(s);
    if (!s) return s;
    if (/^(le|la|les|l'|l’|un|une|des|du|de|ce|cet|cette|ces|son|sa|ses|leur|leurs|notre|nos|votre|vos|mon|ma|mes|ton|ta|tes|\d)/i.test(s)) return s;
    if (/^[A-ZÀ-Ý]/.test(s)) return s; // nom propre
    return '« ' + s + ' »';
  };

  // Corrections typographiques et contractions après remplissage des gabarits
  U.fixFr = (s) => {
    s = String(s || '');
    // B = début de mot (début de chaîne, espace, ponctuation ouvrante) : évite « précède le » → « précèdu »
    const B = "(^|[\\s(«\"'’\\[—–-])";
    const VERB = /^(\p{L}+(?:er|ir|re))\b/u; // « de le commenter » : « le » est un pronom, pas un article
    const contract = (re, rep2) => { s = s.replace(re, (m, pre, w, rest) => (VERB.test(rest) && !/^(nombre|centre|cancer|dossier|quartier|premier|dernier|métier|chantier|calendrier|livre|titre|ordre|cadre|chiffre|monde|pouvoir|savoir|devoir|soir|plaisir|loisir|désir|avenir|souvenir|sucre|verre|père|frère|siècle|ministre|théâtre|marché|secteur|loyer|foyer|rocher)\b/i.test(rest) ? m : pre + rep2(w) + rest)); };
    contract(new RegExp(B + '([Dd])e le (\\S+)', 'gu'), (d) => (d === 'D' ? 'Du ' : 'du '));
    contract(new RegExp(B + '([Dd])e les (\\S+)', 'gu'), (d) => (d === 'D' ? 'Des ' : 'des '));
    contract(new RegExp(B + '([Àà]) le (\\S+)', 'gu'), (a) => (a === 'À' ? 'Au ' : 'au '));
    contract(new RegExp(B + '([Àà]) les (\\S+)', 'gu'), (a) => (a === 'À' ? 'Aux ' : 'aux '));
    s = s.replace(new RegExp(B + '([Dd])e des ', 'gu'), '$1$2e ')
      .replace(new RegExp(B + '([Dd])e ([aeiouyàâéèêëîïôûAEIOUYÉ])', 'gu'), "$1$2'$3")
      .replace(new RegExp(B + '([Qq])ue ([aeiouyAEIOUYéÉ])', 'gu'), "$1$2u'$3")
      .replace(new RegExp(B + '([Ll])e ([aeiouyAEIOUYéÉèê])', 'gu'), "$1$2'$3")
      .replace(new RegExp(B + '([Ll])a ([aeiouAEIOUéÉèê])', 'gu'), "$1$2'$3")
      .replace(/\s+([,.])/g, '$1')
      .replace(/\s{2,}/g, ' ')
      .replace(/\.\.(?!\.)/g, '.')
      .replace(/« \s*»/g, '')
      .trim();
    return s;
  };
  // NB : les élisions automatiques ci-dessus visent les cas fréquents ; elles ignorent le h aspiré.

  U.sentence = (s) => {
    s = U.fixFr(s);
    if (!s) return s;
    s = s.charAt(0).toUpperCase() + s.slice(1);
    if (!/([.!?…:]|[.!?…]\s*[»"”)])$/.test(s)) s += '.';
    return s;
  };

  // Remplace les placeholders {x}. vars : {sujet, element, chiffre, evenement, a, b, conclusion, public, terme:function}
  U.PH = ['sujet', 'element', 'chiffre', 'evenement', 'a', 'b', 'conclusion', 'terme', 'public'];
  U.placeholders = (tpl) => (String(tpl).match(/\{([a-z]+)\}/g) || []).map((x) => x.slice(1, -1));
  U.canFill = (tpl, vars) => U.placeholders(tpl).every((k) => k === 'terme' || (vars[k] != null && vars[k] !== ''));
  U.fill = (tpl, vars) => U.sentence(String(tpl).replace(/\{([a-z]+)\}/g, (m, k) => {
    const v = vars[k];
    if (typeof v === 'function') return v();
    return v == null || v === '' ? (vars.sujet || '…') : v;
  }));
  // Choisit un gabarit dont tous les placeholders sont disponibles (sinon un gabarit sans placeholder)
  U.pickTpl = (list, vars, r, prefer) => {
    list = (list || []).filter(Boolean);
    if (!list.length) return null;
    const ok = list.filter((t) => U.canFill(t, vars));
    if (prefer) {
      const pref = ok.filter((t) => U.placeholders(t).includes(prefer));
      if (pref.length) return r.pick(pref);
    }
    return ok.length ? r.pick(ok) : null;
  };

  // --- Nombres ---------------------------------------------------------------
  U.parseNum = (v) => {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (v == null) return null;
    let s = String(v).toLowerCase().replace(/ | /g, ' ').trim();
    if (!s) return null;
    let mult = 1;
    if (/milliards?|mds?\b|\bbn\b|\bb\b/.test(s)) mult = 1e9;
    else if (/millions?|\bm\b|\bmio\b/.test(s)) mult = 1e6;
    else if (/milliers?|\bk\b/.test(s)) mult = 1e3;
    const m = s.match(/-?\d[\d\s.,']*(e[+-]?\d+)?/);
    if (!m) return null;
    let n = m[0].replace(/[\s']/g, '');
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(n)) n = n.replace(/\./g, '').replace(',', '.'); // 1.234.567,8
    else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(n)) n = n.replace(/,/g, ''); // 1,234,567.8
    else n = n.replace(',', '.');
    const x = parseFloat(n);
    return isFinite(x) ? x * mult : null;
  };
  U.fmt = (n, digits) => {
    if (n == null || !isFinite(n)) return '—';
    const abs = Math.abs(n);
    let d = digits;
    if (d == null) d = abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : 3;
    return n.toLocaleString('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: 0 });
  };
  U.fmtBig = (n) => {
    if (n == null || !isFinite(n)) return '—';
    const abs = Math.abs(n);
    if (abs >= 1e9) return U.fmt(n / 1e9, 1) + ' milliard' + (abs >= 2e9 ? 's' : '');
    if (abs >= 1e6) return U.fmt(n / 1e6, 1) + ' million' + (abs >= 2e6 ? 's' : '');
    return U.fmt(n);
  };
  // « 12,7 millions » + « paires » → « 12,7 millions de paires »
  U.withUnit = (numText, unit) => {
    numText = String(numText || '').trim();
    unit = String(unit || '').trim();
    if (!unit) return numText;
    if (/(millions?|milliards?|milliers?)$/i.test(numText)) return numText + (/^[aeiouyhàâéèêîôû]/i.test(unit) ? ' d’' : ' de ') + unit;
    return numText + ' ' + unit;
  };
  U.noEmoji = (s) => String(s || '').replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '').replace(/\s{2,}/g, ' ').trim();
  U.parseSerie = (text) => {
    const out = [];
    for (const line of String(text || '').split(/\n|;(?=\s*\d{4})/)) {
      const m = line.trim().match(/^([^:=\t]+?)\s*[:=\t]\s*(.+)$/) || line.trim().match(/^(\d{4})\s+(.+)$/);
      if (!m) continue;
      const y = U.parseNum(m[2]);
      if (y == null) continue;
      const xNum = U.parseNum(m[1]);
      out.push({ x: m[1].trim(), xn: xNum != null && /^\s*-?\d/.test(m[1]) ? xNum : null, y });
    }
    return out;
  };
  U.mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  U.pearson = (xs, ys) => {
    const n = Math.min(xs.length, ys.length);
    if (n < 3) return null;
    const mx = U.mean(xs.slice(0, n)), my = U.mean(ys.slice(0, n));
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2; }
    return dx && dy ? num / Math.sqrt(dx * dy) : null;
  };
  U.slope = (pts) => {
    const xs = pts.map((p, i) => (p.xn != null ? p.xn : i)), ys = pts.map((p) => p.y);
    const n = xs.length;
    if (n < 2) return 0;
    const mx = U.mean(xs), my = U.mean(ys);
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
    return den ? num / den : 0;
  };

  // Rangs (moyenne des ex aequo) et corrélation de Spearman
  U.ranks = (a) => {
    const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]);
    const r = new Array(a.length);
    for (let i = 0; i < idx.length;) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return r;
  };
  U.spearman = (xs, ys) => U.pearson(U.ranks(xs), U.ranks(ys));
  // Fonction bêta incomplète régularisée (fraction continue de Lentz) → p-valeur bilatérale d'un r de Pearson
  const gammaln = (x) => {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (const cj of c) ser += cj / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  };
  const betacf = (a, b, x) => {
    const FPMIN = 1e-30;
    let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - (qab * x) / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= 200; m++) {
      const m2 = 2 * m;
      let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 3e-7) break;
    }
    return h;
  };
  U.ibeta = (x, a, b) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(gammaln(a + b) - gammaln(a) - gammaln(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
  };
  U.pValueR = (r, n) => {
    if (r == null || n < 3) return null;
    if (Math.abs(r) >= 1) return 0;
    const df = n - 2;
    const t2 = (r * r * df) / (1 - r * r);
    return U.ibeta(df / (df + t2), df / 2, 0.5);
  };
  U.fmtP = (p) => (p == null ? '—' : p < 0.001 ? 'p < 0,001' : 'p = ' + U.fmt(p, p < 0.01 ? 3 : 2));

  // Lisibilité (formule de Kandel & Moles, adaptation française de Flesch)
  U.syllables = (w) => Math.max(1, (String(w).toLowerCase().replace(/e$/, '').match(/[aeiouyàâäéèêëîïôöûùüœ]+/g) || []).length);
  U.readability = (text) => {
    const t = U.stripMarks(text);
    const sents = Math.max(1, U.sentences(t).length);
    const w = U.words(t);
    if (!w.length) return null;
    const syl = w.reduce((s, x) => s + U.syllables(x), 0);
    return Math.round(207 - 1.015 * (w.length / sents) - 73.6 * (syl / w.length));
  };

  // Remplacement « mot à mot » respectant les frontières de mots et la casse initiale
  U.reEsc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const reCache = new Map();
  U.wordRe = (term, flags) => {
    const k = (flags || 'gi') + '\u0000' + term;
    let re = reCache.get(k);
    if (!re) {
      re = new RegExp('(^|[^\\p{L}\\p{N}])(' + U.reEsc(term) + ')(?=$|[^\\p{L}\\p{N}])', (flags || 'gi') + 'u');
      if (reCache.size > 20000) reCache.clear();
      reCache.set(k, re);
    }
    re.lastIndex = 0;
    return re;
  };
  U.replaceWord = (text, from, to) => (!String(text).toLowerCase().includes(String(from).toLowerCase()) ? String(text) : String(text).replace(U.wordRe(from), (m, pre, w) => {
    const rep = w.charAt(0) === w.charAt(0).toUpperCase() && w.charAt(0) !== w.charAt(0).toLowerCase() ? U.cap(to) : to;
    return pre + rep;
  }));

  // Emoji pour les pictogrammes de l'animatique (mots-clés courants)
  U.EMOJI = [
    [/pantoufl|chausson|chaussure|basket|soulier/i, '🥿'], [/girafe|girafon/i, '🦒'], [/b[ée]b[ée]|naissance|nouveau-n/i, '👶'],
    [/zoo|animal|animaux/i, '🦁'], [/vache|lait/i, '🐄'], [/chat\b|chats\b/i, '🐈'], [/chien/i, '🐕'], [/oiseau|cigogne/i, '🕊️'],
    [/voiture|auto|véhicule/i, '🚗'], [/vélo/i, '🚲'], [/avion|vol\b/i, '✈️'], [/train/i, '🚆'],
    [/euro|€|prix|vente|chiffre d'affaires|march[ée]|argent|dollar|\$/i, '💶'], [/emploi|travail|salari|chômage/i, '👷'],
    [/m[ée]decin|sant[ée]|patient|h[ôo]pital|malad/i, '🩺'], [/vote|[ée]lection|d[ée]put|minist|gouvern|politi/i, '🗳️'],
    [/mode|v[êe]tement|robe|collection|d[ée]fil[ée]/i, '👗'], [/film|cin[ée]ma|vid[ée]o|t[ée]l[ée]|audience/i, '🎬'],
    [/[ée]cole|[ée]l[èe]ve|enseign|cours/i, '🎓'], [/climat|co2|carbone|[ée]colog|temp[ée]rature/i, '🌍'],
    [/pluie|m[ée]t[ée]o|froid|hiver|neige/i, '❄️'], [/soleil|chaleur|[ée]t[ée]\b/i, '☀️'], [/caf[ée]/i, '☕'], [/bi[èe]re|pub\b/i, '🍺'],
    [/pomme de terre|patate/i, '🥔'], [/livre|lecture/i, '📚'], [/t[ée]l[ée]phone|smartphone/i, '📱'], [/ordinateur|tech|num[ée]rique|ia\b/i, '💻'],
    [/maison|logement|immobilier/i, '🏠'], [/sport|match|football|[ée]quipe/i, '⚽'], [/justice|tribunal|loi|droit/i, '⚖️'],
    [/arm[ée]e|militaire|d[ée]fense/i, '🎖️'], [/science|recherche|laboratoire/i, '🔬'], [/population|habitant|citoyen|personne/i, '🧍'],
  ];
  U.emojiFor = (s, fallback) => {
    for (const [re, e] of U.EMOJI) if (re.test(String(s || ''))) return e;
    return fallback || '●';
  };

  // --- DOM -------------------------------------------------------------------
  U.$ = (sel, root) => (root || document).querySelector(sel);
  U.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  U.h = (tag, attrs, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  };
  U.download = (name, content, type) => {
    if (window.LEXINODE_DEMO && LX.showText) return LX.showText(name, content); // pages publiées : téléchargements bloqués
    const blob = new Blob([content], { type: type || 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  U.copy = async (text) => {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      const ta = U.h('textarea', { style: { position: 'fixed', opacity: '0' } }, text);
      document.body.append(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { /* ignore */ }
      ta.remove();
      return ok;
    }
  };
  U.store = {
    get(k, d) { try { const v = localStorage.getItem('lexinode:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('lexinode:' + k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } },
  };
  U.slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sans-titre';

  LX.U = U;
})(window.LX = window.LX || {});
