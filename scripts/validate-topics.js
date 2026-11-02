#!/usr/bin/env node
// Valide la banque de topics (data/topics/*.json) — format décrit dans docs/SCHEMA-TOPICS.md
// Usage : node scripts/validate-topics.js [fichier.json ...]   (sans argument : tous les fichiers, avec contrôle des doublons croisés)
'use strict';
const fs = require('fs');
const path = require('path');

const CATS = ['insolite', 'histoire', 'science', 'nature', 'societe', 'economie', 'tech', 'culture', 'sport', 'alimentation', 'corps', 'absurde'];
const ART = /^(le |la |les |l'|l’|un |une |des |du |de la |de l'|ce |cet |cette |ces |son |sa |ses |leur |leurs |notre |nos )/i;
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

const dir = path.join(__dirname, '..', 'data', 'topics');
const files = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => path.join(dir, f));
const seen = new Map();
let failed = 0;
const allLists = {};
const allGabarits = [];
const perCat = {};
let nSujets = 0, nPaires = 0;

for (const f of files) {
  const errors = [], warns = [];
  let j;
  try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { console.log(`✗ ${path.basename(f)} : JSON invalide (${e.message})`); failed++; continue; }
  for (const [i, s] of (j.sujets || []).entries()) {
    const w = `sujets[${i}]`;
    if (!s || typeof s.t !== 'string' || s.t.length < 8) { errors.push(`${w}.t manquant ou trop court`); continue; }
    if (!ART.test(s.t)) errors.push(`${w}.t doit commencer par un article ou un déterminant : « ${s.t} »`);
    if (/[.!?]$/.test(s.t.trim())) errors.push(`${w}.t ne doit pas finir par une ponctuation : « ${s.t} »`);
    if (typeof s.a !== 'string' || !/\?$/.test(s.a.trim())) errors.push(`${w}.a doit être une question finissant par « ? » (${s.t})`);
    if (!CATS.includes(s.c)) errors.push(`${w}.c invalide (${s.c}) — autorisées : ${CATS.join(', ')}`);
    if (!(s.f >= 1 && s.f <= 5)) errors.push(`${w}.f (folie) doit valoir 1 à 5`);
    if (s.q !== undefined && (typeof s.q !== 'string' || !/\?$/.test(s.q.trim()))) errors.push(`${w}.q doit être une question chiffrable finissant par « ? »`);
    const k = norm(s.t);
    if (seen.has(k)) errors.push(`${w} doublon de « ${seen.get(k)} »`);
    seen.set(k, s.t);
    perCat[s.c] = (perCat[s.c] || 0) + 1;
    nSujets++;
  }
  for (const [i, p] of (j.paires || []).entries()) {
    const w = `paires[${i}]`;
    if (!p || !ART.test(p.a || '') || !ART.test(p.b || '')) errors.push(`${w} : "a" et "b" doivent être des groupes nominaux avec article`);
    if (!(p.f >= 1 && p.f <= 5)) errors.push(`${w}.f doit valoir 1 à 5`);
    if (typeof p.pourquoi !== 'string' || p.pourquoi.length < 10) errors.push(`${w}.pourquoi manquant`);
    const k = norm(p.a) + '|' + norm(p.b);
    if (seen.has(k)) errors.push(`${w} doublon`);
    seen.set(k, p.a + ' / ' + p.b);
    nPaires++;
  }
  const g = j.generateur;
  if (g) {
    for (const [name, list] of Object.entries(g.listes || {})) {
      if (!Array.isArray(list) || list.some((x) => typeof x !== 'string' || !x.trim())) errors.push(`generateur.listes.${name} : tableau de chaînes attendu`);
      allLists[name] = (allLists[name] || []).concat(list);
    }
    for (const [i, gb] of (g.gabarits || []).entries()) {
      if (!gb || typeof gb.t !== 'string' || !ART.test(gb.t)) errors.push(`generateur.gabarits[${i}].t doit commencer par un article`);
      if (gb.a !== undefined && !/\?$/.test(String(gb.a).trim())) errors.push(`generateur.gabarits[${i}].a doit finir par « ? »`);
      if (!CATS.includes(gb.c)) errors.push(`generateur.gabarits[${i}].c invalide`);
      allGabarits.push(gb);
    }
  }
  if (errors.length) failed++;
  console.log(`${errors.length ? '✗' : '✓'} ${path.basename(f)} — ${(j.sujets || []).length} sujets, ${(j.paires || []).length} paires${g ? ', générateur' : ''} (${errors.length} erreur(s))`);
  errors.slice(0, 40).forEach((e) => console.log('   ERREUR  ' + e));
  if (errors.length > 40) console.log(`   … et ${errors.length - 40} autres`);
  warns.forEach((e) => console.log('   avert.  ' + e));
}
// gabarits : chaque {liste} doit exister
for (const [i, gb] of allGabarits.entries()) {
  for (const m of String(gb.t + ' ' + (gb.a || '') + ' ' + (gb.q || '')).matchAll(/\{([a-z_]+)\}/g)) {
    if (!allLists[m[1]]) { console.log(`   ERREUR  gabarit ${i} : liste inconnue {${m[1]}}`); failed++; }
  }
}
let combos = 0;
for (const gb of allGabarits) {
  const names = Array.from(new Set(Array.from(String(gb.t).matchAll(/\{([a-z_]+)\}/g)).map((m) => m[1])));
  combos += names.reduce((p, n) => p * ((allLists[n] || []).length || 1), 1);
}
console.log(`\nTotal : ${nSujets} sujets, ${nPaires} paires, ${allGabarits.length} gabarits (${combos.toLocaleString('fr-FR')} combinaisons)`);
console.log('Par catégorie : ' + CATS.map((c) => `${c} ${perCat[c] || 0}`).join(' · '));
process.exit(failed ? 1 : 0);
