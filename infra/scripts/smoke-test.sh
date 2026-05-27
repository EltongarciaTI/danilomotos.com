#!/usr/bin/env bash
# Smoke test pós-deploy — chamado pelo CI ou manualmente
# Verifica que os endpoints críticos respondem corretamente via URL pública
#
# Uso: BASE_URL=https://danilomotos.oqay.pro ./smoke-test.sh
#      ou: ./smoke-test.sh  (usa BASE_URL padrão)

set -uo pipefail

BASE_URL="${BASE_URL:-https://danilomotos.oqay.pro}"
PASS=0
FAIL=0

# Cores
RED=$'\e[31m'
GREEN=$'\e[32m'
YELLOW=$'\e[33m'
RESET=$'\e[0m'

_pass() { echo "${GREEN}OK${RESET} $*"; PASS=$((PASS+1)); }
_fail() { echo "${RED}FAIL${RESET} $*"; FAIL=$((FAIL+1)); }

# check_status NAME URL EXPECTED_CODE
check_status() {
  local name="$1" url="$2" expect="$3"
  printf "  %-45s " "$name"
  local actual; actual=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 "$url")
  [[ "$actual" == "$expect" ]] && _pass "($actual)" || _fail "(esperado $expect, recebi $actual)"
}

# check_body NAME URL REGEX
check_body() {
  local name="$1" url="$2" regex="$3"
  printf "  %-45s " "$name"
  local out; out=$(curl -sS --max-time 10 "$url")
  [[ "$out" =~ $regex ]] && _pass || { _fail; echo "    regex esperado: $regex"; echo "    recebi: $(echo "$out" | head -c 200)"; }
}

# check_post_status NAME URL JSON EXPECTED_CODE
check_post_status() {
  local name="$1" url="$2" json="$3" expect="$4"
  printf "  %-45s " "$name"
  local actual; actual=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 \
    -X POST -H "Content-Type: application/json" -d "$json" "$url")
  [[ "$actual" == "$expect" ]] && _pass "($actual)" || _fail "(esperado $expect, recebi $actual)"
}

echo
echo "=== Smoke test: $BASE_URL ==="
echo

# 1. Site estático
check_status "GET /              (HTML home)"      "$BASE_URL/"               200
check_status "GET /admin.html    (HTML admin)"     "$BASE_URL/admin.html"     200
check_status "GET /assets/js/api.js (client)"      "$BASE_URL/assets/js/api.js" 200

# 2. API
check_body   "GET /api/health    (DB conectado)"   "$BASE_URL/api/health"     '"status":"ok"'
check_body   "GET /api/motos     (catalogo)"       "$BASE_URL/api/motos?status=ativo" '\['
check_body   "GET /api/motos/count"                "$BASE_URL/api/motos/count?status=all" '"count":'

# 3. Auth
check_post_status "POST login senha errada => 401" "$BASE_URL/api/auth/login" '{"email":"x","password":"x"}' 401
check_status      "GET /api/auth/me sem cookie => 401" "$BASE_URL/api/auth/me" 401

# 4. Storage
check_status "GET /storage/motos/pop2025/capa.jpg" "$BASE_URL/storage/motos/pop2025/capa.jpg" 200

# 5. 404
check_status "GET /api/nao-existe => 404"          "$BASE_URL/api/nao-existe" 404

echo
echo "==============================="
echo "Resultado: ${GREEN}${PASS} OK${RESET} · ${RED}${FAIL} FAIL${RESET}"
echo "==============================="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
