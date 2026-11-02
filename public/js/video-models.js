/*
 * LEXINODE — profils des modèles vidéo (règles tirées des skills de prompting Wan 3.0, Seedance 2.5, MiniMax H3)
 * et node « Générateur vidéo » : découpe le script du short en segments de 15 ou 30 s, puis écrit
 * un prompt par segment dans la grammaire propre au modèle choisi.
 * Specs à revérifier régulièrement : ces modèles évoluent vite (état connu : août 2026).
 */
(function (LX) {
  'use strict';
  const U = LX.U;

  const clean = (s) => U.noEmoji(U.stripMarks(String(s || ''))).replace(/\s+/g, ' ').replace(/—|–/g, ', ').trim();
  const q = (s) => clean(s).replace(/"/g, '\'');
  // description visuelle anglaise d'une scène (celle écrite par l'IA, sinon celle déduite du visuel)
  const sceneVisual = (sc) => clean(sc.description || LX.short.visualDesc(sc.visuel || { type: 'titre', titre: sc.titre }, 'en'));
  const motifsEn = (sc) => (sc.motifs || []).map((m) => m.en).filter(Boolean).filter((m) => !/logo|flag|marianne/i.test(m));
  // texte à l'écran sans émojis (les pictos de l'animatique deviennent des mots)
  const ecran = (sc) => {
    const t = sc.texte_ecran || '';
    const v = sc.visuel || {};
    return clean(v.ratioWords && /\p{Extended_Pictographic}/u.test(t) ? v.ratioWords : t);
  };
  const VOICE_EN = { posée: 'calm, measured', dynamique: 'energetic, upbeat', chaleureuse: 'warm, friendly', solennelle: 'solemn, grave', ironique: 'dry, deadpan, ironic' };

  // Répartit une durée entière entre des parts proportionnelles, avec un minimum par part
  function intSplit(weights, total, min) {
    const n = weights.length;
    const tot = weights.reduce((s, w) => s + w, 0) || n;
    let out = weights.map((w) => Math.max(min, Math.floor((w / tot) * total)));
    let diff = total - out.reduce((s, x) => s + x, 0);
    let i = 0;
    while (diff !== 0 && i < 500) {
      const k = i % n;
      if (diff > 0) { out[k]++; diff--; } else if (out[k] > min) { out[k]--; diff++; }
      i++;
    }
    return out;
  }

  // ------------------------------------------------------------------ profils
  const M = {};

  M.wan30 = {
    id: 'wan30', nom: 'Wan 3.0 (Alibaba)', maxDuree: 30, minDuree: 2, promptMax: 20000, maxShots: 6,
    ratios: ['16:9', '9:16', '1:1', '4:3', '3:4'], resolutions: ['1080P', '720P', '480P'], defResolution: '1080P',
    regles: [
      'Un seul bloc de texte, au présent, chronologique, façon note de tournage (pas de liste de tags).',
      'Six blocs dans l’ordre : intention et format, verrouillage du sujet (25 premiers mots), actions, décor et lumière, caméra, audio.',
      'Multi-plans : « Cut to. » entre les plans, puis ré-ancrer le sujet en une courte proposition. Compter 5 à 7 s par plan.',
      'Plan long : chemin de caméra continu avec des « stations » (station puis mouvement), pas de timecodes.',
      'Pas de champ de prompt négatif : formuler les exclusions positivement, jusqu’à trois fois si critique.',
      'Pas d’adjectifs empilés en fin de prompt (« cinematic, 8k »), pas de « tripod » (écrire « static » ou « locked off »).',
      'Durée 2 à 30 s par génération, audio natif (dialogue entre guillemets, locuteur nommé).',
    ],
    falId: 'alibaba/wan-3.0/text-to-video', prix: { '480p': 0.05, '720p': 0.10, '1080p': 0.20 },
    falTemplate: '{"prompt": "{prompt}", "duration": {duration}, "aspect_ratio": "{ratio}", "resolution": "{resolution}", "audio": true}',
    compose(seg, ctx) {
      const shots = seg.shots;
      const multi = shots.length > 1;
      const L = [];
      L.push(`${multi ? `A ${seg.duree}-second explainer sequence in ${shots.length} shots, clean cuts` : 'One continuous take, no cuts'}, institutional animated explainer intent: ${clean(ctx.styleEn)}.`);
      L.push(`Visual identity locked for every shot: palette ${ctx.palette.join(', ')}, ${clean(ctx.typo || 'clean geometric sans-serif typography')}, flat graphic shapes, the same recurring pictograms and colour coding from start to finish.`);
      shots.forEach((sh, i) => {
        const sc = sh.scene;
        const parts = [];
        if (i > 0) parts.push('Cut to.');
        parts.push(`${i > 0 ? 'Same graphic world, same palette. ' : ''}${U.cap(sceneVisual(sc))}${motifsEn(sc).length ? ', with ' + motifsEn(sc).join(', ') : ''}.`);
        if (ecran(sc)) parts.push(`A bold caption appears on screen and reads "${q(ecran(sc))}".`);
        parts.push(`Camera move: ${clean(sc.camera || 'static frame')}, about ${sh.duree} seconds on this shot.`);
        L.push(parts.join(' '));
      });
      L.push('Light is even and graphic, soft shadows, no photographic grain. Every surface in the frame is clean, flat and unbranded, the only text on screen is the captions described above.');
      const voice = VOICE_EN[ctx.voix] || 'calm, measured';
      const vo = shots.map((sh) => clean(sh.scene.vo)).filter(Boolean).join(' ');
      if (ctx.voMode === 'native' && vo) L.push(`Audio: an off-screen French narrator, ${voice} voice, says: "${q(vo)}" Under the voice, ${clean(ctx.musicEn)}, low in the mix, and soft interface sound effects on each graphic appearance.`);
      else L.push(`Audio: ${clean(ctx.musicEn)}, and soft interface sound effects on each graphic appearance. No voice, no dialogue: the voice-over is added in the edit.`);
      if (seg.mention) L.push(`The final frame holds the caption "${q(seg.mention)}".`);
      return L.join('\n\n');
    },
    directPayload(seg, prompt, ctx) {
      return { model: 'wan3.0-video', input: { prompt }, parameters: { resolution: ctx.resolution || '1080P', ratio: ctx.ratio, duration: seg.duree, audio: true, ...(ctx.seed ? { seed: ctx.seed } : {}) } };
    },
  };

  M.seedance25 = {
    id: 'seedance25', nom: 'Seedance 2.5 (ByteDance)', maxDuree: 30, minDuree: 4, promptMax: 6000, maxShots: 6,
    ratios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'], resolutions: ['1080p', '720p', '480p'], defResolution: '1080p',
    regles: [
      'Formule officielle en prose : sujet + action + décor + style visuel + caméra + son.',
      'Une passe continue jusqu’à 30 s découpée en temps forts (beats) avec plages horaires « 0–6 s : … » (tenue ±1 s).',
      'Chaque beat : un état initial, un seul événement principal, un état final observable.',
      'Coupe nommée explicitement : « Cut on … to a medium shot, same room, same light ».',
      'Audio en crochets dédiés : musique ( ), bruitages < >, dialogue { }, texte à l’écran 【 】, sans jamais les mélanger.',
      'Dialogue : ~2,5 mots par seconde ; préciser langue, voix, intention. Le français n’est pas confirmé : prévoir un repli.',
      'Exclusions en phrases de préservation (« Do not change… »), silence à demander explicitement.',
    ],
    falId: 'bytedance/seedance-2.5/text-to-video', prix: { '480p': 0.2205, '720p': 0.473, '1080p': 1.164 },
    falTemplate: '{"prompt": "{prompt}", "duration": "{duration}", "aspect_ratio": "{ratio}", "resolution": "{resolution}", "generate_audio": true}',
    compose(seg, ctx) {
      const L = [];
      L.push(`An institutional animated explainer, ${seg.duree} seconds, one continuous pass with clean graphic cuts. Visual style: ${clean(ctx.styleEn)}. Palette ${ctx.palette.join(', ')}, ${clean(ctx.typo || 'geometric sans-serif typography')}.`);
      const voice0 = VOICE_EN[ctx.voix] || 'calm, measured';
      if (ctx.voMode === 'native') L.push(`Dialogue language: French. An off-screen narrator, ${voice0} voice, clear diction, speaks the lines in {}.`);
      let t = 0;
      seg.shots.forEach((sh, i) => {
        const sc = sh.scene;
        const a = t, b = t + sh.duree;
        t = b;
        const parts = [`${a}–${b} s: ${U.cap(sceneVisual(sc))}${motifsEn(sc).length ? ', with ' + motifsEn(sc).join(', ') : ''}.`];
        parts.push(`Camera: ${clean(sc.camera || 'static frame')}.`);
        if (ecran(sc)) parts.push(`【${ecran(sc)}】`);
        if (ctx.voMode === 'native' && clean(sc.vo)) parts.push(`The off-screen narrator says: {${clean(sc.vo)}}`);
        if (i < seg.shots.length - 1) parts.push(`At ${b} s, cut on the graphic movement to the next shot, same palette, same graphic world.`);
        L.push(parts.join(' '));
      });
      const audio = [`(${clean(ctx.musicEn)}, low in the mix)`, '<soft interface pops on each graphic appearance>'];
      if (ctx.voMode !== 'native') audio.push('No dialogue, no voice: the voice-over is added in the edit.');
      L.push(audio.join(' '));
      if (seg.mention) L.push(`【${clean(seg.mention)}】 stays on the final frame.`);
      L.push('Do not change the palette or the graphic style between shots. No photorealistic skin, no 3D render look, no extra text beyond the captions in 【】.');
      return L.join('\n');
    },
    directPayload: null,
  };

  M.h3 = {
    id: 'h3', nom: 'MiniMax H3 (Hailuo 3.0)', maxDuree: 15, minDuree: 4, promptMax: 7000, maxShots: 7,
    ratios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'], resolutions: ['2K'], defResolution: '2K',
    regles: [
      'Blocs séparés par des lignes vides : (références), style, un bloc par plan, audio, réglages.',
      'Plan : « Shot N — X seconds. Camera: objectif, support, mouvement. Une seule action visible. »',
      'Durées en secondes entières, ≥ 2 s par plan, somme exactement égale à la durée demandée ; 7 plans maximum sur 15 s.',
      'Varier objectif, support et mouvement d’un plan à l’autre.',
      'Bloc audio obligatoire, interdiction en premier (sinon le modèle ajoute une musique).',
      'Pas de timecodes, pas de champ de prompt négatif (les interdits vont dans les blocs).',
      'Durée 4 à 15 s par génération, 2K, 24 i/s, audio stéréo natif ; ratio obligatoire en texte seul (pas « adaptive »).',
    ],
    falId: 'minimax/hailuo-03/text-to-video', prix: null,
    falTemplate: '{"prompt": "{prompt}", "duration": {duration}, "aspect_ratio": "{ratio}"}',
    compose(seg, ctx) {
      const B = [];
      B.push(`Style: ${clean(ctx.styleEn)}, an institutional animated explainer built from flat graphic elements. Palette ${ctx.palette.join(', ')}. ${clean(ctx.typo || 'Geometric sans-serif typography')}. Global rule: every shot stays in the same graphic world and palette, the only text on screen is the captions written below.`);
      const lenses = ['35mm', '50mm', '24mm', '85mm', '35mm', '50mm', '24mm'];
      seg.shots.forEach((sh, i) => {
        const sc = sh.scene;
        B.push(`Shot ${i + 1} — ${sh.duree} seconds. Camera: ${lenses[i % lenses.length]} look, ${clean(sc.camera || 'static frame')}. ${U.cap(sceneVisual(sc))}.${ecran(sc) ? ` On-screen caption: "${q(ecran(sc))}".` : ''}`);
      });
      const voice = VOICE_EN[ctx.voix] || 'calm, measured';
      const vo = seg.shots.map((sh) => clean(sh.scene.vo)).filter(Boolean).join(' ');
      if (ctx.voMode === 'native' && vo) B.push(`Audio, native stereo: an off-screen French narrator, ${voice} voice, says: "${q(vo)}" Music: ${clean(ctx.musicEn)}, entering softly under the voice. Soft interface sounds on each graphic appearance, timed to the cuts.`);
      else B.push(`Audio, native stereo: NO VOICE, no dialogue at any point. Music: ${clean(ctx.musicEn)}, entering from the first shot. Soft interface sounds on each graphic appearance, timed to the cuts.`);
      if (seg.mention) B.push(`The last shot ends on the caption "${q(seg.mention)}".`);
      B.push(`Settings: ${ctx.ratio}, 2K, ${seg.duree} seconds.`);
      return B.join('\n\n');
    },
    directPayload(seg, prompt, ctx) {
      return { model: 'MiniMax-H3', content: [{ type: 'text', text: prompt }], resolution: '2K', duration: seg.duree, ratio: ctx.ratio };
    },
  };

  // ------------------------------------------------------------------ découpage du script en segments
  function segment(script, modele, cible) {
    const P = M[modele];
    const L = Math.min(Number(cible) || 15, P.maxDuree);
    const scenes = (script.scenes || []).map((s) => Object.assign({}, s));
    // une scène plus longue que le segment est coupée en parties
    const parts = [];
    for (const sc of scenes) {
      if (sc.duree <= L) { parts.push(sc); continue; }
      const k = Math.ceil(sc.duree / L);
      const ss = U.sentences(U.stripMarks(sc.vo));
      for (let i = 0; i < k; i++) {
        parts.push(Object.assign({}, sc, { duree: Math.round(sc.duree / k), titre: `${sc.titre} (${i + 1}/${k})`, vo: ss.slice(Math.floor((i * ss.length) / k), Math.floor(((i + 1) * ss.length) / k)).join(' ') }));
      }
    }
    const segs = [];
    let cur = [], dur = 0;
    for (const sc of parts) {
      if (cur.length && (dur + sc.duree > L || cur.length >= P.maxShots)) { segs.push(cur); cur = []; dur = 0; }
      cur.push(sc); dur += sc.duree;
    }
    if (cur.length) segs.push(cur);
    // segment final trop court : on le fusionne avec le précédent si possible
    if (segs.length > 1) {
      const last = segs[segs.length - 1], prev = segs[segs.length - 2];
      const dl = last.reduce((s, x) => s + x.duree, 0), dp = prev.reduce((s, x) => s + x.duree, 0);
      if (dl < P.minDuree + 1 && dl + dp <= P.maxDuree && prev.length + last.length <= P.maxShots) { prev.push(...last); segs.pop(); }
    }
    let t = 0;
    return segs.map((list, i) => {
      const total = Math.max(P.minDuree, Math.min(P.maxDuree, Math.round(list.reduce((s, x) => s + x.duree, 0))));
      const durs = intSplit(list.map((x) => x.duree), total, Math.min(2, Math.floor(total / list.length)));
      const seg = { n: i + 1, debut: t, fin: t + total, duree: total, shots: list.map((sc, k) => ({ scene: sc, duree: durs[k] })), mention: i === segs.length - 1 ? script.mention || '' : '' };
      t += total;
      return seg;
    });
  }

  const RES = { wan30: { 1080: '1080P', 720: '720P', 480: '480P' }, seedance25: { 1080: '1080p', 720: '720p', 480: '480p' }, h3: {} };
  function context(node, script) {
    const d = node.data;
    const st = LX.STYLES[script.style] || LX.STYLES.motion_flat;
    const P = M[d.modele] || M.wan30;
    const ratio = P.ratios.includes(script.format) ? script.format : '16:9';
    // style : préréglage + mouvement propre au langage, sans consignes de logos officiels
    const motion = String((script.bible && script.bible.motion_en) || '').split(/[,;]\s*/).filter((x) => x && !/logo|marianne|flag/i.test(x)).join(', ');
    return {
      styleEn: st.en + (motion ? ', ' + motion : ''), palette: script.palette || st.palette, typo: 'clean geometric sans-serif typography, bold numerals',
      musicEn: st.music_en || 'light electronic pad', voix: script.voix, voMode: d.voix || 'native', ratio,
      resolution: (RES[P.id] || {})[d.resolution] || P.defResolution, seed: Number(d.seed) || 0,
    };
  }

  // ------------------------------------------------------------------ node Générateur vidéo (version locale)
  LX.local.generateur = (node, inp) => {
    const d = node.data;
    const it = (inp.script || []).find((x) => x.out);
    if (!it) throw new Error('Branchez la sortie d’un node « Short animé » sur l’entrée « script ».');
    const script = it.out;
    const P = M[d.modele] || M.wan30;
    const ctx = context(node, script);
    const segs = segment(script, P.id, d.segment);
    const warnings = [];
    if (Number(d.segment) > P.maxDuree) warnings.push(`${P.nom} génère au maximum ${P.maxDuree} s par appel : segments ramenés à ${P.maxDuree} s.`);
    if (P.id === 'seedance25' && ctx.voMode === 'native') warnings.push('Seedance 2.5 : le dialogue en français n’est pas confirmé par les sources. Testez un segment avant de tout générer, ou choisissez « voix off ajoutée au montage ».');
    if (!P.ratios.includes(script.format)) warnings.push(`Format ${script.format} non proposé par ${P.nom} : 16:9 utilisé.`);
    const out = segs.map((seg) => {
      const prompt = P.compose(seg, ctx);
      if (prompt.length > P.promptMax) warnings.push(`Segment ${seg.n} : prompt de ${prompt.length} caractères (max ${P.promptMax}).`);
      return {
        n: seg.n, debut: seg.debut, fin: seg.fin, duree: seg.duree, prompt, chars: prompt.length,
        plans: seg.shots.map((sh) => ({ titre: sh.scene.titre, duree: sh.duree, vo: U.stripMarks(sh.scene.vo || '') })),
        key: String(U.hash(P.id + prompt + seg.duree + ctx.ratio + ctx.resolution)),
      };
    });
    return {
      modele: P.id, modeleNom: P.nom, segmentCible: Number(d.segment), ratio: ctx.ratio, resolution: ctx.resolution, voix: ctx.voMode,
      titre: script.titre, duree: segs.reduce((s, x) => s + x.duree, 0), segments: out, regles: P.regles, avertissements: warnings,
      prixSeconde: P.prix ? P.prix[String(ctx.resolution).toLowerCase()] || null : null,
    };
  };

  LX.VIDEO_MODELS = M;
  LX.video = Object.assign(LX.video || {}, { segment, context, intSplit });
})(window.LX = window.LX || {});
