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
  // Texte de la voix off d'une scène dans la langue choisie ; l'anglais (vo_en) vient de la traduction faite avant le calcul du node
  const voText = (sc, ctx) => (ctx.voLang === 'English' && sc.vo_en != null ? sc.vo_en : sc.vo);
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
      const vo = shots.map((sh) => clean(voText(sh.scene, ctx))).filter(Boolean).join(' ');
      if (ctx.voNative && vo) L.push(`Audio: an off-screen ${ctx.voLang} narrator, ${voice} voice, says: "${q(vo)}" Under the voice, ${clean(ctx.musicEn)}, low in the mix, and soft interface sound effects on each graphic appearance.`);
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
      if (ctx.voNative) L.push(`Dialogue language: ${ctx.voLang}. An off-screen narrator, ${voice0} voice, clear diction, speaks the lines in {}.`);
      let t = 0;
      seg.shots.forEach((sh, i) => {
        const sc = sh.scene;
        const a = t, b = t + sh.duree;
        t = b;
        const parts = [`${a}–${b} s: ${U.cap(sceneVisual(sc))}${motifsEn(sc).length ? ', with ' + motifsEn(sc).join(', ') : ''}.`];
        parts.push(`Camera: ${clean(sc.camera || 'static frame')}.`);
        if (ecran(sc)) parts.push(`【${ecran(sc)}】`);
        if (ctx.voNative && clean(voText(sc, ctx))) parts.push(`The off-screen narrator says: {${clean(voText(sc, ctx))}}`);
        if (i < seg.shots.length - 1) parts.push(`At ${b} s, cut on the graphic movement to the next shot, same palette, same graphic world.`);
        L.push(parts.join(' '));
      });
      const audio = [`(${clean(ctx.musicEn)}, low in the mix)`, '<soft interface pops on each graphic appearance>'];
      if (!ctx.voNative) audio.push('No dialogue, no voice: the voice-over is added in the edit.');
      L.push(audio.join(' '));
      if (seg.mention) L.push(`【${clean(seg.mention)}】 stays on the final frame.`);
      L.push('Do not change the palette or the graphic style between shots. No photorealistic skin, no 3D render look, no extra text beyond the captions in 【】.');
      return L.join('\n');
    },
    directPayload: null,
  };

  M.h3 = {
    id: 'h3', nom: 'MiniMax H3 (classique)', maxDuree: 15, minDuree: 5, promptMax: 7000, maxShots: 7,
    ratios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'], resolutions: ['2K', '768P', '480P'], defResolution: '2K',
    regles: [
      'Blocs séparés par des lignes vides : (références), style, un bloc par plan, audio, réglages.',
      'Plan : « Shot N — X seconds. Camera: objectif, support, mouvement. Une seule action visible. »',
      'Durées en secondes entières, ≥ 2 s par plan, somme exactement égale à la durée demandée ; 7 plans maximum sur 15 s.',
      'Varier objectif, support et mouvement d’un plan à l’autre.',
      'Bloc audio obligatoire, interdiction en premier (sinon le modèle ajoute une musique).',
      'Pas de timecodes, pas de champ de prompt négatif (les interdits vont dans les blocs).',
      'Durée 5 à 15 s par génération (entier), 2K, 24 i/s, audio stéréo natif ; ratio obligatoire en texte seul (pas « adaptive »). Via fal : prompt de 50 000 caractères au maximum.',
    ],
    falId: 'minimax/h3/text-to-video', prix: { '480p': 0.05, '768p': 0.06, '2k': 0.13, '4k': 0.16 },
    falTemplate: '{"prompt": "{prompt}", "prompt_expansion_mode": "disabled", "duration": {duration}, "aspect_ratio": "{ratio}", "resolution": "{RESOLUTION}"}',
    compose(seg, ctx) {
      const B = [];
      B.push(`Style: ${clean(ctx.styleEn)}, an institutional animated explainer built from flat graphic elements. Palette ${ctx.palette.join(', ')}. ${clean(ctx.typo || 'Geometric sans-serif typography')}. Global rule: every shot stays in the same graphic world and palette, the only text on screen is the captions written below.`);
      const lenses = ['35mm', '50mm', '24mm', '85mm', '35mm', '50mm', '24mm'];
      seg.shots.forEach((sh, i) => {
        const sc = sh.scene;
        B.push(`Shot ${i + 1} — ${sh.duree} seconds. Camera: ${lenses[i % lenses.length]} look, ${clean(sc.camera || 'static frame')}. ${U.cap(sceneVisual(sc))}.${ecran(sc) ? ` On-screen caption: "${q(ecran(sc))}".` : ''}`);
      });
      const voice = VOICE_EN[ctx.voix] || 'calm, measured';
      const vo = seg.shots.map((sh) => clean(voText(sh.scene, ctx))).filter(Boolean).join(' ');
      if (ctx.voNative && vo) B.push(`Audio, native stereo: an off-screen ${ctx.voLang} narrator, ${voice} voice, says: "${q(vo)}" Music: ${clean(ctx.musicEn)}, entering softly under the voice. Soft interface sounds on each graphic appearance, timed to the cuts.`);
      else B.push(`Audio, native stereo: NO VOICE, no dialogue at any point. Music: ${clean(ctx.musicEn)}, entering from the first shot. Soft interface sounds on each graphic appearance, timed to the cuts.`);
      if (seg.mention) B.push(`The last shot ends on the caption "${q(seg.mention)}".`);
      B.push(`Settings: ${ctx.ratio}, ${ctx.resolution}, ${seg.duree} seconds.`);
      return B.join('\n\n');
    },
    directPayload(seg, prompt, ctx) {
      return { model: 'MiniMax-H3', content: [{ type: 'text', text: prompt }], resolution: '2K', duration: seg.duree, ratio: ctx.ratio };
    },
  };

  // H3 Max (fal : minimax/h3-max/text-to-video) : même écriture de prompt que H3, jusqu'à 1080p, prompt jusqu'à 50 000 caractères
  M.h3max = Object.assign({}, M.h3, {
    id: 'h3max', nom: 'MiniMax H3 Max', minDuree: 4,
    resolutions: ['1080P', '768P', '480P'], defResolution: '1080P',
    regles: M.h3.regles.slice(0, -1).concat('Durée 4 à 15 s par génération, jusqu’à 1080p (affiné depuis un 768p natif), 24 i/s, audio stéréo natif ; ratio obligatoire en texte seul (pas « adaptive »). Via fal : prompt de 50 000 caractères au maximum, expansion de prompt désactivée.'),
    falId: 'minimax/h3-max/text-to-video', prix: { '480p': 0.05, '768p': 0.08, '1080p': 0.16 },
    directPayload: null,
  });

  // LTX 2.5 en local (Workflows Q-Builder / ComfyUI) : un prompt par plan, un seul paragraphe au présent (skill ltx25-prompt).
  // Profil réservé au node « Sortie Queue Builder » : il n'a ni identifiant fal ni tarif.
  M.ltx25 = {
    id: 'ltx25', nom: 'LTX 2.5 (local, Q-Builder)', maxDuree: 9, minDuree: 4, promptMax: 2500, maxShots: 1,
    ratios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'], resolutions: ['720P'], defResolution: '720P',
    regles: [
      'Un seul paragraphe fluide, au présent : ni minutage, ni « Shot 1 », ni puces.',
      'Dans l’ordre : plan (objectif, échelle), lumière et palette, action du début à la fin, mouvement de caméra, puis le son en dernier.',
      'Direction écrite en anglais ; la voix off va entre guillemets, avec sa langue nommée si ce n’est pas l’anglais.',
      'Le son naît avec l’image : décrire l’espace sonore, la voix, la musique ou son absence.',
      'Pas de texte lisible à l’écran ni de logos : LTX les déforme (titres et légendes à ajouter au montage).',
      'Nombre d’images en 8n+1 (97, 121, 153, 193, 241 à 25 i/s : 3,9 à 9,6 s) ; taille divisible par 32.',
    ],
    falId: '', prix: null, falTemplate: '',
    compose(seg, ctx) {
      const sc = seg.shots[0].scene;
      const P = [];
      // pas de mention de sous-titres ou de légendes dans le style : LTX écrirait du texte déformé
      const style = clean(ctx.styleEn).replace(/,?\s*(burned-in\s+)?(subtitles|captions)\b[^,.]*/gi, '');
      P.push(`A medium shot of an animated institutional explainer, ${style}, palette ${ctx.palette.join(', ')}.`);
      P.push(`${U.cap(sceneVisual(sc))}${motifsEn(sc).length ? ', with ' + motifsEn(sc).join(', ') : ''}.`);
      P.push(`${U.cap(clean(sc.camera || 'static locked-off frame'))} for the whole clip, the subject steady in frame; the clip runs about ${seg.duree} seconds.`);
      const voice = VOICE_EN[ctx.voix] || 'calm, measured';
      const vo = clean(voText(sc, ctx));
      const lang = ctx.voLang === 'English' ? 'in English' : 'in French';
      if (ctx.voNative && vo) P.push(`A ${voice} off-screen narrator speaks ${lang}, at an unhurried pace, "${q(vo)}" Under the voice, ${clean(ctx.musicEn)} plays softly, with soft interface pops on each graphic appearance, in a clean dry studio acoustic.`);
      else P.push(`There is no voice and no dialogue. ${U.cap(clean(ctx.musicEn))} plays softly, with soft interface pops on each graphic appearance, in a clean dry acoustic.`);
      return P.join(' ');
    },
    directPayload: null,
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

  const RES = { wan30: { 1080: '1080P', 720: '720P', 480: '480P' }, seedance25: { 1080: '1080p', 720: '720p', 480: '480p' }, h3: { 1080: '2K', 720: '768P', 480: '480P' }, h3max: { 1080: '1080P', 720: '768P', 480: '480P' } };
  function context(node, script) {
    const d = node.data;
    const st = LX.STYLES[script.style] || LX.STYLES.motion_flat;
    const P = M[d.modele] || M.wan30;
    const ratio = P.ratios.includes(script.format) ? script.format : '16:9';
    // style : préréglage + mouvement propre au langage, sans consignes de logos officiels
    const motion = String((script.bible && script.bible.motion_en) || '').split(/[,;]\s*/).filter((x) => x && !/logo|marianne|flag/i.test(x)).join(', ');
    return {
      styleEn: st.en + (motion ? ', ' + motion : ''), palette: script.palette || st.palette, typo: 'clean geometric sans-serif typography, bold numerals',
      musicEn: st.music_en || 'light electronic pad', voix: script.voix, voMode: d.voix || 'native', voNative: String(d.voix || 'native').startsWith('native'), voLang: d.voix === 'native_en' ? 'English' : 'French', ratio,
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
    // voix fournie par le node Voice (ElevenLabs) : le modèle ne dit plus rien, les prompts sont écrits sans voix
    const vin = (inp.voice || []).find((x) => x.out && x.out.items);
    const voice = vin ? vin.out : null;
    if (voice) { ctx.voMode = 'post'; ctx.voNative = false; }
    const segs = segment(script, P.id, d.segment);
    const warnings = [];
    if (voice) {
      warnings.push('Voix off fournie par le node Voice (ElevenLabs) : les prompts sont écrits sans voix.');
      if (['h3', 'h3max'].includes(P.id)) warnings.push('La voix est imposée au clip (target_audio_url) : la bande son du clip devient la voix seule, ajoutez la musique au montage.');
      else warnings.push(`${P.nom} n’accepte pas de piste audio imposée : téléchargez la voix dans le node Voice et ajoutez-la au montage.`);
      if (!voice.voiceId) warnings.push('Le node Voice n’a pas de voix choisie.');
    }
    if (Number(d.segment) > P.maxDuree) warnings.push(`${P.nom} génère au maximum ${P.maxDuree} s par appel : segments ramenés à ${P.maxDuree} s.`);
    if (P.id === 'seedance25' && ctx.voMode === 'native') warnings.push('Seedance 2.5 : le dialogue en français n’est pas confirmé par les sources. Testez un segment avant de tout générer, ou choisissez « voix off ajoutée au montage ».');
    if (ctx.voLang === 'English' && script.scenes.some((s) => s.vo && s.vo_en == null)) warnings.push('Voix off en anglais : la traduction n’a pas été faite, la voix off reste en français.');
    if (!P.ratios.includes(script.format)) warnings.push(`Format ${script.format} non proposé par ${P.nom} : 16:9 utilisé.`);
    const out = segs.map((seg) => {
      const prompt = P.compose(seg, ctx);
      // voix du node Voice : les scènes de ce segment (une scène coupée en parties ne porte sa voix que sur la première)
      const refs = !voice ? [] : seg.shots.map((sh) => sh.scene).filter((sc) => !/\((?!1\/)\d+\/\d+\)$/.test(sc.titre || '')).map((sc) => voice.items.find((x) => x.n === sc.n)).filter(Boolean)
        .map((it) => ({ text: it.texte, voice_id: voice.voiceId, model_id: voice.modele, settings: voice.settings, label: it.titre }));
      if (prompt.length > P.promptMax) warnings.push(`Segment ${seg.n} : prompt de ${prompt.length} caractères (max ${P.promptMax}).`);
      return {
        n: seg.n, debut: seg.debut, fin: seg.fin, duree: seg.duree, prompt, chars: prompt.length,
        plans: seg.shots.map((sh) => ({ titre: sh.scene.titre, duree: sh.duree, vo: U.stripMarks(voText(sh.scene, ctx) || '') })),
        key: String(U.hash(P.id + prompt + seg.duree + ctx.ratio + ctx.resolution + JSON.stringify(refs))),
        voice: refs.length ? { refs } : null,
      };
    });
    return {
      modele: P.id, modeleNom: P.nom, segmentCible: Number(d.segment), ratio: ctx.ratio, resolution: ctx.resolution, voix: voice ? 'voice' : ctx.voMode,
      titre: script.titre, duree: segs.reduce((s, x) => s + x.duree, 0), segments: out, regles: P.regles, avertissements: warnings,
      prixSeconde: P.prix ? P.prix[String(ctx.resolution).toLowerCase()] || null : null,
    };
  };

  // ------------------------------------------------------------------ node « Voice (ElevenLabs) » : le texte à dire, scène par scène (la génération se fait sur bouton)
  LX.local.voice = (node, inp) => {
    const d = node.data;
    const it = (inp.script || []).find((x) => x.out);
    if (!it) throw new Error('Branchez la sortie d’un node « Short animé » sur l’entrée « script ».');
    const script = it.out;
    const en = d.langue === 'en';
    const num = (v, lo, hi, def) => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };
    const settings = { stability: num(d.stabilite, 0, 1, 0.5), similarity_boost: num(d.similarite, 0, 1, 0.75), style: num(d.style, 0, 1, 0), use_speaker_boost: true, speed: num(d.vitesse, 0.7, 1.2, 1) };
    const voiceId = String(d.voice_id || '').trim();
    const modele = d.modele || 'eleven_multilingual_v2';
    const items = (script.scenes || []).map((s) => ({ n: s.n, titre: s.titre, duree: s.duree, texte: U.stripMarks((en && s.vo_en != null ? s.vo_en : s.vo) || '').trim() })).filter((x) => x.texte);
    items.forEach((x) => { x.chars = x.texte.length; x.key = String(U.hash(`${voiceId}|${modele}|${JSON.stringify(settings)}|${x.texte}`)); });
    const warnings = [];
    if (!voiceId) warnings.push('Choisissez une voix : bouton « Mes voix » ci-dessous, ou collez un identifiant de voix ElevenLabs dans les paramètres.');
    if (en && (script.scenes || []).some((s) => s.vo && s.vo_en == null)) warnings.push('La traduction en anglais n’a pas été faite : la voix off reste en français.');
    return { voiceId, modele, langue: en ? 'en' : 'fr', settings, items, chars: items.reduce((s, x) => s + x.chars, 0), duree: items.reduce((s, x) => s + x.duree, 0), titre: script.titre, avertissements: warnings };
  };

  // ------------------------------------------------------------------ node « Sortie Queue Builder »
  // Q-Builder (Workflows Q-Builder, ComfyUI) répartit les films sur les machines locales. Pour H3 T2V et LTX 2.5 il se charge par
  // « Load prompts HTML » : une page avec un bloc <script type="application/json" data-prompts> = [{name, positive}], 20 au plus.
  // (L'API locale de Q-Builder ne prend que H3 Director avec images : rien n'est envoyé d'ici.)
  const QB_SLOTS = 20;
  const frames25 = (sec) => 8 * Math.max(1, Math.round((sec * 25) / 8)) + 1; // 8n+1 images à 25 i/s
  LX.local.qbuilder = (node, inp) => {
    const d = node.data;
    const eng = d.moteur === 'ltx25' ? 'ltx25' : 'h3';
    const g = LX.local.generateur({ data: { modele: eng, segment: eng === 'h3' ? '15' : '9', voix: d.voix || 'native', resolution: 'auto', passerelle: 'fal', seed: '0' } }, inp);
    const it = (inp.script || []).find((x) => x.out);
    const script = it.out;
    const slug = (s) => U.slug(s).replace(/-/g, '_');
    const prefix = slug(d.prefixe || script.titre || 'lexinode').slice(0, 16).replace(/_+$/, '');
    const used = new Set();
    const items = g.segments.map((s) => {
      let name = `${prefix}_${String(s.n).padStart(2, '0')}_${slug((s.plans[0] && s.plans[0].titre) || 'plan').slice(0, 20)}`.replace(/_+$/, '');
      while (used.has(name)) name += '_b';
      used.add(name);
      return { n: s.n, name, positive: s.prompt, seconds: s.duree, chars: s.chars, frames: eng === 'ltx25' ? frames25(s.duree) : null, plans: s.plans };
    });
    const lots = [];
    for (let i = 0; i < items.length; i += QB_SLOTS) lots.push({ n: lots.length + 1, items: items.slice(i, i + QB_SLOTS) });
    const warnings = (g.avertissements || []).slice();
    if (lots.length > 1) warnings.push(`${items.length} prompts : répartis en ${lots.length} pages de ${QB_SLOTS} au plus (limite de Q-Builder).`);
    const secs = items.map((x) => x.seconds);
    if (Math.min(...secs) !== Math.max(...secs)) warnings.push(`Les durées varient de ${Math.min(...secs)} à ${Math.max(...secs)} s : vérifiez le réglage de durée dans Q-Builder.`);
    if (eng === 'ltx25' && (script.scenes || []).some((s) => s.texte_ecran)) warnings.push('LTX 2.5 déforme le texte lisible : les textes à l’écran ne sont pas écrits dans les prompts, à ajouter au montage.');
    return {
      moteur: eng, moteurNom: eng === 'ltx25' ? 'LTX 2.5 (local)' : 'MiniMax H3 (local, T2V)', ratio: g.ratio, voix: g.voix, titre: script.titre,
      duree: g.duree, nbPrompts: items.length, items, lots, regles: g.regles, avertissements: warnings, prefixe: prefix,
    };
  };
  const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  LX.qbuilder = {
    SLOTS: QB_SLOTS,
    // Page HTML autonome : le bloc JSON est ce que lit Q-Builder, le reste (titres, <pre>, boutons « copier ») sert à la lecture
    page(o, lot) {
      const json = JSON.stringify(lot.items.map((x) => ({ name: x.name, positive: x.positive }))).replace(/<\/script/gi, '<\\/script');
      const model = o.moteur === 'ltx25' ? 'LTX 2.5' : 'MiniMax H3 > T2V';
      const blocks = lot.items.map((x) => `<section>
<h2>${escHtml(x.name)}</h2>
<p class="sub">${x.seconds} s${x.frames ? ' · ' + x.frames + ' images à 25 i/s' : ''} · ${x.chars} caractères</p>
<pre><code>${escHtml(x.positive)}</code></pre>
<button onclick="navigator.clipboard.writeText(this.previousElementSibling.textContent);this.textContent='copié'">Copier le prompt</button>
</section>`).join('\n');
      return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Q-Builder · ${escHtml(o.titre || 'Lexinode')} · ${model}${o.lots.length > 1 ? ' · page ' + lot.n + '/' + o.lots.length : ''}</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:900px;margin:24px auto;padding:0 16px;background:#0f1218;color:#e7ebf1}h1{font-size:20px}h2{font-size:16px;margin:26px 0 2px}.sub{color:#8895a7;margin:0 0 6px;font-size:13px}pre{white-space:pre-wrap;background:#1a2029;border:1px solid #2a3340;border-radius:8px;padding:12px;margin:6px 0}button{background:#ffb703;border:0;border-radius:6px;padding:5px 12px;cursor:pointer}.how{background:#151a22;border-left:3px solid #4fc3f7;padding:8px 12px}</style></head><body>
<h1>${escHtml(o.titre || 'Lexinode')} — ${model}</h1>
<p class="sub">${lot.items.length} prompt(s) · ${o.ratio} · voix off : ${o.voix === 'native_en' ? 'anglais' : o.voix === 'post' ? 'ajoutée au montage' : 'français'} · préparé par Lexinode</p>
<p class="how">Dans Workflows Q-Builder : « Load prompts HTML », choisir ${model}, vérifier la durée, le format et la taille, puis générer la commande. Rien n'est lancé tant que vous ne l'envoyez pas.</p>
${blocks}
<script type="application/json" data-prompts>
${json}
</script>
</body></html>
`;
    },
  };

  LX.VIDEO_MODELS = M;
  LX.video = Object.assign(LX.video || {}, { segment, context, intSplit });
})(window.LX = window.LX || {});
