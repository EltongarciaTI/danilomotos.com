# RUNBOOK — danilomotos.com na VPS

> Guia operacional pra rodar, debugar, restaurar e fazer manutenção.
> Stack: Caddy + API Hono + Postgres 16 + Cloudflare Tunnel + backup automático.

## Stack atual

```
Cliente (browser)
    │ HTTPS
    ▼
[Cloudflare CDN/WAF]
    │
    ▼  Cloudflare Tunnel (outbound, sem porta aberta na VPS)
[VPS Hostinger 2.24.117.195]
    │
    └─ Network Docker: danilomotos-net
        │
        ├─ danilomotos-cloudflared  ← conecta à conta CF
        ├─ danilomotos-caddy        ← reverse proxy + arquivos estáticos
        ├─ danilomotos-api          ← Hono (Node 22)
        ├─ danilomotos-postgres     ← Postgres 16
        └─ danilomotos-backup       ← cron diário 04:00
```

## Comandos do dia a dia (logado como `elton@2.24.117.195`)

### Status geral
```bash
cd ~/danilomotos/infra
docker compose --env-file .env ps
```

### Ver logs
```bash
docker compose --env-file .env logs -f          # todos
docker compose --env-file .env logs -f api      # só API
docker compose --env-file .env logs -f caddy    # só Caddy
docker logs danilomotos-cloudflared --tail 50
```

### Restart com zero downtime
```bash
docker compose --env-file .env restart api      # restart só API
docker compose --env-file .env up -d            # garante tudo no ar (sem rebuild)
```

### Rebuild da imagem da API após mudança no código
```bash
docker compose --env-file .env build api
docker compose --env-file .env up -d api
```

### Smoke test pós-deploy
```bash
bash infra/scripts/smoke-test.sh                  # via URL pública
docker exec danilomotos-caddy wget -qO- http://api:3000/api/health   # interno
```

## Deploy manual (alternativa ao CI/CD)

```bash
cd ~/danilomotos
git fetch origin && git reset --hard origin/main
bash infra/scripts/deploy.sh latest
```

## Banco de dados

### Conectar via psql (dentro do container)
```bash
docker exec -it danilomotos-postgres psql -U danilomotos -d danilomotos
```

### Queries úteis
```sql
-- Quantas motos por status
SELECT status, count(*) FROM motos GROUP BY status;

-- Usuários do admin
SELECT id, email, last_sign_in_at FROM users;

-- Tamanho de cada tabela
SELECT relname AS table, pg_size_pretty(pg_total_relation_size(relid)) AS size
  FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC;

-- Sessões ativas (JWT não revogados)
SELECT count(*) FROM sessions WHERE expires_at > now();
```

### Resetar senha de um admin
```sql
-- Gerar bcrypt local: `python -c "import bcrypt; print(bcrypt.hashpw(b'NOVA_SENHA', bcrypt.gensalt(10)).decode())"`
UPDATE users SET encrypted_password = '$2b$10$...' WHERE email = 'lucas@admin.com';
```

### Criar novo admin
```sql
INSERT INTO users (email, encrypted_password, email_confirmed_at)
VALUES ('novo@admin.com', '$2b$10$HASH_AQUI', now());
```

### Revogar todas as sessões (forçar relogin de todos)
```sql
DELETE FROM sessions;
```

## Backups

### Onde estão
Volume Docker `danilomotos_backups`, mapeado em `/backups` do container.

```bash
# Listar backups
docker exec danilomotos-backup ls -lh /backups
```

### Backup manual (extra, não-cron)
```bash
docker exec danilomotos-backup /backup.sh
```

### Restaurar DB
```bash
# 1. Para a API (pra ninguém escrever durante restore)
docker compose --env-file .env stop api

# 2. Limpa schema e restaura
docker exec -i danilomotos-postgres psql -U danilomotos -d danilomotos -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
docker exec danilomotos-backup sh -c "gunzip < /backups/db-YYYYMMDD.sql.gz | psql -h postgres -U danilomotos -d danilomotos"

# 3. Sobe API de volta
docker compose --env-file .env up -d api
```

### Restaurar fotos
```bash
# Extrai tar zst no volume uploads
docker exec danilomotos-backup sh -c "cd /uploads && rm -rf * && tar --zstd -xf /backups/uploads-YYYYMMDD.tar.zst"
```

### Copiar backup pra fora da VPS (off-site)
```bash
# Do seu PC local, via SFTP
python .vps/ssh_run.py --get /home/elton/danilomotos/.backups-copy/db-YYYYMMDD.sql.gz ./db.sql.gz
```

## Cloudflare Tunnel

### Status do tunnel
```bash
docker logs danilomotos-cloudflared --tail 30
# Esperado: 4 conexões "Registered tunnel connection"
```

