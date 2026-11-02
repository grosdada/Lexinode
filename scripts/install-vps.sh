#!/usr/bin/env bash
# Installation de Lexinode sur un VPS Debian/Ubuntu (Docker). Relançable sans risque.
# Usage :  sudo bash scripts/install-vps.sh [domaine.exemple.fr]
#   - sans domaine : appli sur http://IP:5177 (mot de passe en clair sur le réseau : déconseillé)
#   - avec domaine : HTTPS automatique via Caddy (le DNS doit déjà pointer vers ce VPS)
set -euo pipefail

DOMAIN="${1:-}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

[ "$(id -u)" = 0 ] || { echo "Lancez ce script avec sudo."; exit 1; }

say "1/5 Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
docker --version

say "2/5 Fichier .env"
if [ ! -f .env ]; then
  cp .env.example .env
  chmod 600 .env
fi
setenv() { # setenv CLE valeur : remplace la ligne (même commentée) ou l'ajoute
  local k="$1" v="$2"
  if grep -qE "^#? ?${k}=" .env; then sed -i -E "s|^#? ?${k}=.*|${k}=${v}|" .env; else echo "${k}=${v}" >> .env; fi
}
getenv() { grep -E "^${1}=" .env | head -1 | cut -d= -f2-; }

if [ -z "$(getenv FAL_KEY)" ]; then
  read -r -s -p "Collez votre clé fal.ai (rien ne s'affiche) : " FALK; echo
  [ -n "$FALK" ] || { echo "Clé fal vide : abandon."; exit 1; }
  setenv FAL_KEY "$FALK"
fi
if [ -z "$(getenv LEXINODE_PASSWORD)" ]; then
  PASS="$(openssl rand -base64 18 | tr -d '/+=' | head -c 20)"
  setenv LEXINODE_PASSWORD "$PASS"
  setenv LEXINODE_USER "lexinode"
  echo "Mot de passe généré (notez-le) : lexinode / $PASS"
fi
setenv HOST "0.0.0.0"

say "3/5 Construction et lancement (Lexinode seul, sans Ollama ni SearXNG)"
mkdir -p projects data/custom
docker build -t lexinode .
docker rm -f lexinode >/dev/null 2>&1 || true
if [ -n "$DOMAIN" ]; then PUBLISH="127.0.0.1:5177:5177"; else PUBLISH="5177:5177"; fi
docker run -d --name lexinode --restart unless-stopped --env-file .env \
  -p "$PUBLISH" -v "$DIR/projects:/app/projects" -v "$DIR/data/custom:/app/data/custom" lexinode

say "4/5 HTTPS"
if [ -n "$DOMAIN" ]; then
  if ! command -v caddy >/dev/null; then
    apt-get update -y && apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -y && apt-get install -y caddy
  fi
  printf '%s {\n    reverse_proxy 127.0.0.1:5177\n}\n' "$DOMAIN" > /etc/caddy/Caddyfile
  systemctl reload caddy || systemctl restart caddy
  command -v ufw >/dev/null && ufw allow 80,443/tcp || true
  URL="https://$DOMAIN"
else
  command -v ufw >/dev/null && ufw allow 5177/tcp || true
  URL="http://$(curl -s ifconfig.me || echo IP_DU_VPS):5177"
  echo "Attention : sans HTTPS, le mot de passe circule en clair. Préférez un domaine ou un tunnel SSH."
fi

say "5/5 Vérifications"
sleep 2
CODE="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5177/ || true)"
echo "Sans mot de passe : HTTP $CODE (attendu : 401)"
U="$(getenv LEXINODE_USER)"; P="$(getenv LEXINODE_PASSWORD)"
curl -s -u "${U:-x}:${P}" http://127.0.0.1:5177/api/status | grep -o '"video":{[^}]*}' || echo "Statut illisible : voir 'docker logs lexinode'"
echo
echo "Adresse : $URL"
echo "Identifiant : ${U:-(aucun)}   Mot de passe : voir .env (LEXINODE_PASSWORD)"
