#!/usr/bin/env node
// Génère les projets d'exemple (data/examples/*.json)
'use strict';
const fs = require('fs');
const path = require('path');
const out = path.join(__dirname, '..', 'data', 'examples');
fs.mkdirSync(out, { recursive: true });
let k = 0;
const L = (from, to, toPort, fromPort = 'out') => ({ id: 'l' + (++k), from, fromPort, to, toPort });
const N = (id, type, x, y, data) => ({ id, type, x, y, data });

// 1 — Pantoufles irlandaises × girafons de Melbourne
const g1 = {
  version: 1,
  meta: { title: 'Pantoufles irlandaises × girafons de Melbourne', description: 'Une comparaison absurde, chiffrée, passée au prisme de la médecine et de Bourdieu, puis racontée en langage politico-mode et transformée en short animé.' },
  nodes: [
    N('s1', 'sujet', 40, 40, { titre: 'Les ventes de pantoufles en Irlande dans les années 80', angle: 'Que peut-on apprendre en comparant deux phénomènes qui n’ont rien à voir ?', motscles: 'pantoufles, Irlande, girafes, Melbourne, corrélation' }),
    N('b1', 'brief', 40, 250, { public: 'le grand public', objectif: 'expliquer', ton: 'ironique', mode: 'plausible', contraintes: 'Rappeler que les chiffres sont fictifs.' }),
    N('e1', 'evenement', 40, 520, { titre: 'Grande vague de froid et chutes de neige', date: '1982-01', lieu: 'Irlande', type: 'précédent', description: 'Épisode neigeux marquant de l’hiver 1982 (à vérifier avant diffusion).', impact: 3 }),
    N('e2', 'evenement', 320, 600, { titre: 'Naissance très médiatisée d’un girafon au zoo', date: '1985-03', lieu: 'Melbourne', type: 'déclencheur', description: 'Événement fictif inventé pour la démonstration.', impact: 4 }),
    N('d1', 'donnee', 320, 20, { question: 'Combien de pantoufles ont été vendues en Irlande dans les années 80 ?', libelle: 'pantoufles vendues en Irlande', mode: 'saisie', unite: 'paires', periode: '1980–1989', lieu: 'Irlande', serie: '1980: 1180000\n1981: 1215000\n1982: 1390000\n1983: 1240000\n1984: 1205000\n1985: 1310000\n1986: 1260000\n1987: 1235000\n1988: 1330000\n1989: 1290000', source: 'Valeurs fictives de démonstration — passez en « Recherche par agent » avec un moteur IA pour de vraies données', fiabilite: 'fictif' }),
    N('d2', 'donnee', 320, 330, { question: 'Combien de girafons sont nés au zoo de Melbourne dans les années 80 ?', libelle: 'girafons nés au zoo de Melbourne', mode: 'saisie', unite: 'naissances', periode: '1980–1989', lieu: 'Melbourne', serie: '1980: 1\n1981: 1\n1982: 3\n1983: 1\n1984: 1\n1985: 2\n1986: 2\n1987: 1\n1988: 2\n1989: 2', source: 'Valeurs fictives de démonstration', fiabilite: 'fictif' }),
    N('c1', 'comparaison', 620, 170, { question: 'Qu’est-ce que ces deux séries racontent ensemble ?', mode: 'absurde', agregation: 'somme', seed: 1 }),
    N('l1', 'lexique', 620, 470, { lexique: 'medecine', registre: 'institutionnel', intensite: 3 }),
    N('l2', 'lexique', 620, 640, { lexique: 'bourdieu', registre: 'critique', intensite: 3 }),
    N('p1', 'prisme', 920, 60, { lexique: 'medecine', intention: 'traduire', longueur: 'moyen', seed: 1 }),
    N('p2', 'prisme', 920, 330, { lexique: 'bourdieu', intention: 'critiquer', longueur: 'moyen', seed: 1 }),
    N('l3', 'lexique', 920, 610, { lexique: 'politique', registre: 'institutionnel', intensite: 4 }),
    N('l4', 'lexique', 920, 770, { lexique: 'mode', registre: 'institutionnel', intensite: 3 }),
    N('m1', 'mixeur', 1200, 650, { poids: { politique: 2, mode: 1 }, mode: 'fusion' }),
    N('r1', 'reflexion', 1220, 240, { structure: 'auto', longueur: 'moyen', seed: 1 }),
    N('a1', 'agent', 1520, 40, { role: 'contradicteur', seed: 1 }),
    N('st1', 'style', 1520, 640, { style: 'motion_flat', palette: '#0B3C5D, #328CC1, #D9B310, #F2F2F2, #1D2731', typo: 'sans-serif géométrique, chiffres en gras' }),
    N('sh1', 'short', 1820, 330, { duree: '45', format: '9:16', voix: 'ironique', cible: 'seedance25', langue: 'en', seed: 1 }),
    N('gen1', 'generateur', 2120, 360, { modele: 'seedance25', segment: '15', voix: 'native', passerelle: 'fal', resolution: '720' }),
  ],
  links: [],
};
g1.links.push(
  L('e1', 'e2', 'precedents'), L('s1', 'd1', 'contexte'),
  L('d1', 'c1', 'a'), L('d2', 'c1', 'b'),
  L('c1', 'p1', 'contenu'), L('l1', 'p1', 'lexique'),
  L('c1', 'p2', 'contenu'), L('l2', 'p2', 'lexique'),
  L('l3', 'm1', 'lexiques'), L('l4', 'm1', 'lexiques'),
  L('s1', 'r1', 'sujet'), L('m1', 'r1', 'lexiques'), L('b1', 'r1', 'brief'),
  L('e2', 'r1', 'elements'), L('d1', 'r1', 'elements'), L('c1', 'r1', 'elements'), L('p1', 'r1', 'elements'), L('p2', 'r1', 'elements'),
  L('r1', 'a1', 'entree'),
  L('r1', 'sh1', 'contenu'), L('st1', 'sh1', 'style'), L('m1', 'sh1', 'lexiques'), L('b1', 'sh1', 'brief'),
  L('sh1', 'gen1', 'script'),
);

