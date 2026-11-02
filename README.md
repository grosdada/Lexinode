# LEXINODE — atelier nodal d'éléments de langage

Lexinode est un éditeur **nodal** : vous posez des blocs (nodes), vous les reliez, et un moteur déroule une **réflexion** dans les **éléments de langage** de corps de métier (politique, médecine, mode, audiovisuel…) ou à travers des **grilles sociologiques** (Bourdieu, Goffman…). Vous pouvez comparer des données, même absurdes, faire débattre des métiers, décoder la langue de bois, et terminer par un **short animé** : storyboard, voix off, prompts image et vidéo par scène, et une **animatique jouable** dans le navigateur.

- **21 fiches d'éléments de langage** issues d'une recherche documentaire sourcée (`data/lexicons/`) :
  - 15 métiers : politique, journalisme, défense, médecine, science, droit, mode/luxe, marketing, sport, audiovisuel, tech/startup, management, finance, écologie/RSE, éducation ;
  - 6 grilles sociologiques : Bourdieu, Goffman, Durkheim, Weber, Foucault, Latour.
- **Deux moteurs** :
  - un moteur **local**, sans IA, hors ligne, qui raisonne avec la base de connaissances et calcule réellement les comparaisons ;
  - des **agents IA** branchables sur **Claude, OpenAI (GPT / Codex), Gemini, Ollama** ou tout serveur compatible OpenAI.
- **Armée d'agents** : chaque rôle (chercheur, analyste, rédacteur, traducteur, débatteur, spécialiste, scénariste) peut être routé vers un fournisseur différent. Les branches indépendantes du graphe s'exécutent en parallèle.
- **Zéro dépendance** : Node ≥ 18 suffit, pas de `npm install`.

---

## Démarrage rapide

### 1. Avec le serveur local (recommandé)

```bash
cd lexinode
cp .env.example .env      # facultatif : ajoutez vos clés API
node server.js
```

Ouvrez ensuite http://localhost:5177. L'exemple « Pantoufles irlandaises × girafons de Melbourne » se charge au premier lancement. Cliquez sur **Tout exécuter**.

### 2. Sans rien installer (un seul fichier)

```bash
node scripts/build-standalone.js
```

- `dist/lexinode.html` est la version complète : moteur local, plus les appels IA directs depuis le navigateur avec vos clés.
- `dist/lexinode-demo.html` est la version de démonstration : moteur local uniquement.

Les deux s'ouvrent par un simple double-clic.

### 3. 100 % open source à la maison (Docker)

```bash
docker compose up -d
docker compose exec ollama ollama pull qwen3:14b
```

Cette commande lance Lexinode, **Ollama** (LLM local) et **SearXNG** (métamoteur de recherche auto-hébergé). Dans **Réglages**, choisissez « Ollama » comme fournisseur, puis basculez le moteur sur **IA**. Avec un GPU NVIDIA, décommentez le bloc `deploy` dans `docker-compose.yml`.

