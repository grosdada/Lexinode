# Note de passation — installer Lexinode sur le VPS

Tu reprends un projet construit dans une autre session Claude Code, qui n'a pas eu accès au VPS de l'utilisateur. Ta mission : **installer Lexinode sur son VPS, accessible en ligne et protégé**, avec **une seule clé API : fal.ai**. L'utilisateur parle français, préfère un ton factuel et amical, et a un **budget limité** : va droit au but, pas de sous-agents ni d'exploration inutile.

> **Raccourci :** `sudo bash scripts/install-vps.sh [domaine]` fait les étapes 2 à 6 ci-dessous. Lis aussi `docs/DEBRIEF.md` (état complet, pièges, ce qui n'est pas vérifié). Si le script échoue, suis la procédure manuelle.

## Le projet en bref

- Lexinode est un atelier nodal : on relie des blocs (sujet, données, éléments de langage métiers, corrélations…), un moteur produit une réflexion, puis un short animé, puis des générations vidéo via fal.ai.
- **Zéro dépendance npm** : Node ≥ 18 suffit (`node server.js`, port 5177). Le `Dockerfile` utilise `node:22-alpine`.
- Fichiers clés : `server.js` (serveur et proxy des API), `public/js/` (interface), `data/lexicons/` (21 fiches), `data/topics/` (banque de topics), `.env.example`, `docker-compose.yml`, `README.md` (doc complète).
- Tests sans navigateur : `node scripts/selftest.js` doit afficher 5 lignes ✓.

## Ce que tu dois demander à l'utilisateur (et rien de plus)

1. L'accès SSH au VPS : hôte, utilisateur, et s'il est sous Debian ou Ubuntu.
2. S'il a un **nom de domaine** pointant vers le VPS. C'est conseillé pour le HTTPS, mais facultatif.
3. Le mot de passe qu'il veut pour l'appli. Sinon, génères-en un avec `openssl rand -base64 18` et donne-le lui.
4. Sa clé fal : **qu'il la colle lui-même dans `.env` sur le VPS**. Ne l'affiche jamais, ne la mets jamais dans une commande visible ni dans un commit.

## Procédure

### 1. Copier le projet sur le VPS

Depuis la machine où se trouve le dossier (ou le `lexinode.zip`) :
```bash
rsync -av --exclude .env --exclude dist lexinode/ USER@VPS:/opt/lexinode/
```
Sinon, envoie le zip avec `scp` puis lance `unzip` sur le VPS.

### 2. Docker

Vérifie `docker --version` et `docker compose version`. Si Docker manque, installe-le (Debian/Ubuntu : `curl -fsSL https://get.docker.com | sh`), après accord de l'utilisateur.

### 3. Le fichier `.env` (sur le VPS, dans `/opt/lexinode`)

```bash
cp .env.example .env && chmod 600 .env
```
Remplir au minimum :
```
FAL_KEY=…               ← collé par l'utilisateur
LEXINODE_PASSWORD=…     ← OBLIGATOIRE en ligne, sinon n'importe qui dépense ses crédits fal
LEXINODE_USER=…         ← facultatif
```
Laisse vides les autres clés : Anthropic, OpenAI, Gemini, MiniMax et DashScope ne sont pas nécessaires. Avec seulement `FAL_KEY`, l'appli choisit d'elle-même le fournisseur « fal.ai » pour les agents texte (OpenRouter via fal, modèle `google/gemini-2.5-flash`).

### 4. Lancer **seulement** le service Lexinode

**Piège :** dans `docker-compose.yml`, le service `lexinode` dépend d'`ollama` et de `searxng`, et il définit `OLLAMA_URL` et `SEARXNG_URL`. Sur un petit VPS, ne lance pas Ollama : il demande beaucoup de RAM, voire un GPU. Le plus simple est d'utiliser `docker run` :
```bash
cd /opt/lexinode
docker build -t lexinode .
docker run -d --name lexinode --restart unless-stopped --env-file .env \
  -p 127.0.0.1:5177:5177 \
  -v /opt/lexinode/projects:/app/projects -v /opt/lexinode/data/custom:/app/data/custom \
  lexinode
```
- Le port n'est publié que sur `127.0.0.1` : on passe par le reverse proxy (étape 5).
- Sans nom de domaine, publie `-p 5177:5177` et ouvre le port avec `ufw allow 5177/tcp`. Préviens alors l'utilisateur : en HTTP simple, le mot de passe circule en clair. Il vaut mieux prendre un domaine, ou passer par un tunnel SSH (`ssh -L 5177:127.0.0.1:5177 USER@VPS`).

### 5. HTTPS avec Caddy (si l'utilisateur a un domaine)

Installe Caddy (paquet officiel), puis écris dans `/etc/caddy/Caddyfile` :
```
lexinode.son-domaine.fr {
    reverse_proxy 127.0.0.1:5177
}
```
Ensuite :
```bash
systemctl reload caddy
```
Ouvre les ports 80 et 443 (`ufw allow 80,443/tcp`). Le certificat est automatique.

### 6. Vérifications (à faire toutes)

```bash
docker logs lexinode        # doit lister « fal.ai … clé ✓ (FAL_KEY) »
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5177/                # attendu : 401
curl -s -u "user:MOTDEPASSE" http://127.0.0.1:5177/api/status | head -c 400     # "fal":{… "configured":true}, "video":{"fal":true}
```
Puis, dans le navigateur, avec l'utilisateur :
1. Ouvrir l'adresse et se connecter avec le mot de passe.
2. Ouvrir un exemple, puis **Tout exécuter** en mode **Local** : ça doit marcher sans aucune clé.
3. Basculer sur **IA**. Dans Réglages, « Tester le fournisseur par défaut » doit répondre via fal.ai.
4. **Premier test vidéo, le moins cher** : node Générateur vidéo, **Wan 3.0**, résolution **720p**, puis « Générer ce segment » sur **un seul** segment (environ 0,10 $ par seconde).

### 7. Ce qui n'a pas pu être vérifié avant toi

- **Aucun appel réel à fal.ai n'a été fait**, faute de clé. La chaîne complète (envoi, file d'attente, statut, récupération de la vidéo) a été testée contre un faux serveur qui imite l'API de file d'attente de fal (`queue.fal.run`). Si le premier vrai appel échoue, lis le message d'erreur dans le node ou avec `docker logs lexinode`.
- Les identifiants fal préremplis viennent des pages de fal, consultées en novembre 2026 :
  - Seedance 2.5 : `bytedance/seedance-2.5/text-to-video` (vérifié) ;
  - Wan 3.0 : `alibaba/wan-3.0/text-to-video` (vérifié) ;
  - MiniMax H3 : `minimax/h3/text-to-video` (classique) et `minimax/h3-max/text-to-video` (**H3 Max, modèle par défaut du Générateur vidéo**). Schémas OpenAPI de fal lus le 02/11 : prompt jusqu'à 50 000 caractères, durée 5 à 15 s, résolutions 480P/768P/2K/4K (classique) et 480P/768P/1080P (Max, `prompt_expansion_mode` obligatoire, réglé sur `disabled`) ; prix lus sur les pages fal ; **jamais appelés pour de vrai**. L'ancien identifiant `minimax/hailuo-03/…` (prompt limité à 2000 caractères, 2K seul) n'est plus utilisé.
- En cas d'erreur 404 ou 422, corrige l'identifiant ou le corps JSON dans **Réglages → Génération vidéo**, sans toucher au code. Le code correspondant est dans `public/js/video-models.js` (`falId`, `falTemplate`).
- Le dialogue en français n'est pas confirmé sur Seedance 2.5. L'appli prévient l'utilisateur et propose « voix ajoutée au montage ».

### 8. Entretien

- Journaux : `docker logs -f lexinode`.
- Mise à jour : recopier les fichiers, puis `docker build -t lexinode . && docker rm -f lexinode`, puis la commande `docker run` de l'étape 4.
- À sauvegarder : `/opt/lexinode/projects` et `/opt/lexinode/data/custom`.

## Règles

- Ne jamais committer ni afficher le contenu de `.env`.
- `LEXINODE_PASSWORD` est obligatoire dès que l'appli est joignable depuis Internet.
- Demande l'accord de l'utilisateur avant d'installer un paquet ou d'ouvrir un port.
- Dès que c'est en ligne, donne-lui l'adresse finale, son identifiant et son mot de passe, en une ligne claire.
