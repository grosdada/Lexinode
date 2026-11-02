#!/usr/bin/env node
// Valide les fiches de lexique (data/lexicons/*.json) contre le schéma de docs/SCHEMA-LEXIQUE.md
// Usage : node scripts/validate-lexicons.js [fichier.json ...]
'use strict';
const fs = require('fs');
const path = require('path');

const PLACEHOLDERS = ['sujet', 'element', 'chiffre', 'evenement', 'a', 'b', 'conclusion', 'terme', 'public'];
const ROLES = ['contexte', 'faits', 'analyse', 'tension', 'hypothese', 'decision', 'projection', 'conclusion'];
const HEX = /^#[0-9a-fA-F]{6}$/;

function validate(file) {
  const errors = [];
  const warnings = [];
  let lx;
  try {
    lx = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return { errors: ['JSON invalide : ' + e.message], warnings };
  }
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);
  const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
  const arr = (k, min, max, item) => {
    const v = lx[k];
    if (!Array.isArray(v)) return err(`"${k}" doit être un tableau`);
    if (v.length < min) warn(`"${k}" : ${v.length} entrées (attendu ≥ ${min})`);
    if (max && v.length > max * 1.5) warn(`"${k}" : ${v.length} entrées (attendu ≤ ${max})`);
    v.forEach((x, i) => item && item(x, `${k}[${i}]`));
  };
  const checkTpl = (s, where) => {
    if (!isStr(s)) return err(`${where} : chaîne vide ou non textuelle`);
    const re = /\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(s))) {
      if (!PLACEHOLDERS.includes(m[1])) err(`${where} : placeholder inconnu {${m[1]}} dans « ${s} »`);
    }
    if (/\b(le|la|les|du|au|aux|des|un|une)\s+\{(sujet|element|evenement|a|b|public)\}/i.test(s))
      err(`${where} : article devant un placeholder (interdit) dans « ${s} »`);
  };

  const expectedId = path.basename(file, '.json');
  if (!isStr(lx.id) || !/^[a-z0-9-]+$/.test(lx.id)) err('"id" doit être un slug ascii minuscule');
  else if (lx.id !== expectedId) err(`"id" (${lx.id}) ≠ nom de fichier (${expectedId})`);
  ['nom', 'categorie', 'icone', 'description', 'posture'].forEach((k) => isStr(lx[k]) || err(`"${k}" manquant`));
  if (!['metier', 'sociologie'].includes(lx.famille)) err('"famille" doit valoir "metier" ou "sociologie"');
  if (!HEX.test(lx.couleur || '')) err('"couleur" doit être un hex #RRGGBB');

  arr('valeurs', 5, 8, (x, w) => isStr(x) || err(`${w} vide`));
  arr('vocabulaire', 35, 50, (x, w) => {
    if (!x || !isStr(x.terme) || !isStr(x.sens)) err(`${w} : "terme" et "sens" requis`);
    if (x && x.usage !== undefined && typeof x.usage !== 'string') err(`${w}.usage doit être une chaîne`);
  });
  arr('formules', 25, 35, (x, w) => checkTpl(x, w));
  arr('connecteurs', 10, 15, (x, w) => isStr(x) || err(`${w} vide`));
  arr('euphemismes', 10, 20, (x, w) => (x && isStr(x.brut) && isStr(x.edl)) || err(`${w} : "brut" et "edl" requis`));
  arr('substitutions', 15, 30, (x, w) => {
    if (!x || !isStr(x.de) || !isStr(x.vers)) return err(`${w} : "de" et "vers" requis`);
    if (x.de !== x.de.toLowerCase()) warn(`${w} : "de" devrait être en minuscules (${x.de})`);
  });
  arr('cadres', 5, 8, (x, w) => {
    if (!x || !isStr(x.nom) || !isStr(x.question)) return err(`${w} : "nom" et "question" requis`);
    checkTpl(x.question, w + '.question');
  });
  arr('structures', 2, 3, (x, w) => {
    if (!x || !isStr(x.nom) || !Array.isArray(x.etapes)) return err(`${w} : "nom" et "etapes" requis`);
    if (x.etapes.length < 4 || x.etapes.length > 6) warn(`${w} : ${x.etapes.length} étapes (attendu 4 à 6)`);
    x.etapes.forEach((e, j) => {
      const ww = `${w}.etapes[${j}]`;
      if (!isStr(e.titre)) err(`${ww}.titre manquant`);
      if (!ROLES.includes(e.role)) err(`${ww}.role invalide (${e.role}) — autorisés : ${ROLES.join(', ')}`);
      if (!isStr(e.consigne)) err(`${ww}.consigne manquante`);
      if (!Array.isArray(e.gabarits) || e.gabarits.length < 2) err(`${ww}.gabarits : au moins 2 attendus`);
      else e.gabarits.forEach((g, k) => checkTpl(g, `${ww}.gabarits[${k}]`));
    });
  });
  const rc = lx.rapport_aux_chiffres;
  if (!rc || !isStr(rc.posture) || !Array.isArray(rc.unites) || !Array.isArray(rc.formulations)) err('"rapport_aux_chiffres" incomplet');
  else {
    if (rc.formulations.length < 5) warn('rapport_aux_chiffres.formulations : moins de 5');
    rc.formulations.forEach((f, i) => checkTpl(f, `rapport_aux_chiffres.formulations[${i}]`));
  }
  arr('metaphores', 8, 12, (x, w) => isStr(x) || err(`${w} vide`));
  arr('pieges', 6, 10, (x, w) => isStr(x) || err(`${w} vide`));
  const rg = lx.registres || {};
  ['institutionnel', 'technique', 'vulgarisation', 'critique'].forEach((k) => isStr(rg[k]) || err(`registres.${k} manquant`));
  const v = lx.visuel || {};
  if (!Array.isArray(v.palette) || v.palette.length < 4 || !v.palette.every((c) => HEX.test(c))) err('visuel.palette : 4 à 5 couleurs hex');
  ['motifs', 'pictogrammes'].forEach((k) => {
    if (!Array.isArray(v[k]) || v[k].length < 8) warn(`visuel.${k} : moins de 8 entrées`);
    (v[k] || []).forEach((m, i) => (m && isStr(m.fr) && isStr(m.en)) || err(`visuel.${k}[${i}] : "fr" et "en" requis`));
  });
  ['typographie', 'style_motion', 'style_motion_en'].forEach((k) => isStr(v[k]) || err(`visuel.${k} manquant`));
  arr('exemples', 2, 4, (x, w) => (x && isStr(x.contexte) && isStr(x.texte)) || err(`${w} : "contexte" et "texte" requis`));
  arr('sources', 4, 10, (x, w) => {
    if (!x || !isStr(x.titre)) return err(`${w}.titre manquant`);
    if (!/^https?:\/\//.test(x.url || '')) err(`${w}.url doit commencer par http(s)://`);
  });
  return { errors, warnings };
}

const dir = path.join(__dirname, '..', 'data', 'lexicons');
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => path.join(dir, f));
let failed = 0;
for (const f of files) {
  const { errors, warnings } = validate(f);
  const name = path.basename(f);
  if (errors.length) failed++;
  console.log(`${errors.length ? '✗' : '✓'} ${name}  (${errors.length} erreur(s), ${warnings.length} avertissement(s))`);
  errors.forEach((e) => console.log('   ERREUR  ' + e));
  warnings.forEach((w) => console.log('   avert.  ' + w));
}
if (!files.length) console.log('Aucun fichier à valider.');
process.exit(failed ? 1 : 0);