// 2 — Table ronde : la semaine de quatre jours
k = 0;
const g2 = {
  version: 1,
  meta: { title: 'Table ronde : la semaine de quatre jours', description: 'Politique, médecine et management débattent ; le décodeur mesure la langue de bois ; un short « tableau blanc » en sort.' },
  nodes: [
    N('s1', 'sujet', 40, 60, { titre: 'La semaine de quatre jours', angle: 'Faut-il généraliser la semaine de quatre jours ?', motscles: 'travail, santé, productivité' }),
    N('l1', 'lexique', 40, 260, { lexique: 'politique', registre: 'institutionnel', intensite: 4 }),
    N('l2', 'lexique', 40, 420, { lexique: 'medecine', registre: 'vulgarisation', intensite: 3 }),
    N('l3', 'lexique', 40, 580, { lexique: 'management', registre: 'institutionnel', intensite: 5 }),
    N('n1', 'note', 340, 600, { titre: 'Contexte', texte: 'Plusieurs entreprises et administrations expérimentent une semaine de travail condensée ou réduite. Les retours portent sur le bien-être, l’organisation et la productivité.', source: '' }),
    N('dbt', 'debat', 360, 220, { format: 'contradictoire', tours: 2, moderateur: true, seed: 1 }),
    N('dec', 'decodeur', 680, 80, { cible: 'tous' }),
    N('ag', 'agent', 680, 380, { role: 'vulgarisateur', seed: 1 }),
    N('st', 'style', 680, 600, { style: 'whiteboard' }),
    N('sh', 'short', 980, 300, { duree: '60', format: '9:16', voix: 'posée', cible: 'generique', langue: 'en', seed: 1 }),
  ],
  links: [],
};
g2.links.push(
  L('s1', 'dbt', 'sujet'), L('l1', 'dbt', 'voix'), L('l2', 'dbt', 'voix'), L('l3', 'dbt', 'voix'), L('n1', 'dbt', 'elements'),
  L('dbt', 'dec', 'texte'), L('dbt', 'ag', 'entree'),
  L('dbt', 'sh', 'contenu'), L('st', 'sh', 'style'), L('l1', 'sh', 'lexiques'), L('l2', 'sh', 'lexiques'), L('l3', 'sh', 'lexiques'),
);