### Ver configuração atual
No painel CF: **Zero Trust → Networks → Tunnels → danilomotos-tunnel**

### Adicionar hostname novo (ex: subdomínio adicional)
Via API:
```bash
source ~/.cloudflare/credentials
TUNNEL_ID=2aacc987-d4ad-4ee5-9cd1-bc94984ec5ae
# adicionar via PUT /accounts/$ID/cfd_tunnel/$TUNNEL_ID/configurations
```

Ou painel CF: Tunnel → Edit → Public Hostname → Add.

## Troubleshooting

### Site fora do ar
```bash
# 1. Confirma containers
docker compose --env-file .env ps

# 2. API saudável?
docker exec danilomotos-caddy wget -qO- http://api:3000/api/health

# 3. Tunnel conectado?
docker logs danilomotos-cloudflared --tail 5 | grep "Registered"

# 4. DNS resolvendo?
nslookup danilomotos.oqay.pro
```

### "supabaseUrl is required" no dashboard
Cache do browser pegou `config.js` antigo. Forçar nova versão:
1. Bumpar versão em `dashboard.html` e `dashboard.js` (`?v=YYYYMMDDx`)
2. Re-upload pro VPS
3. Usuário faz `Ctrl+Shift+R`

### API retorna 500
```bash
docker logs danilomotos-api --tail 50
# Procura "[api] unhandled:" — mostra o stack trace
```

### Postgres "connection refused"
```bash
docker compose --env-file .env restart postgres
sleep 5
docker compose --env-file .env restart api
```

### Caddy "Unexpected next token"
Syntax error no Caddyfile. Validar antes de aplicar:
```bash
docker run --rm -v ~/danilomotos/infra/caddy/Caddyfile:/etc/caddy/Caddyfile:ro \
  caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

### Disco cheio
```bash
df -h
docker system prune -af --volumes  # CUIDADO: apaga volumes não-usados também
docker image prune -af --filter "until=168h"  # imagens > 7 dias
```

## Monitoramento

### Healthcheck endpoints
```bash
curl -fsS https://danilomotos.oqay.pro/health         # caddy: "ok"
curl -fsS https://danilomotos.oqay.pro/api/health     # api+db: JSON
```

### Recursos
```bash
docker stats --no-stream  # CPU/mem por container
free -h                    # mem da VPS
df -h /                    # disco
htop                       # geral
```

## Mudar versão da imagem da API

Via deploy.sh:
```bash
bash infra/scripts/deploy.sh main-abc1234   # tag específica do GHCR
bash infra/scripts/deploy.sh latest          # última
```

## Rotacionar JWT_SECRET (logout forçado de todos)

```bash
# 1. Gerar novo
NEW=$(openssl rand -hex 64)
# 2. Editar .env (linha JWT_SECRET=)
nano ~/danilomotos/infra/.env
# 3. Restart API
docker compose --env-file .env restart api
# 4. (Opcional) Apagar sessões antigas
docker exec danilomotos-postgres psql -U danilomotos -d danilomotos -c "DELETE FROM sessions;"
```

## Adicionar nova tabela à whitelist da API genérica

Editar `infra/api/src/db-rest.js` no `ALLOWED_TABLES` Set. Rebuild + restart:
```bash
docker compose --env-file .env build api
docker compose --env-file .env up -d api
```

## Subir uma feature nova

```bash
# Local (no seu PC)
git checkout -b feature/nova-coisa
# edita arquivos...
git commit -am "feat: nova coisa"
git push origin feature/nova-coisa
# Abre PR → CI roda validate em ~30s

# Quando merge na main:
# → CI/CD automático faz build+deploy em ~3min
# → Smoke test pós-deploy valida 10 endpoints
# → Se algo quebra, deploy é abortado
```

## Contatos / referências

- **Repo:** `github.com/EltongarciaTI/danilomotos.com`
- **Painel Cloudflare:** dash.cloudflare.com (conta Lucas)
- **Painel Hostinger:** hpanel.hostinger.com (acesso Lucas)
- **Painel Supabase (legado):** supabase.com (projeto `zhivqujoneqzviasioug`)
- **CI/CD workflows:** `.github/workflows/ci-cd.yml`
- **Configuração de secrets do CI:** `.github/SECRETS.md`

## URLs

| Ambiente | URL |
|---|---|
| **Produção (atual)** | https://danilomotos.com (GH Pages + Supabase — legado) |
| **Nova VPS (staging via tunnel)** | https://danilomotos.oqay.pro |
| **API** | https://danilomotos.oqay.pro/api/* |
| **Storage motos** | https://danilomotos.oqay.pro/storage/motos/* |
| **Storage financeiro** | https://danilomotos.oqay.pro/storage/financeiro/* |
