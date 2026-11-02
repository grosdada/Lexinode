# Débrief complet : Lexinode

Document de passation pour le Claude Code qui reprend le projet. À lire avec `CLAUDE.md` (la procédure VPS) et `README.md` (la doc utilisateur).

## 1. Qui, quoi, pourquoi

L'utilisateur (français, ton factuel et amical, **budget limité**) voulait une appli **nodale** : on pose des blocs, on les relie autour des « éléments de langage » de plusieurs métiers (politique, médecine, mode, audiovisuel…), et un moteur déroule une réflexion. On peut mélanger plusieurs langages, ajouter des événements (avec des événements précédents), comparer des données même absurdes (pantoufles irlandaises contre girafons de Melbourne) et traduire le résultat dans la vision d'un métier ou d'une sociologie. La fin de chaîne produit des prompts pour des mini-shorts animés de style film institutionnel, puis lance la génération vidéo. Le moteur doit marcher avec des API de pointe (Claude, OpenAI/Codex, Gemini) et en 100 % open source (Ollama, serveur compatible OpenAI).

Demandes ajoutées en cours de route : node Corrélation, node Topic aléatoire avec une grosse banque, icônes sobres à couleur plate, générateur vidéo (Wan 3.0, Seedance 2.5, MiniMax H3) par segments de 15 ou 30 s, **une seule clé fal.ai** pour tout, installation sur un VPS.

## 2. État actuel (tout fonctionne en local, testé)

- Zéro dépendance npm : Node ≥ 18. `node server.js` → http://localhost:5177.
- **16 nodes** : Sujet, Topic aléatoire, Brief, Note, Événement, Donnée, Éléments de langage, Mixeur, Prisme, Décodeur, Comparaison, Corrélation, Réflexion, Table ronde, Agent spécialiste, Direction artistique, Short animé, Générateur vidéo.
- **Deux moteurs** : local (gabarits et règles issus des fiches, calculs réels sur les chiffres) et agents IA. Routage possible par rôle d'agent et par fournisseur.
- **21 fiches** dans `data/lexicons/` (15 métiers, 6 grilles sociologiques), issues d'une recherche documentaire sourcée (rapport dans `docs/RAPPORT-RECHERCHE.md`, notes dans `docs/recherche/`).
- **Banque de topics** dans `data/topics/` : 600 sujets, 200 paires, 40 gabarits (≈ 5,5 millions de combinaisons).
- 4 projets d'exemple dans `data/examples/`.
- 3 formes de livraison : serveur Node, Docker, fichier HTML autonome (`node scripts/build-standalone.js` → `dist/`).

### Tests à lancer
```bash
node scripts/selftest.js          # exemples + tirages, doit afficher 5 lignes ✓
node scripts/validate-lexicons.js # 21 ✓
node scripts/validate-topics.js   # 0 erreur (aucun doublon entre fichiers)
```

## 3. Architecture (essentiel)

| Fichier | Rôle |
|---|---|
| `server.js` | Statique + `/api/llm`, `/api/search`, `/api/video/{submit,status}`, `/api/lexicons`, `/api/topics`, `/api/projects`. Mot de passe HTTP Basic si `LEXINODE_PASSWORD`. |
| `public/js/providers.js` | Appels Claude, OpenAI (API Responses), Gemini, Ollama, compatible OpenAI, **fal (LLM via OpenRouter)**, recherche web, **vidéo fal / MiniMax / DashScope**. Partagé serveur et navigateur. |
| `nodes.js`, `editor.js`, `engine.js` | Catalogue des nodes, canvas, exécution topologique parallèle avec cache par signature. |
| `local-engine.js`, `correlation.js`, `short.js` | Moteur local, corrélations, storyboard et prompts. |
| `ai-engine.js` | Un agent par rôle (chercheur, analyste, rédacteur, traducteur, débatteur, spécialiste, scénariste). |
| `video-models.js` | Profils des 3 modèles vidéo, découpage en segments, prompts par modèle. |
| `topics.js` | Tirage sans répétition (historique navigateur), générateur combinatoire. |
| `icons.js`, `animatic.js`, `render.js`, `app.js` | Icônes SVG, animatique jouable, rendu des résultats, interface. |

Ajouter un node : le déclarer dans `nodes.js`, écrire `LX.local.<type>` et éventuellement `LX.ai.compute.<type>`.

## 4. La clé unique fal.ai