// 3 — Collection capsule annoncée comme un protocole de soin
k = 0;
const g3 = {
  version: 1,
  meta: { title: 'Une collection de mode racontée comme un protocole de soin', description: 'Mixeur mode × médecine, chronologie d’événements, prisme satirique et short en pâte à modeler.' },
  nodes: [
    N('s1', 'sujet', 40, 40, { titre: 'La collection capsule printemps-été de la maison Lumen', angle: 'Et si l’on présentait une collection comme on annonce un protocole de soin ?', motscles: 'mode, soin, lancement' }),
    N('n1', 'note', 40, 230, { titre: 'Dossier de presse (fictif)', texte: 'La maison Lumen, marque fictive, lance une capsule de douze pièces en lin lavé et coton biologique. Les coupes sont amples, la palette va du sable au bleu hôpital. Le prix est en hausse, les quantités sont limitées.', source: 'Marque fictive' }),
    N('e1', 'evenement', 40, 500, { titre: 'Rupture de stock de la collection précédente', date: '2026-11', type: 'précédent', description: 'Les pièces phares se sont écoulées en quelques jours.', impact: 3 }),
    N('e2', 'evenement', 320, 560, { titre: 'Défilé de présentation de la capsule', date: '2027-03', lieu: 'Paris', type: 'déclencheur', description: 'Présentation à la presse et aux acheteurs.', impact: 4 }),
    N('l1', 'lexique', 320, 40, { lexique: 'mode', registre: 'institutionnel', intensite: 4 }),
    N('l2', 'lexique', 320, 200, { lexique: 'medecine', registre: 'technique', intensite: 4 }),
    N('m1', 'mixeur', 600, 120, { poids: { mode: 2, medecine: 1.5 }, mode: 'fusion' }),
    N('p1', 'prisme', 600, 360, { lexique: 'medecine', intention: 'satiriser', longueur: 'moyen', seed: 1 }),
    N('r1', 'reflexion', 880, 180, { structure: 'auto', longueur: 'moyen', seed: 1 }),
    N('st', 'style', 880, 520, { style: 'clay' }),
    N('sh', 'short', 1170, 280, { duree: '30', format: '9:16', voix: 'chaleureuse', cible: 'kling', langue: 'en', seed: 1 }),
  ],
  links: [],
};
g3.links.push(
  L('l1', 'm1', 'lexiques'), L('l2', 'm1', 'lexiques'), L('e1', 'e2', 'precedents'),
  L('n1', 'p1', 'contenu'), L('l2', 'p1', 'lexique'),
  L('s1', 'r1', 'sujet'), L('m1', 'r1', 'lexiques'), L('n1', 'r1', 'elements'), L('e2', 'r1', 'elements'), L('p1', 'r1', 'elements'),
  L('r1', 'sh', 'contenu'), L('st', 'sh', 'style'), L('m1', 'sh', 'lexiques'),
);

