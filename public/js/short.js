/*
 * LEXINODE — sortie « Short animé » : styles, storyboard, voix off, prompts image/vidéo par modèle.
 * La génération locale découpe la réflexion en scènes ; le mode IA (ai-engine.js) écrit le récit,
 * puis passe par les mêmes fonctions de mise en forme des prompts.
 */
(function (LX) {
  'use strict';
  const U = LX.U;
  const C = LX.content;

  LX.STYLES = {
    motion_flat: {
      nom: 'Motion design institutionnel (flat)',
      fr: 'motion design 2D flat, formes vectorielles nettes, transitions fluides, style film institutionnel',
      en: 'clean flat 2D motion design, crisp vector shapes, smooth eased transitions, subtle long shadows, institutional explainer film style',
      palette: ['#0B3C5D', '#328CC1', '#D9B310', '#F2F2F2', '#1D2731'], typo: 'sans-serif géométrique, chiffres en gras',
      cameras: ['slow push-in', 'lateral slide to the right', 'gentle zoom-out revealing the whole diagram', 'static frame, elements animate in one by one'],
      transitions: ['shape morph', 'brand-colour wipe', 'match cut on a circle', 'elements slide out, new ones slide in'],
      musique: 'nappe électronique légère, pulsation douce (90-100 BPM)', music_en: 'light electronic pad, soft pulse, 95 BPM',
    },
    isometrique: {
      nom: 'Isométrique 3D',
      fr: 'illustration isométrique 3D, monde miniature façon diorama, lumière douce, géométrie propre',
      en: 'isometric 3D illustration, miniature diorama world, soft global illumination, clean geometry, pastel tones',
      palette: ['#2D3047', '#419D78', '#E0A458', '#FFDBB5', '#C04ABC'], typo: 'sans-serif arrondie',
      cameras: ['slow orbit around the diorama', 'top-down isometric pan', 'tilt-shift push-in', 'rise up to reveal the whole miniature city'],
      transitions: ['tiles flip to reveal the next scene', 'camera flies through a building', 'blocks assemble / disassemble'],
      musique: 'marimba et percussions légères', music_en: 'playful marimba and light percussion',
    },
    whiteboard: {
      nom: 'Tableau blanc (whiteboard)',
      fr: 'animation tableau blanc, traits de feutre noir dessinés en direct, main qui dessine, accents de couleur',
      en: 'whiteboard animation, black marker lines drawn stroke by stroke on a white board, a hand drawing, few colour accents',
      palette: ['#FFFFFF', '#111111', '#E63946', '#1D3557', '#F1C40F'], typo: 'écriture manuscrite lisible',
      cameras: ['static board, the hand draws', 'pan across the board to the next drawing', 'zoom into a detail of the sketch'],
      transitions: ['the hand wipes the board', 'pan to a blank area', 'drawing transforms into the next one'],
      musique: 'guitare acoustique légère', music_en: 'light acoustic guitar',
    },
    papier: {
      nom: 'Papier découpé',
      fr: 'animation en papier découpé, couches de papier texturé, ombres portées, rendu artisanal',
      en: 'paper cut-out stop-motion, layered textured craft paper, soft drop shadows, handmade feel',
      palette: ['#F4EBD9', '#E76F51', '#2A9D8F', '#264653', '#E9C46A'], typo: 'serif chaleureuse',
      cameras: ['parallax push through paper layers', 'slow lateral pan', 'top-down static stop-motion'],
      transitions: ['paper layer slides away', 'page fold', 'cut-out shapes scatter and regroup'],
      musique: 'piano et glockenspiel', music_en: 'soft piano with glockenspiel',
    },
    dataviz: {
      nom: 'Infographie data-viz cinéma',
      fr: 'data-visualisation cinématographique, graphiques et compteurs animés, fond sombre, accents lumineux, grille précise',
      en: 'cinematic data visualisation, animated charts and counters, dark background, glowing accent colours, precise grid, depth of field',
      palette: ['#0D1B2A', '#1B263B', '#00B4D8', '#FFB703', '#E0E1DD'], typo: 'mono / sans-serif condensée, chiffres tabulaires',
      cameras: ['slow dolly along the chart', 'push-in on the key number', 'orbit around 3D bars', 'rack focus from axis to data point'],
      transitions: ['data points morph into the next chart', 'grid flip', 'light streak wipe'],
      musique: 'synthé atmosphérique, tension douce', music_en: 'atmospheric synth, gentle tension',
    },
    blueprint: {
      nom: 'Blueprint / schéma technique',
      fr: 'animation façon plan technique, traits blancs sur papier quadrillé bleu, annotations, vues éclatées',
      en: 'technical blueprint animation, white line drawings on deep blue grid paper, annotations and callouts, exploded diagrams',
      palette: ['#0A2463', '#1E5AA8', '#FFFFFF', '#A9D6E5', '#FB3640'], typo: 'technique / mono',
      cameras: ['top-down pan across the plan', 'zoom into an annotated detail', 'exploded view assembling'],
      transitions: ['lines redraw into next diagram', 'sheet slides', 'grid zoom'],
      musique: 'électronique minimaliste, tic-tac', music_en: 'minimal electronic, ticking rhythm',
    },
    clay: {
      nom: 'Clay 3D pédagogique',
      fr: 'rendu 3D pâte à modeler, formes arrondies et amicales, textures tactiles, style éducatif ludique',
      en: 'soft clay 3D render, rounded friendly shapes, tactile plasticine textures, playful educational style, studio lighting',
      palette: ['#FFCDB2', '#B5838D', '#6D6875', '#E5989B', '#A8DADC'], typo: 'sans-serif ronde et épaisse',
      cameras: ['slow push-in on the clay scene', 'turntable rotation', 'playful bounce zoom'],
      transitions: ['clay squash-and-stretch morph', 'objects roll out of frame', 'pop transition'],
      musique: 'ukulélé et claps', music_en: 'ukulele and hand claps',
    },
    collage: {
      nom: 'Archive / collage éditorial',
      fr: 'collage éditorial animé, photos d’archives, trames et textures de papier déchiré, ambiance documentaire',
      en: 'editorial collage animation, archival photo cut-outs, halftone textures, torn paper edges, documentary mood',
      palette: ['#EDE6D6', '#1B1B1B', '#C1121F', '#669BBC', '#FDF0D5'], typo: 'serif de presse + machine à écrire',
      cameras: ['slow Ken Burns zoom on the collage', 'parallax between cut-out layers', 'whip pan between documents'],
      transitions: ['torn paper reveal', 'newspaper page turn', 'halftone dissolve'],
      musique: 'contrebasse et cordes pizzicato', music_en: 'upright bass and pizzicato strings',
    },
  };

  const SCENES_BY_DUR = { 15: 4, 30: 5, 45: 6, 60: 7, 90: 9 };
  const WPS = 2.4; // mots par seconde, voix off française posée
  const VOIX_EN = { posée: 'calm, clear', dynamique: 'energetic, upbeat', chaleureuse: 'warm, friendly', solennelle: 'solemn, measured', ironique: 'dry, ironic' };

  // ------------------------------------------------------------ description des visuels
  function visualDesc(v, lang) {
    const fr = lang === 'fr';
    const q = (s) => '"' + U.truncateWords(U.stripMarks(String(s || '')), 8) + '"';
    const items = (v.items || []).map((i) => q(i.label));
    switch (v.type) {
      case 'chiffre': return fr ? `un grand compteur animé qui défile jusqu’à ${q((v.valeurTexte || '') + ' ' + (v.unite || ''))}, légende ${q(v.label)}` : `a large animated counter rolling up to ${q((v.valeurTexte || '') + ' ' + (v.unite || ''))}, caption ${q(v.label)}`;
      case 'barres': return fr ? `des barres comparatives qui poussent côte à côte, étiquetées ${items.join(' et ')}` : `comparative bar charts growing side by side, labelled ${items.join(' and ')}`;
      case 'courbes': return fr ? `deux courbes qui se tracent sur un même axe (base 100), étiquetées ${items.join(' et ')}` : `two line charts drawing themselves on a shared axis (index base 100), labelled ${items.join(' and ')}`;
      case 'pictos': return fr ? `une grille de pictogrammes : une icône de ${items[1] || 'B'} équilibrée par de nombreuses icônes de ${items[0] || 'A'} (${U.noEmoji(v.ratioWords || v.ratioText || '')})` : `an isotype pictogram grid: one icon for ${items[1] || 'B'} balanced against many icons for ${items[0] || 'A'} (ratio ${U.noEmoji(v.ratioWords || v.ratioText || '')})`;
      case 'nuage': return fr ? `un nuage de points animé : chaque point est une période, ${items[0] || 'A'} en abscisse et ${items[1] || 'B'} en ordonnée, une droite de tendance se trace, le coefficient « r = ${U.fmt(v.r, 2)} » apparaît` : `an animated scatter plot: each dot is a period, ${items[0] || 'A'} on the x axis and ${items[1] || 'B'} on the y axis, a trend line draws itself, the label "r = ${U.fmt(v.r, 2)}" appears`;
      case 'frise': return fr ? `une frise chronologique horizontale dont les points s’allument : ${(v.points || []).map((p) => q(p.date + ' ' + p.label)).join(', ')}` : `a horizontal timeline with dots lighting up one by one: ${(v.points || []).map((p) => q(p.date + ' ' + p.label)).join(', ')}`;
      case 'balance': return fr ? `une balance qui oscille entre ${items[0] || '"pour"'} et ${items[1] || '"contre"'}` : `a balance scale tilting between ${items[0] || '"for"'} and ${items[1] || '"against"'}`;
      case 'schema': return fr ? `un schéma de ${(v.boxes || []).length} encadrés reliés par des flèches : ${(v.boxes || []).map(q).join(' → ')}` : `a diagram of ${(v.boxes || []).length} connected boxes with arrows: ${(v.boxes || []).map(q).join(' → ')}`;
      case 'citation': return fr ? `une carte citation typographique : ${q(v.texte)}` : `a bold typographic quote card: ${q(v.texte)}`;
      case 'mots': return fr ? `des mots-clés qui apparaissent en étiquettes : ${(v.mots || []).map(q).join(', ')}` : `key words popping in as tags: ${(v.mots || []).map(q).join(', ')}`;
      default: return fr ? `un carton titre ${q(v.titre || v.texte)}` : `a bold title card ${q(v.titre || v.texte)}`;
    }
  }

  // ------------------------------------------------------------ prompts par modèle
  function prompts(scene, ctx) {
    const lang = ctx.langue === 'fr' ? 'fr' : 'en';
    const st = ctx.styleObj;
    const styleTxt = lang === 'fr' ? st.fr : st.en;
    const lexMotion = lang === 'fr' ? ctx.motion_fr : ctx.motion_en;
    const desc = scene.description || visualDesc(scene.visuel, lang);
    const motifs = (scene.motifs || []).map((m) => (lang === 'fr' ? m.fr : m.en)).filter(Boolean);
    const pal = ctx.palette.join(', ');
    const fmt = ctx.format;
    const ecran = U.noEmoji(scene.visuel && scene.visuel.ratioWords && /[\p{Extended_Pictographic}]/u.test(scene.texte_ecran || '') ? scene.visuel.ratioWords : scene.texte_ecran);
    const onScreen = ecran ? (lang === 'fr' ? `Texte à l’écran (français) : « ${ecran} »` : `On-screen text (French): "${ecran}"`) : '';
    const motifLine = motifs.length ? (lang === 'fr' ? 'Éléments graphiques : ' : 'Graphic elements: ') + motifs.join(', ') + '.' : '';
    const image = lang === 'fr'
      ? `${U.cap(styleTxt)}. ${U.cap(desc)}. ${motifLine} ${lexMotion ? lexMotion + '. ' : ''}Palette : ${pal}. Composition ${fmt}, espaces vides pour le texte, typographie nette, pas de texte parasite.`
      : `${U.cap(styleTxt)}. ${U.cap(desc)}. ${motifLine} ${lexMotion ? lexMotion + '. ' : ''}Colour palette: ${pal}. ${fmt} composition, clean negative space for text, crisp legible typography, no gibberish text.`;
    const voice = VOIX_EN[ctx.voix] || 'calm, clear';
    const vo = U.stripMarks(scene.vo);
    let video;
    switch (ctx.cible) {
      case 'veo':
        video = lang === 'fr'
          ? `${U.cap(styleTxt)}. ${U.cap(desc)}. Caméra : ${scene.camera}. ${motifLine} Palette ${pal}. ${onScreen}. Audio : voix off française, ton ${ctx.voix}, qui dit : « ${vo} ». Musique : ${st.musique}. Durée ${scene.duree} s, format ${fmt}.`
          : `${U.cap(styleTxt)}. ${U.cap(desc)}. Camera: ${scene.camera}. ${motifLine} Palette ${pal}. ${onScreen}. Audio: a ${voice} French voice-over says: "${vo}". Music: ${st.music_en}. ${scene.duree}s, ${fmt}.`;
        break;
      case 'kling':
        video = lang === 'fr'
          ? `${U.cap(desc)}, ${scene.camera}, ${styleTxt}, palette ${pal}, mouvement fluide, ${scene.duree} s. Négatif : texte déformé, flou, artefacts.`
          : `${U.cap(desc)}, ${scene.camera}, ${styleTxt}, palette ${pal}, smooth motion, ${scene.duree}s. Negative: distorted text, blur, artifacts, watermark.`;
        break;
      case 'wan30':
        video = `${U.cap(styleTxt)}. ${U.cap(desc)}.${motifs.length ? ' With ' + motifs.join(', ') + '.' : ''} The camera ${scene.camera}, about ${scene.duree} seconds. ${onScreen ? onScreen + '.' : ''} Light is even and graphic, every surface clean and unbranded. Palette ${pal}.`;
        break;
      case 'h3':
        video = `Shot ${scene.n} — ${scene.duree} seconds. Camera: ${scene.camera}. ${U.cap(desc)}.${onScreen ? ' ' + onScreen + '.' : ''}\n\nStyle: ${styleTxt}, palette ${pal}.\n\nAudio, native stereo: ${st.music_en}, soft interface sounds timed to the cut.\n\nSettings: ${fmt}, 2K, ${Math.max(4, scene.duree)} seconds.`;
        break;
      case 'seedance25':
      case 'seedance':
        video = lang === 'fr'
          ? `[${scene.debut}s–${scene.fin}s] Plan ${scene.n} : ${desc}. Caméra : ${scene.camera}. Style : ${styleTxt}. Palette ${pal}. ${onScreen}. Transition : ${scene.transition}.`
          : `[${scene.debut}s–${scene.fin}s] Shot ${scene.n}: ${desc}. Camera: ${scene.camera}. Style: ${styleTxt}. Palette ${pal}. ${onScreen}. Transition: ${scene.transition}.`;
        break;
      case 'runway':
        video = lang === 'fr'
          ? `${U.cap(scene.camera)} — ${desc}. ${U.cap(styleTxt)}. Palette ${pal}. ${onScreen}.`
          : `${U.cap(scene.camera)} — ${desc}. ${U.cap(styleTxt)}. Palette ${pal}. ${onScreen}.`;
        break;
      case 'sora':
        video = lang === 'fr'
          ? `Dans un univers en ${styleTxt}, ${desc}. La caméra : ${scene.camera}. ${motifLine} Les couleurs dominantes : ${pal}. ${onScreen}. Le plan dure ${scene.duree} secondes et se termine par : ${scene.transition}.`
          : `In a world rendered as ${styleTxt}, ${desc}. The camera moves: ${scene.camera}. ${motifLine} Dominant colours: ${pal}. ${onScreen}. The shot lasts ${scene.duree} seconds and ends with: ${scene.transition}.`;
        break;
      case 'opensource':
        video = (lang === 'fr'
          ? `${U.cap(desc)}. ${styleTxt}. ${scene.camera}. Palette ${pal}. Haute qualité, mouvement fluide.\nNégatif : texte illisible, déformation, scintillement, flou, filigrane, basse qualité.`
          : `${U.cap(desc)}. ${styleTxt}. ${scene.camera}. Palette ${pal}. High quality, smooth motion.\nNegative: unreadable text, deformation, flicker, blur, watermark, low quality.`);
        break;
      default:
        video = lang === 'fr'
          ? `${U.cap(styleTxt)}. Scène ${scene.n} (${scene.duree} s) : ${desc}. Caméra : ${scene.camera}. ${motifLine} Transition de sortie : ${scene.transition}. Palette ${pal}. ${onScreen}. Format ${fmt}.`
          : `${U.cap(styleTxt)}. Scene ${scene.n} (${scene.duree}s): ${desc}. Camera: ${scene.camera}. ${motifLine} Outgoing transition: ${scene.transition}. Palette ${pal}. ${onScreen}. Aspect ratio ${fmt}.`;
    }
    return { image: image.replace(/\s+/g, ' ').replace(/\.\s*\./g, '.').trim(), video: video.replace(/[ \t]+/g, ' ').replace(/\.\s*\./g, '.').trim() };
  }

  // ------------------------------------------------------------ contexte (style, palette, langages)
  function context(node, inp) {
    const d = node.data;
    const items = C.items(inp.contenu);
    const style = C.first(inp.style);
    const brief = C.first(inp.brief);
    let lexIds = C.items(inp.lexiques).flatMap((x) => x.ids || []);
    if (!lexIds.length) lexIds = items.flatMap((i) => i.lexiques || []);
    const lexes = Array.from(new Set(lexIds)).map((id) => LX.lex.get(id)).filter((l) => l && l.id !== 'neutre');
    const styleKey = style ? style.style : 'motion_flat';
    const styleObj = LX.STYLES[styleKey] || LX.STYLES.motion_flat;
    const palette = style && style.palette && style.palette.length ? style.palette : lexes[0] ? lexes[0].visuel.palette : styleObj.palette;
    return {
      d, items, brief, lexes, styleKey, styleObj, palette,
      motion_en: (style && style.motion_en) || (lexes[0] && lexes[0].visuel.style_motion_en) || '',
      motion_fr: (style && style.motion_fr) || (lexes[0] && lexes[0].visuel.style_motion) || '',
      typo: (style && style.typo) || styleObj.typo, ambiance: (style && style.ambiance) || '',
      duree: Number(d.duree) || 45, format: d.format || '9:16', voix: d.voix || 'posée', cible: d.cible || 'generique', langue: d.langue || 'en',
    };
  }

  // ------------------------------------------------------------ « temps forts » à partir du contenu
  function beatsFrom(items) {
    const beats = [];
    const refl = items.find((i) => i.kind === 'reflexion');
    const mat = (refl && refl.materiaux) || {};
    const comps = items.filter((i) => i.kind === 'comparaison').concat(mat.comparaisons || []);
    const datas = items.filter((i) => i.kind === 'donnee').concat(mat.donnees || []);
    const events = C.events(items.concat((mat.evenements || []).map((e) => Object.assign({ kind: 'evenement' }, e, { chronologie: [e] }))));
    if (refl) {
      for (const e of refl.etapes || []) beats.push({ titre: e.titre, role: e.role, texte: e.texte, lex: e.lex });
    } else {
      for (const t of items.filter((i) => i.kind === 'texte')) {
        if (t.tours) for (const tr of t.tours.filter((x) => x.voix !== 'moderateur')) beats.push({ titre: tr.nom, role: 'analyse', texte: tr.texte, lex: tr.voix, speaker: tr });
        else {
          const ss = U.sentences(t.texte.replace(/\n+/g, ' '));
          for (let i = 0; i < ss.length; i += 2) beats.push({ titre: t.titre, role: i === 0 ? 'contexte' : 'analyse', texte: ss.slice(i, i + 2).join(' ') });
        }
      }
      if (events.length) beats.unshift({ titre: 'Chronologie', role: 'contexte', texte: events.map((e) => `${LX.localHelpers.dateLabel(e.date)} : ${e.titre}.`).join(' ') });
      for (const dt of items.filter((i) => i.kind === 'donnee')) beats.push({ titre: dt.libelle, role: 'faits', texte: `${U.cap(dt.libelle)} : ${C.valueText(dt)}.`, data: dt });
      for (const c of items.filter((i) => i.kind === 'comparaison')) beats.push({ titre: c.titre, role: 'analyse', texte: c.resume, comp: c }, { titre: 'Conclusion', role: 'conclusion', texte: U.sentence(c.conclusion), comp: c });
    }
    return { beats, refl, comps, datas, events };
  }

  function visualFor(beat, ctx2, r, used) {
    const { comps, datas, events } = ctx2;
    const plain = U.stripMarks(beat.texte);
    const comp = beat.comp || ((beat.role === 'analyse' || beat.role === 'faits') && !used.comp ? comps[0] : null);
    if (beat.role === 'contexte' && events.length && !used.frise) {
      used.frise = true;
      return { type: 'frise', points: events.slice(0, 6).map((e) => ({ date: e.date || '', label: U.truncateWords(e.titre, 5) })) };
    }
    if (comp && comp.visuel && (comp.visuel.items || []).length) {
      used.comp = true;
      return JSON.parse(JSON.stringify(comp.visuel));
    }
    if (beat.role === 'tension') {
      const c = comps[0];
      return { type: 'balance', items: c ? [{ label: c.a.libelle, emoji: ((c.visuel || {}).items || [])[0] && c.visuel.items[0].emoji }, { label: c.b.libelle, emoji: ((c.visuel || {}).items || [])[1] && c.visuel.items[1].emoji }] : [{ label: 'pour', emoji: '👍' }, { label: 'contre', emoji: '👎' }] };
    }
    const dt = beat.data || (beat.role === 'faits' && !used.data ? datas[0] : null);
    if (dt && (dt.valeur != null || (dt.serie && dt.serie.length))) {
      used.data = true;
      if (!beat.data && datas.length >= 2) {
        return { type: 'barres', items: datas.slice(0, 3).map((x) => ({ label: x.libelle, value: x.valeur != null ? x.valeur : x.serie.reduce((s, p) => s + p.y, 0), unite: x.unite, emoji: U.emojiFor(x.libelle) })) };
      }
      const val = dt.valeur != null ? dt.valeur : dt.serie.reduce((s, p) => s + p.y, 0);
      return { type: 'chiffre', valeur: val, valeurTexte: U.fmtBig(val), unite: dt.unite, label: dt.libelle, emoji: U.emojiFor(dt.libelle + ' ' + dt.unite) };
    }
    if (beat.role === 'hypothese' || beat.role === 'decision' || beat.role === 'projection') {
      const ss = U.sentences(plain).slice(0, 3).map((x) => U.truncateWords(x.replace(/[.!?]$/, ''), 5));
      return { type: 'schema', boxes: ss.length >= 2 ? ss : [beat.titre, 'action', 'effet'] };
    }
    if (beat.role === 'conclusion') return { type: 'citation', texte: U.truncateWords(U.sentences(plain)[0] || plain, 18) };
    const terms = LX.lex.termsIn(beat.texte).map((t) => t.terme);
    if (beat.speaker) return { type: 'citation', texte: U.truncateWords(U.sentences(plain)[0] || plain, 16) };
    if (terms.length >= 2) return { type: 'mots', mots: terms.slice(0, 5) };
    const numMatch = plain.match(/(\d[\d\s.,]*(?:\s?(?:millions?|milliards?|%))?)/);
    if (numMatch) return { type: 'chiffre', valeur: U.parseNum(numMatch[1]), valeurTexte: numMatch[1].trim(), unite: '', label: U.truncateWords(beat.titre, 5) };
    return { type: 'titre', titre: beat.titre };
  }

  // Coupe un texte à ~maxWords en respectant phrases puis propositions (jamais au milieu d'un groupe de mots)
  function clauseCut(text, maxWords) {
    const ss = U.sentences(U.stripMarks(text));
    let out = '';
    for (const s1 of ss) {
      const next = out ? out + ' ' + s1 : s1;
      if (U.words(next).length > maxWords) break;
      out = next;
    }
    if (out && U.words(out).length >= maxWords * 0.45) return out;
    const first = ss[out ? U.sentences(out).length : 0] || ss[0] || U.stripMarks(text);
    const parts = first.split(/(?<=[,;:])\s+/);
    let acc = out;
    for (const p of parts) {
      const next = acc ? acc + ' ' + p : p;
      if (U.words(next).length > maxWords && U.words(acc).length >= maxWords * 0.45) break;
      if (U.words(next).length > maxWords * 1.6) break;
      acc = next;
    }
    if (!acc) acc = U.truncateWords(first, maxWords).replace(/…$/, '');
    if ((acc.match(/\(/g) || []).length > (acc.match(/\)/g) || []).length) acc = acc.replace(/\s*\([^)]*$/, ''); // pas de parenthèse ouverte
    return U.sentence(acc.replace(/\s*[,;:]\s*$/, ''));
  }

  // ------------------------------------------------------------ génération locale
  function generate(node, inp) {
    const ctx = context(node, inp);
    const r = U.rng(U.hash(node.id) + (Number(ctx.d.seed) || 1) * 7919);
    if (!ctx.items.length) throw new Error('Branchez une Réflexion (ou un texte, une comparaison…) sur l’entrée « contenu ».');
    const B = beatsFrom(ctx.items);
    const D = ctx.duree;
    const nScenes = SCENES_BY_DUR[D] || Math.max(4, Math.round(D / 8));
    let mid = B.beats.slice();
    const slots = Math.max(1, nScenes - 2);
    while (mid.length > slots) { // fusionne les temps forts voisins les plus courts
      let best = 0, bestLen = Infinity;
      for (let i = 0; i < mid.length - 1; i++) {
        const l = U.words(mid[i].texte).length + U.words(mid[i + 1].texte).length;
        if (l < bestLen) { bestLen = l; best = i; }
      }
      const a = mid[best], b = mid[best + 1];
      mid.splice(best, 2, { titre: a.titre, role: a.role, texte: a.texte + ' ' + b.texte, data: a.data || b.data, comp: a.comp || b.comp, lex: a.lex, speaker: a.speaker });
    }
    if (!mid.length) mid = [{ titre: 'Le propos', role: 'analyse', texte: ctx.items.map(C.text).join(' ') }];
    const refl = B.refl;
    const comp = B.comps[0];
    const H = LX.localHelpers;
    // accroche
    let hook;
    if (comp && (comp.mode === 'correlation' || comp.mode === 'hypotheses')) {
      hook = { visuel: JSON.parse(JSON.stringify(comp.visuel)), vo: `${U.cap(H.withArticle(comp.a.libelle))} et ${H.withArticle(comp.b.libelle)} : un lien ?`, texte_ecran: comp.chiffres && comp.chiffres.correlation != null ? `r = ${U.fmt(comp.chiffres.correlation, 2)}` : 'Quel lien ?' };
    } else if (comp && comp.chiffres && comp.chiffres.ratio) {
      hook = { visuel: JSON.parse(JSON.stringify(comp.visuel)), vo: `${U.cap(H.withArticle(comp.a.libelle))} et ${H.withArticle(comp.b.libelle)} : quel rapport ?`, texte_ecran: (comp.visuel && comp.visuel.ratioText) || 'Quel rapport ?' };
      if (hook.visuel.type === 'courbes') hook.visuel = { type: 'pictos', items: comp.visuel.items, ratio: comp.visuel.ratio, ratioText: comp.visuel.ratioText, ratioWords: comp.visuel.ratioWords };
    } else if (B.datas[0] && C.valueText(B.datas[0])) {
      const dt = B.datas[0];
      const val = dt.valeur != null ? dt.valeur : (dt.serie || []).reduce((s1, p) => s1 + p.y, 0);
      hook = { visuel: { type: 'chiffre', valeur: val, valeurTexte: U.fmtBig(val), unite: dt.unite, label: dt.libelle, emoji: U.emojiFor(dt.libelle) }, vo: `${U.cap(C.valueText(dt, true))}. Voilà le point de départ.`, texte_ecran: C.valueText(dt, true) };
    } else {
      const titre = refl ? refl.titre : C.title(ctx.items[0]);
      hook = { visuel: { type: 'titre', titre }, vo: U.sentence(U.stripMarks(refl ? refl.these : titre)), texte_ecran: U.truncateWords(titre, 6) };
    }
    const used = { comp: !!(comp && comp.visuel && hook.visuel && hook.visuel.type === comp.visuel.type) };
    const concl = refl ? U.stripMarks(refl.conclusion) : comp ? U.sentence(comp.conclusion) : '';
    const conf = refl && refl.confiance ? refl.confiance : null;
    const mention = conf && ['fiction', 'démonstration'].includes(conf.niveau) ? 'Chiffres fictifs — démonstration'
      : conf && conf.niveau === 'moyenne' ? 'Certaines valeurs sont des estimations' : B.datas.some((x) => x.statut === 'fictif') ? 'Chiffres fictifs — démonstration' : '';

    // budgets de mots (≈ 2,4 mots/s), puis minutage calé sur la voix off
    const hookWords = Math.round(D * 0.1 * WPS) + 4;
    const outWords = Math.round(D * 0.15 * WPS) + 4;
    const midWords = Math.max(8, Math.round(((D * WPS) - hookWords - outWords) / mid.length));
    const beats = [{ titre: 'Accroche', role: 'accroche', vo: clauseCut(hook.vo, hookWords), texte_ecran: hook.texte_ecran, visuel: hook.visuel }]
      .concat(mid.map((b) => ({ titre: b.titre, role: b.role, texte: b.texte, lex: b.lex, visuel: visualFor(b, B, r, used), data: b.data, vo: clauseCut(b.texte, midWords) })));
    beats.push({ titre: 'Ce qu’il faut retenir', role: 'outro', vo: concl ? clauseCut(concl, outWords) : 'Voilà ce qu’il faut retenir.', texte_ecran: mention || 'À retenir', visuel: { type: 'citation', texte: U.truncateWords(clauseCut(concl || (refl && refl.titre) || '', 16), 16) } });
    const raw = beats.map((b) => Math.max(3, U.words(b.vo).length / WPS + 0.8));
    const k = D / raw.reduce((s1, x) => s1 + x, 0);
    let t = 0;
    const lexAll = ctx.lexes;
    const scenes = beats.map((b, i) => {
      let dur = Math.max(2, Math.round(raw[i] * k));
      if (i === beats.length - 1) dur = Math.max(2, D - t);
      const terms = LX.lex.termsIn(b.texte || '').map((x) => x.terme);
      const v = b.visuel;
      const pts = v.points || [];
      const texte_ecran = b.texte_ecran || (v.type === 'chiffre' ? U.withUnit(v.valeurTexte, v.unite)
        : v.type === 'pictos' && v.ratioText ? v.ratioText
          : v.type === 'frise' && pts.length ? (pts.length > 1 ? `${pts[0].date} → ${pts[pts.length - 1].date}` : `${pts[0].date}`)
            : v.type === 'courbes' && comp && comp.chiffres && comp.chiffres.correlation != null ? `Corrélation r = ${U.fmt(comp.chiffres.correlation, 2)}`
              : v.type === 'barres' && (v.items || []).length >= 2 ? `${U.truncateWords(v.items[0].label, 3)} vs ${U.truncateWords(v.items[1].label, 3)}`
                : terms[0] ? U.cap(terms[0]) : U.truncateWords(b.titre, 6));
      const lx = (b.lex && LX.lex.byId[b.lex]) || lexAll[i % Math.max(1, lexAll.length)] || null;
      const motifs = lx ? r.sample(lx.visuel.motifs, 2) : [];
      const pictos = lx ? r.sample(lx.visuel.pictogrammes, 2) : [];
      const elements = [visualDesc(v, 'fr')].concat(motifs.map((m) => m.fr), pictos.map((p) => 'pictogramme ' + p.fr));
      const scene = {
        n: i + 1, titre: b.titre, role: b.role, debut: t, fin: t + dur, duree: dur, vo: b.vo, texte_ecran,
        visuel: v, elements_graphiques: elements, motifs: motifs.concat(pictos), lex: lx ? lx.id : null,
        camera: r.pick(ctx.styleObj.cameras), transition: i === beats.length - 1 ? 'fade to the end card' : r.pick(ctx.styleObj.transitions),
      };
      t += dur;
      scene.prompts = prompts(scene, ctx);
      return scene;
    });
    return finalize(scene2script(scenes, ctx, refl, mention), ctx);
  }

  function scene2script(scenes, ctx, refl, mention) {
    const titre = refl ? refl.titre : C.title(ctx.items[0]) || 'Short';
    return {
      titre, logline: refl ? U.stripMarks(refl.these) : U.sentence(U.stripMarks(C.text(ctx.items[0])).slice(0, 180)),
      duree: ctx.duree, format: ctx.format, style: ctx.styleKey, styleNom: ctx.styleObj.nom, palette: ctx.palette,
      voix: ctx.voix, cible: ctx.cible, langue: ctx.langue, lexiques: ctx.lexes.map((l) => l.id), scenes, mention,
    };
  }

  // Complète un script (local ou IA) : bible visuelle, prompts manquants, export Markdown
  function finalize(script, ctx) {
    const st = ctx.styleObj;
    script.bible = script.bible || {};
    const b = script.bible;
    b.style_prompt = b.style_prompt || `${st.en}${ctx.motion_en ? ', ' + ctx.motion_en.replace(/[.\s]+$/, '') : ''}. Palette ${ctx.palette.join(', ')}. Typography: ${ctx.typo}.${ctx.ambiance ? ' Mood: ' + ctx.ambiance + '.' : ''}`;
    b.motion_en = b.motion_en || (ctx.motion_en || '').replace(/[.\s]+$/, '');
    b.style_fr = b.style_fr || `${st.fr}${ctx.motion_fr ? ' ; ' + ctx.motion_fr.replace(/[.\s]+$/, '') : ''}. Typographie : ${ctx.typo}.`;
    b.musique = b.musique || st.musique;
    b.voix = b.voix || `Voix off française, ton ${ctx.voix}, débit ~${WPS * 60} mots/min.`;
    b.regles = b.regles || [
      'Un seul message principal par scène.',
      'Chaque chiffre affiché à l’écran porte sa source ou la mention « estimation ».',
      'Texte à l’écran court (6 mots max), lisible sur mobile.',
      'Les éléments de langage des métiers sont mis en valeur typographiquement.',
    ];
    if (script.mention) b.regles.push(`Mention obligatoire en fin de film : « ${script.mention} ».`);
    for (const s of script.scenes) {
      s.visuel = s.visuel || { type: 'titre', titre: s.titre };
      if (!s.prompts || !s.prompts.image || !s.prompts.video) s.prompts = prompts(s, ctx);
      s.elements_graphiques = s.elements_graphiques || [visualDesc(s.visuel, 'fr')];
    }
    script.markdown = toMarkdown(script);
    return script;
  }

  function toMarkdown(s) {
    const L = [];
    L.push(`# ${s.titre}`, '', `> ${s.logline || ''}`, '');
    L.push(`- **Durée** : ${s.duree} s · **Format** : ${s.format} · **Style** : ${s.styleNom || s.style} · **Voix** : ${s.voix}`);
    L.push(`- **Palette** : ${(s.palette || []).join(', ')}`);
    if (s.lexiques && s.lexiques.length) L.push(`- **Langages** : ${s.lexiques.map((id) => LX.lex.get(id).nom).join(', ')}`);
    L.push('', '## Bible visuelle', '', '```', s.bible.style_prompt, '```', '');
    L.push(`- Musique : ${s.bible.musique}`, `- Voix : ${s.bible.voix}`);
    for (const r of s.bible.regles || []) L.push(`- ${r}`);
    L.push('', '## Scènes', '');
    for (const sc of s.scenes) {
      L.push(`### ${sc.n}. ${sc.titre}  (${sc.debut}–${sc.fin} s)`, '');
      L.push(`**Voix off** : ${U.stripMarks(sc.vo)}`, '');
      L.push(`**Texte à l’écran** : ${sc.texte_ecran}`, '');
      L.push(`**Éléments graphiques** : ${(sc.elements_graphiques || []).join(' ; ')}`, '');
      L.push(`**Caméra** : ${sc.camera} · **Transition** : ${sc.transition}`, '');
      L.push('**Prompt image (keyframe)**', '', '```', sc.prompts.image, '```', '');
      L.push('**Prompt vidéo**', '', '```', sc.prompts.video, '```', '');
    }
    if (s.mention) L.push(`---`, `_${s.mention}_`);
    return L.join('\n');
  }

  LX.short = { generate, context, prompts, finalize, visualDesc, toMarkdown, beatsFrom, clauseCut, SCENES_BY_DUR, WPS };
  LX.local.short = generate;
})(window.LX = window.LX || {});