Avec seulement `FAL_KEY` :
- **Vidéo** : identifiants préremplis dans `public/js/video-models.js` (`falId`) :
  - `alibaba/wan-3.0/text-to-video` (vérifié sur fal) ;
  - `bytedance/seedance-2.5/text-to-video` (vérifié) ;
  - `minimax/hailuo-03/text-to-video` (**déduit d'un lien, non confirmé**).
- **Agents texte** : fournisseur `fal` = `https://fal.run/openrouter/router/openai/v1`, en-tête `Authorization: Key …`, modèle par défaut `google/gemini-2.5-flash`. L'appli bascule seule sur ce fournisseur si c'est la seule clé configurée.
- Tarifs publics notés en novembre 2026 : Wan 3.0 0,05 / 0,10 / 0,20 $/s (480p / 720p / 1080p) ; Seedance 2.5 ≈ 0,22 / 0,47 / 1,16 $/s ; H3 non publié.

## 5. Ce qui N'A PAS été vérifié (à traiter en premier sur le VPS)

1. **Aucun appel réel à fal.ai** : pas de clé dans la session. La chaîne (envoi, file d'attente `queue.fal.run`, statut, récupération `video.url`) a été testée contre un faux serveur. Au premier vrai essai, regarder le message d'erreur du node et `docker logs lexinode`.
2. **Corps des requêtes fal** : les paramètres viennent des pages fal consultées. Ils sont modifiables sans toucher au code, dans Réglages → Génération vidéo (`falTemplate`). Points d'attention :
   - Seedance : `duration` est une **chaîne** (`"15"`), `aspect_ratio`, `resolution` en minuscules, `generate_audio` ;
   - Wan : `duration` entier, paramètre audio nommé `audio`, `aspect_ratio` accepte `adaptive` ;
   - H3 : noms de paramètres non confirmés (`duration`, `aspect_ratio` supposés).
3. **Agents texte via fal/OpenRouter** : testé contre un faux serveur seulement. Si le modèle par défaut est refusé, en choisir un autre dans Réglages.
4. **Seedance 2.5 et dialogue en français** : non confirmé. L'appli prévient et propose « voix off ajoutée au montage ».
5. **Pas d'API directe Seedance** (signature BytePlus non implémentée) : uniquement via fal.
6. Les spécifications des trois modèles viennent de skills datés d'août 2026 : à revérifier.
7. Les données de la démo sont **fictives** (marquées comme telles dans l'appli).

## 6. Pièges connus

- `docker-compose.yml` lie Lexinode à Ollama et SearXNG : sur un petit VPS, ne pas lancer toute la pile. Le script `scripts/install-vps.sh` lance Lexinode seul.
- Sans `LEXINODE_PASSWORD`, quiconque atteint le port peut dépenser les crédits fal : **toujours** le définir en ligne.
- Les clés ne sont lues qu'au démarrage : redémarrer le conteneur après modification de `.env`.
- Les `localStorage` du navigateur gardent l'historique des tirages de topics et l'autosauvegarde : ils ne sont pas partagés entre appareils.
- Les pictogrammes de l'animatique (girafe, pantoufle…) sont encore des émojis : ils font partie du contenu affiché. Piste d'amélioration : des pictos SVG assortis.

## 7. Installer sur le VPS

```bash
git clone https://github.com/grosdada/Lexinode.git /opt/lexinode
cd /opt/lexinode
sudo bash scripts/install-vps.sh lexinode.mon-domaine.fr   # avec HTTPS (DNS déjà pointé)
# ou, sans domaine (HTTP, déconseillé) :
sudo bash scripts/install-vps.sh
```
Le script installe Docker si besoin, demande la clé fal (saisie masquée), génère un mot de passe, lance Lexinode seul, configure Caddy si un domaine est fourni, puis vérifie : refus sans mot de passe (401), `video.fal: true` avec. À la fin, il affiche l'adresse.

Si le script échoue, la procédure manuelle détaillée est dans `CLAUDE.md`.

## 8. Après l'installation

1. Ouvrir l'adresse, se connecter.
2. Exemple « pantoufles × girafons » → Tout exécuter en mode **Local** (doit marcher sans aucune clé).
3. Passer en **IA** → Réglages → « Tester le fournisseur par défaut » (doit répondre via fal).
4. Générateur vidéo, **Wan 3.0 en 720p**, **un seul segment** (≈ 0,10 $/s).
5. Si tout est bon : donner à l'utilisateur l'adresse, l'identifiant et le mot de passe, en une ligne.

## 9. Pistes d'évolution (non demandées, à proposer seulement)

- Pictos SVG pour l'animatique.
- Assembler automatiquement les segments vidéo (ffmpeg) avec la voix off.
- Image-to-video / reference-to-video via fal pour garder la cohérence entre segments.
- Mise en cache et téléchargement des vidéos sur le VPS (les URL fal peuvent expirer).