// 4 — Topic aléatoire + Corrélation : glaces et noyades
k = 0;
const g4 = {
  version: 1,
  meta: { title: 'Glaces, noyades et dés pipés', description: 'Un topic tiré au hasard, une corrélation chiffrée (Pearson, Spearman, tendance, décalage) et des hypothèses de liens, lues par la science et Durkheim.' },
  nodes: [
    N('h1', 'hasard', 40, 60, { mode: 'paire', source: 'banque', categorie: 'toutes', folie: 'toutes', tirage: {
      a: { t: 'les ventes de glaces à Marseille', a: 'Quel lien entre les ventes de glaces à Marseille et le nombre de noyades en Méditerranée ?', c: 'paire', f: 2 },
      b: { t: 'le nombre de noyades en Méditerranée', a: 'Quel lien entre le nombre de noyades en Méditerranée et les ventes de glaces à Marseille ?', c: 'paire', f: 2 },
      pourquoi: 'Cas d’école de variable cachée : la chaleur estivale fait monter les deux.' } }),
    N('d1', 'donnee', 380, 20, { question: 'Combien de glaces sont vendues chaque mois à Marseille ?', libelle: 'glaces vendues à Marseille', mode: 'saisie', unite: 'milliers de cornets', periode: 'mois 1 à 12', serie: '1: 40\n2: 46\n3: 70\n4: 120\n5: 210\n6: 340\n7: 455\n8: 430\n9: 260\n10: 130\n11: 60\n12: 55', source: 'Valeurs fictives de démonstration', fiabilite: 'fictif' }),
    N('d2', 'donnee', 380, 300, { question: 'Combien de noyades chaque mois sur le littoral méditerranéen ?', libelle: 'noyades en Méditerranée', mode: 'saisie', unite: 'noyades', periode: 'mois 1 à 12', serie: '1: 3\n2: 2\n3: 4\n4: 7\n5: 15\n6: 29\n7: 41\n8: 44\n9: 18\n10: 8\n11: 4\n12: 3', source: 'Valeurs fictives de démonstration', fiabilite: 'fictif' }),
    N('l1', 'lexique', 380, 560, { lexique: 'science', registre: 'vulgarisation', intensite: 3 }),
    N('l2', 'lexique', 380, 720, { lexique: 'durkheim', registre: 'institutionnel', intensite: 3 }),
    N('c1', 'correlation', 700, 120, { question: 'Les glaces font-elles couler les nageurs ?', methode: 'auto', decalage: 3, hypotheses: 4, seed: 1 }),
    N('c2', 'correlation', 700, 520, { methode: 'hypotheses', hypotheses: 5, seed: 1 }),
    N('l3', 'lexique', 1000, 560, { lexique: 'journalisme', registre: 'vulgarisation', intensite: 3 }),
    N('r1', 'reflexion', 1020, 220, { structure: 'auto', longueur: 'moyen', seed: 1 }),
    N('st', 'style', 1020, 760, { style: 'dataviz' }),
    N('sh', 'short', 1320, 320, { duree: '30', format: '9:16', voix: 'dynamique', cible: 'h3', langue: 'en', seed: 1 }),
    N('gen', 'generateur', 1620, 340, { modele: 'h3', segment: '15', voix: 'native', passerelle: 'fal', resolution: 'auto' }),
  ],
  links: [],
};
g4.links.push(
  L('h1', 'd1', 'contexte', 'out'), L('h1', 'd2', 'contexte', 'outB'),
  L('d1', 'c1', 'a'), L('d2', 'c1', 'b'), L('l1', 'c1', 'lexiques'),
  L('h1', 'c2', 'a', 'out'), L('h1', 'c2', 'b', 'outB'), L('l2', 'c2', 'lexiques'),
  L('h1', 'r1', 'sujet', 'out'), L('l3', 'r1', 'lexiques'), L('c1', 'r1', 'elements'), L('c2', 'r1', 'elements'),
  L('r1', 'sh', 'contenu'), L('st', 'sh', 'style'), L('l3', 'sh', 'lexiques'),
  L('sh', 'gen', 'script'),
);

for (const [name, g] of [['01-pantoufles-girafes.json', g1], ['02-table-ronde-4-jours.json', g2], ['03-collection-protocole.json', g3], ['04-glaces-noyades-hasard.json', g4]]) {
  fs.writeFileSync(path.join(out, name), JSON.stringify(g, null, 2));
  console.log('✓', name, g.nodes.length, 'nodes', g.links.length, 'liens');
}
