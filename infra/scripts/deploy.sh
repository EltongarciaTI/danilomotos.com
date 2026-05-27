#!/usr/bin/env bash
# Deploy script — roda na VPS via SSH a partir do GitHub Actions
#
# Uso esperado:
#   ssh elton@host "bash -s" < deploy.sh <IMAGE_TAG>
# OU
#   ssh elton@host "/home/elton/danilomotos/infra/scripts/deploy.sh <IMAGE_TAG>"
#
# Argumentos:
#   $1 = tag da imagem Docker da API (ex: "main-abc1234" ou "latest")
#
# Pré-requisitos:
#   - /home/elton/danilomotos/ existe com o repo
#   - /home/elton/danilomotos/infra/.env preenchido
#   - elton no grupo docker
#   - logado no ghcr (docker login ghcr.io)

set -euo pipefail

IMAGE_TAG="${1:-latest}"
PROJECT_DIR="/home/elton/danilomotos"
INFRA_DIR="${PROJECT_DIR}/infra"
COMPOSE="docker compose --env-file ${INFRA_DIR}/.env -f ${INFRA_DIR}/compose.yml"

log() { echo "[deploy $(date -u +%H:%M:%S)] $*"; }

log "===== deploy iniciado · tag=${IMAGE_TAG} ====="

cd "$PROJECT_DIR"

# 1) Pull do código novo (assets estáticos, Caddyfile, migrations)
log "git fetch + reset"
git fetch --quiet origin main
git reset --hard origin/main

# 2) Se IMAGE_TAG não for "latest", sobrescreve o image no compose temporariamente
#    via override variable. Setamos a tag completa no .env.deploy (não commitado).
log "preparando imagem da API: ${IMAGE_TAG}"
echo "API_IMAGE=ghcr.io/eltongarciati/danilomotos-api:${IMAGE_TAG}" > "${INFRA_DIR}/.env.deploy"

# 3) Pull da imagem (ou build local se faltar)
log "docker pull ghcr.io/eltongarciati/danilomotos-api:${IMAGE_TAG}"
if ! docker pull "ghcr.io/eltongarciati/danilomotos-api:${IMAGE_TAG}"; then
  log "AVISO: pull falhou — fazendo build local (fallback)"
  $COMPOSE build api
fi

# 4) Restart graceful — postgres/cloudflared continuam, só api+caddy mudam
log "compose up -d (rolling restart)"
$COMPOSE --env-file "${INFRA_DIR}/.env" --env-file "${INFRA_DIR}/.env.deploy" up -d --no-deps api caddy

# 5) Aguarda healthcheck da API (max 30s)
log "aguardando API ficar healthy..."
for i in $(seq 1 30); do
  if docker inspect --format='{{.State.Health.Status}}' danilomotos-api 2>/dev/null | grep -q healthy; then
    log "API healthy em ${i}s"
    break
  fi
  sleep 1
  if [ "$i" -eq 30 ]; then
    log "ERRO: API não ficou healthy em 30s"
    docker logs --tail 50 danilomotos-api
    exit 1
  fi
done

# 6) Smoke test interno
log "smoke test /api/health"
if ! docker exec danilomotos-caddy wget -qO- http://api:3000/api/health | grep -q '"status":"ok"'; then
  log "ERRO: /api/health não retornou status ok"
  exit 2
fi

# 7) Limpa imagens antigas (mantém 3 últimas)
log "limpeza de imagens antigas"
docker image prune -f --filter "until=72h" >/dev/null 2>&1 || true

log "===== deploy OK ====="
$COMPOSE ps --format 'table {{.Name}}\t{{.Status}}'