Sans Docker : installez [Ollama](https://ollama.com) (`ollama pull qwen3:14b`), lancez `node server.js`, et c'est tout. Vous pouvez aussi utiliser LM Studio, llama.cpp (`llama-server`), vLLM ou LocalAI : renseignez alors `COMPAT_BASE_URL` dans `.env`.

---

## Les nodes

| Catégorie | Node | Rôle |
|---|---|---|
| Entrées Sujet** | Le thème et l'angle (la problématique). |
| Topic aléatoire** | Tire un sujet, ou une paire de sujets à corréler, dans une banque d'environ 600 topics écrits à la main et 200 paires, plus un générateur combinatoire (objets × lieux × périodes…). Bouton dé sur le node, filtres par catégorie et par niveau de folie, historique pour ne jamais retomber sur les mêmes. Un clic crée les nodes Donnée ou une Corrélation correspondants. |
| | **Brief & public** | Public, objectif, ton, et **rapport au réel** : documentaire, plausible ou fiction/satire. |
| | **Note / citation** | Texte libre : extrait, dossier de presse, contexte. |
| | **Événement** | Fait daté. Branchez des événements **précédents** pour construire une chronologie. |
| | **Donnée** | Valeur ou série chiffrée, obtenue de trois façons : **saisie**, **recherche par agent** (web) ou **estimation raisonnée** (méthode de Fermi). |
| Langage | **Éléments de langage** | Un métier ou une grille sociologique, avec un registre (institutionnel, technique, vulgarisation, critique) et une dose de jargon. |
| | **Mixeur de langages** | Mélange plusieurs langages avec des poids, en mode fusion, alternance ou dominante. |
| | **Prisme / traduction** | Fait passer n'importe quel contenu à travers un langage, avec une intention : traduire, défendre, critiquer, vulgariser, langue de bois, satiriser. |
| | **Décodeur** | L'inverse du prisme. Il repère jargon et euphémismes, traduit en clair, et donne un indice de langue de bois et un score de lisibilité. |
| Analyse | **Comparaison** | A contre B, avec plusieurs modes : quantitatif, ordre de grandeur, corrélation, analogie, **absurde**, contrefactuel. Il calcule le ratio, l'écart, la corrélation de Pearson, la base 100, et ajoute des mises en garde. |
| | **Corrélation** | Cherche des corrélations entre deux sujets ou deux données. Avec deux séries : Pearson, Spearman, p-valeur, test de la tendance commune (variations d’une période à l’autre), recherche de décalage temporel, nuage de points. Avec deux sujets : pistes de liens (variable cachée, chaîne causale, causalité inverse, effet de mesure, coïncidence), chacune avec son protocole de vérification, et création en un clic des nodes Donnée à rechercher. |
| | **Réflexion** | Raisonnement structuré, qui suit la structure argumentative du métier dominant ou une structure générique (dialectique, problème-solution, Minto…). |
| | **Table ronde** | Fait débattre les langages branchés, un intervenant par langage, avec ou sans modérateur. |
| | **Agent spécialiste** | Agent à rôle : contradicteur, vérificateur, statisticien, prospectiviste, vulgarisateur, analogiste, scénariste, ou consigne libre. |
| Sortie | **Direction artistique** | Style visuel parmi 8 : motion design institutionnel, isométrique, tableau blanc, papier découpé, data-viz, blueprint, clay 3D, collage d'archives. Plus la palette et la typo. |
| | **Short animé** | Storyboard minuté, voix off, texte à l'écran, éléments graphiques, prompts **image** et **vidéo** par scène, et animatique jouable avec voix de synthèse. |
| | **Générateur vidéo** | Dernier maillon. Choix du modèle (**Wan 3.0**, **Seedance 2.5**, **MiniMax H3**), découpage du short en **segments de 15 ou 30 s**, un prompt par segment écrit dans la grammaire du modèle, puis **génération lancée depuis le node** via fal.ai (ou les API directes MiniMax et DashScope). Suivi de la file d'attente et lecteur vidéo pour chaque segment. |

Les icônes sont un jeu SVG maison, au trait, avec une couleur à plat par type de node et par langage. Elles passent en monochrome dans Réglages → Apparence.

**La couleur d'un fil indique le type de donnée qui circule**. Une entrée marquée « ⋯ » accepte plusieurs fils.

Raccourcis :
- double-clic sur le canvas : ajouter un node ;
- tirer un fil vers le vide : ajouter un node déjà branché ;
- `Suppr` : supprimer ;
- `Ctrl+D` : dupliquer ;
- `Ctrl+Z` / `Ctrl+Y` : annuler / rétablir ;
- `Ctrl+Entrée` : tout exécuter ;
- `Ctrl+S` : enregistrer.

### L'exemple livré : pantoufles × girafons

1. Deux nodes **Donnée** : les pantoufles vendues en Irlande (1980-1989) et les girafons nés au zoo de Melbourne. Ce sont des **valeurs fictives**, marquées comme telles. Passez-les en « Recherche par agent » avec un moteur IA pour chercher de vraies données.
2. La **Comparaison** est en mode *absurde*. Elle calcule le rapport (1 girafon ≈ 790 938 paires) et une corrélation r = 0,93, qu'elle présente comme un cas d'école de corrélation fallacieuse.
3. Deux **Prismes** relisent cette comparaison, l'un en langage médical, l'autre à travers Bourdieu.
4. Un **Mixeur** politique × mode alimente la **Réflexion**, qui reprend aussi une chronologie d'événements.
5. Un **Agent contradicteur** objecte, puis le **Short animé** de 45 s, au format 9:16, produit les prompts pour Veo et l'animatique.

Trois autres exemples sont fournis :
- une table ronde sur la semaine de quatre jours ;
- une collection de mode annoncée comme un protocole de soin ;
- « Glaces, noyades et dés pipés » : un topic tiré au hasard, une corrélation chiffrée (r = 0,99, présentée comme un cas d'école de variable cachée), des hypothèses lues par la science et Durkheim, puis un générateur MiniMax H3.

---

## Moteurs et agents

### Moteur local (sans IA)

Le moteur local pioche dans chaque fiche :
- les **structures argumentatives**, avec leurs étapes et leurs gabarits ;
- les **formules**, les **connecteurs** et les **cadres** (grilles de lecture) ;
- les **substitutions** et les **euphémismes** ;
- le **rapport aux chiffres**.

Il range automatiquement vos éléments dans les étapes : les événements précédents vont dans le contexte, les données dans les faits, les comparaisons dans l'analyse, les mises en garde dans la tension. Le hasard est **reproductible** : le bouton « varier » donne une autre variante. Les termes de métier utilisés sont **surlignés à la couleur de leur lexique**, ce qui rend la traçabilité visible.

### Moteur IA

Basculez **Local / IA** dans la barre du haut. Chaque node peut aussi forcer son moteur (Paramètres → Avancé).

| Fournisseur | Configuration (`.env` ou Réglages) | Recherche web intégrée |
|---|---|---|
| Claude (Anthropic) | `ANTHROPIC_API_KEY`, modèle par défaut `claude-opus-5-5` | oui (outil `web_search`) |
| OpenAI (GPT / Codex) | `OPENAI_API_KEY`, API Responses, modèle à saisir (ex. `gpt-5`, un modèle Codex de votre compte) | oui (outil `web_search`) |
| Google Gemini | `GEMINI_API_KEY` | oui (Google Search grounding) |
| Ollama | `OLLAMA_URL`, `OLLAMA_MODEL` | non : passe par SearXNG ou Wikipédia |
| Compatible OpenAI | `COMPAT_BASE_URL`, `COMPAT_MODEL`, `COMPAT_API_KEY` | non : passe par SearXNG ou Wikipédia |

Quelques précisions :
- **Modèles** : les noms proposés sont des suggestions. Saisissez l'identifiant exact disponible sur votre compte.
- **Repli Claude** : avec les modèles Claude 5.x récents, Lexinode active le repli automatique côté serveur en cas de refus des classifieurs de sécurité (`fallbacks: "default"`). Mettez `ANTHROPIC_FALLBACKS=off` pour le couper.

**Routage de l'armée d'agents** (Réglages) : chaque rôle peut avoir son propre fournisseur et son propre modèle. Par exemple :
- *chercheur* : Gemini, avec recherche Google ;
- *rédacteur* : Claude ;
- *scénariste* : Ollama local ;
- les autres rôles : le fournisseur par défaut.

Le **journal des agents**, en bas de l'écran, affiche chaque appel : rôle, fournisseur, durée et nombre de sources.

**Recherche de données** : l'agent chercheur utilise la recherche intégrée du LLM quand elle existe, sinon SearXNG, Tavily, Brave ou Wikipédia, cette dernière sans clé. Seules les URL **réellement renvoyées par un moteur de recherche** comptent comme sources. Une URL citée par le modèle mais non confirmée devient une simple « piste à vérifier », et la valeur est rétrogradée en estimation.

---

## Une seule clé : fal.ai

Avec seulement `FAL_KEY` dans `.env` :
- **vidéo** : Wan 3.0, Seedance 2.5 et MiniMax H3, avec les identifiants préremplis (`alibaba/wan-3.0/text-to-video`, `bytedance/seedance-2.5/text-to-video`, `minimax/hailuo-03/text-to-video`) ;
- **agents texte** : fournisseur « fal.ai », c'est-à-dire OpenRouter hébergé par fal. Le modèle par défaut est `google/gemini-2.5-flash`, peu coûteux, et vous pouvez le changer dans Réglages. Lexinode bascule automatiquement sur fal.ai quand c'est la seule clé configurée.

Coût estimé affiché dans le Générateur et dans la confirmation (tarifs fal publics, novembre 2026, à vérifier) :

| Modèle | 480p | 720p | 1080p |
|---|---|---|---|
| Wan 3.0 | 0,05 $/s | 0,10 $/s | 0,20 $/s |
| Seedance 2.5 | ~0,22 $/s | ~0,47 $/s | ~1,16 $/s |
| MiniMax H3 | non publié | | |

Un short de 45 s coûte environ 4,50 $ avec Wan 3.0 en 720p, et environ 21 $ avec Seedance 2.5 en 720p.

## Sur un VPS

```bash
cp .env.example .env    # mettez FAL_KEY, LEXINODE_PASSWORD et HOST=0.0.0.0
docker compose up -d lexinode
```

Mettez toujours `LEXINODE_PASSWORD` en ligne : sinon, n'importe qui pourrait dépenser vos crédits fal via votre serveur. Pour le HTTPS, placez un reverse proxy (Caddy, Nginx) devant le port 5177.

## Génération vidéo (fal.ai)

1. Mettez votre clé fal dans `.env` (`FAL_KEY=…`) ou dans **Réglages → Génération vidéo**.
2. Les identifiants des modèles sont préremplis. Si fal change de version, collez le nouvel identifiant dans les Réglages et adaptez au besoin le corps de requête JSON, qui accepte `{prompt}`, `{duration}`, `{ratio}`, `{resolution}` et `{seed}`.
3. Branchez un **Générateur vidéo** derrière le **Short animé** et choisissez le modèle et la longueur des segments.
4. Cliquez sur **Générer** (un segment pour tester) ou **Générer tout**. Lexinode demande confirmation, car chaque génération est facturée. Il suit ensuite la file d'attente et affiche les vidéos dans le node.

Alternatives sans fal.ai :
- **MiniMax H3 en direct** : `MINIMAX_API_KEY`, endpoint `/v2/video_generation`.
- **Wan 3.0 en direct** : `DASHSCOPE_API_KEY`, API DashScope asynchrone ; la bêta est accordée sur demande.
- **Seedance 2.5** passe par fal.ai : l'API BytePlus exige une signature que Lexinode n'intègre pas.

Règles de prompting intégrées (tirées des guides de chaque modèle) :

| | Wan 3.0 | Seedance 2.5 | MiniMax H3 |
|---|---|---|---|
| Durée par génération | 2–30 s | 4–30 s | 4–15 s (entiers) |
| Forme du prompt | un bloc en prose, façon note de tournage ; « Cut to. » entre les plans, sujet ré-ancré après chaque coupe | formule officielle en prose et *beats* minutés « 0–6 s : … » (±1 s) | blocs séparés : style, un bloc par plan « Shot N — X seconds. Camera: … », audio, réglages |
| Audio | natif ; dialogue entre guillemets, locuteur nommé | natif ; musique ( ), bruitages < >, dialogue { }, texte à l’écran 【 】 | stéréo natif ; bloc audio obligatoire, interdictions en tête |
| Exclusions | pas de prompt négatif : formulations positives | phrases de préservation (« Do not change… ») | dans les blocs, pas de champ négatif |

Le **Short animé** connaît aussi ces trois modèles (champ « Modèle vidéo visé ») : en mode IA, le scénariste découpe et minute les scènes en fonction du modèle. En mode IA, le Générateur fait aussi réécrire chaque segment par l'agent scénariste selon les règles du modèle.

Les spécifications de ces modèles évoluent vite. Les valeurs intégrées datent d'août 2026 : vérifiez-les sur la documentation du fournisseur.

## Rapport au réel

Chaque donnée porte un **statut** : sourcé, saisi, estimé, fictif ou inconnu. Ce statut se propage :
- la **Réflexion** affiche un indice de fiabilité ;
- le **Short** ajoute automatiquement une mention finale, par exemple « Chiffres fictifs — démonstration » ou « Certaines valeurs sont des estimations » ;
- la **Comparaison** rappelle qu'une corrélation n'est pas une causalité.

Le node **Brief** permet d'assumer la fiction ou la satire. L'outil sert à fabriquer des raisonnements plausibles, à des fins pédagogiques, créatives ou critiques. Il ne sert pas à faire passer de faux chiffres pour vrais.

---

## Base de connaissances

Chaque fiche `data/lexicons/<id>.json` suit le schéma décrit dans [`docs/SCHEMA-LEXIQUE.md`](docs/SCHEMA-LEXIQUE.md). Elle contient :
- 35 à 50 termes de vocabulaire ;
- 25 à 35 formules ;
- des euphémismes et des substitutions ;
- 5 à 8 cadres de lecture ;
- 2 à 3 structures argumentatives ;
- le rapport aux chiffres, les métaphores, les travers et les registres ;
- les **codes visuels**, avec des motifs en français et en anglais pour les prompts ;
- des exemples et des **sources**.

Le rapport de recherche complet est dans [`docs/RAPPORT-RECHERCHE.md`](docs/RAPPORT-RECHERCHE.md), et les notes détaillées par domaine dans `docs/recherche/`.

- **Consulter** : bouton « bibliothèque » (le livre ouvert) dans la barre du haut.
- **Créer ou modifier** : « ✎ Dupliquer / éditer ». Les fiches personnelles vont dans `data/custom/` et remplacent la fiche d'origine si elles gardent le même `id`.
- **Valider** : `node scripts/validate-lexicons.js` (lexiques) et `node scripts/validate-topics.js` (banque de topics).
- **Tester le moteur sans navigateur** : `node scripts/selftest.js` (exécute les 3 exemples).

Les sections « codes visuels » sont des propositions de direction artistique, cohérentes avec les sources mais non documentées comme telles. Quelques citations reposent sur des sources secondaires ; les fiches le signalent.

---

## Sorties

- **Résultat** de chaque node : onglet « Résultat » de l'inspecteur, copiable en Markdown.
- **Dossier** : tout le raisonnement exporté en Markdown.
- **Short animé** :
  - storyboard en `.md` et `.json` ;
  - « copier tous les prompts vidéo » ;
  - prompts mis en forme pour Veo (avec l'audio), Kling, Seedance, Runway, Sora et les modèles open source Wan, LTX et Hunyuan (avec prompt négatif) ;
  - **Animatique** : lecture des scènes avec compteurs, barres, courbes, pictogrammes, frise, balance et schémas animés, sous-titres, et voix de synthèse française du navigateur.
- **Projets** : le bouton « enregistrer » enregistre dans `projects/` (avec le serveur) ou télécharge un `.lexinode.json`. La sauvegarde automatique se fait dans le navigateur.

---

## Architecture

```
lexinode/
├── server.js                 serveur Node sans dépendance : statique + /api/llm, /api/search, /api/lexicons, /api/projects
├── public/
│   ├── index.html, css/app.css
│   └── js/
│       ├── providers.js      appels Claude / OpenAI / Gemini / Ollama / compatible + recherche (partagé serveur ↔ navigateur)
│       ├── editor.js         canvas nodal (pan, zoom, fils de Bézier, ports typés, annuler/rétablir)
│       ├── nodes.js          catalogue des nodes
│       ├── engine.js         exécution topologique parallèle + cache par signature
│       ├── local-engine.js   moteur local (raisonnement à base de gabarits, comparaisons chiffrées)
│       ├── ai-engine.js      agents IA (prompts par rôle, normalisation JSON, vérification des sources)
│       ├── short.js          storyboard, minutage voix off, prompts par modèle vidéo
│       ├── video-models.js   profils Wan 3.0 / Seedance 2.5 / MiniMax H3, découpage en segments, node Générateur
│       ├── correlation.js    node Corrélation (statistiques, hypothèses) et node Topic aléatoire
│       ├── topics.js         banque de topics, tirage sans répétition, générateur combinatoire
│       ├── icons.js          jeu d'icônes SVG
│       ├── animatic.js       animatique jouable
│       ├── render.js         affichage des résultats, export Markdown
│       └── app.js            interface (palette, inspecteur, réglages, bibliothèque, projets, journal)
├── data/lexicons/            21 fiches d'éléments de langage (JSON)
├── data/examples/            projets d'exemple
├── data/topics/              banque de topics du node « Topic aléatoire » (sujets, paires, générateur)
├── docs/                     SCHEMA-LEXIQUE.md (schéma des fiches), RAPPORT-RECHERCHE.md, recherche/ (notes sourcées)
├── scripts/                  validation, exemples, build autonome
├── docker-compose.yml        Lexinode + Ollama + SearXNG
└── .env.example
```

**Ajouter un type de node** se fait en trois étapes :
1. le déclarer dans `nodes.js` (ports et champs) ;
2. écrire sa fonction locale dans `local-engine.js` ;
3. si besoin, écrire son agent dans `ai-engine.js`.

Le moteur, l'inspecteur et l'export le prennent ensuite en charge automatiquement.

Licence MIT.
