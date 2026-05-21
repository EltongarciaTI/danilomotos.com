# 🔍 Auditoria + Hardening do Supabase — Danilo Motos

> **Auditado e aplicado em 21/05/2026** via Management API + Storage API.
> Projeto: `zhivqujoneqzviasioug` · Região: **us-west-2** · PostgreSQL 17.6.1
> Plano: **PRO** (downgrade pro Free recomendado após validar)

---

## ✅ Estado FINAL (após hardening)

| Área | Estado |
|------|--------|
| **Auth** | signup desabilitado · senha 10+ com HIBP · site_url=danilomotos.com · 1 usuário (Danilo) |
| **DB** | 1 tabela só (`motos`) · 2 policies limpas · trigger `updated_at` automático |
| **Storage** | 1 bucket (`motos`) · limit 5MB · só JPG/PNG/WebP · 0 órfãos · 4 policies limpas |
| **Permissões** | `anon` só com SELECT (REFERENCES/TRIGGER são inofensivos) |

---

## 📋 Tudo que foi corrigido (16 fixes aplicados)

### 🔐 FASE 1 — Segurança (6 itens)

| # | Fix | Antes | Depois |
|---|-----|-------|--------|
| A1 | Signup público desabilitado | `disable_signup: false` ⚠️ | `disable_signup: true` ✅ |
| A2 | Usuário zumbi removido | `admin@danilomotos.com` (abandonado) | deletado ✅ |
| A3 | `site_url` corrigido | `http://localhost:3000` ⚠️ | `https://danilomotos.com` ✅ |
| A4 | `uri_allow_list` populado | `""` ⚠️ | inclui prod + localhost:5500 ✅ |
| A5 | Política de senha endurecida | `min_length: 6`, sem HIBP | `min_length: 10`, HIBP ativo, requer maiúscula/minúscula/número ✅ |
| A6 | Grants do `anon` revogados | INSERT/UPDATE/DELETE/TRUNCATE ⚠️ | só SELECT ✅ |

### 🧹 FASE 2 — Faxina (8 itens)

| # | Fix | Resultado |
|---|-----|-----------|
| M1 | 5 tabelas financeiras vazias dropadas | `financial_*`, `motorcycle_*` removidas |
| M2 | Bucket `MOTOS` (maiúsculo) deletado | bucket lixo de 0 bytes removido |
| M3 | Bucket `financeiro` deletado | bucket órfão removido |
| M5 | 7 policies duplicadas em `motos` → 2 limpas | `motos_public_read` + `motos_auth_write` |
| M6 | 15 policies duplicadas em `storage` → 4 limpas | `storage_motos_*` (read/insert/update/delete) |
| M7 | `file_size_limit` setado | 5 MB max por upload |
| M8 | `allowed_mime_types` restrito | só `image/jpeg`, `image/png`, `image/webp` |
| M9 | `capa_path` da `pop2025` corrigido | era null, agora `pop2025/capa.jpg` |
| B3 | Trigger `updated_at` consolidado | 3 triggers duplicados → 1 (`trg_motos_updated_at`) |

### 🗑️ FASE 3 — Limpeza de órfãos (1 operação massiva)

**33 arquivos órfãos deletados** em 19 pastas de motos que não existem mais no DB:
```
biz-125-2014 (5)        pop-110-2023 (1)
cg-titan-150-2013 (1)   pop-110-2025 (1)
factor-preta (3)        pop2013 (1)
fan-150-atrasada (1)    start-160-1920 (1)
fan-160-2016 (1)        start-160-2019 (5)
fan125-preta-atrasada(1) titan160azul (1)
pop-100-2008 (1)        titan99 (1)
pop-100-2008-b (1)      titanks-2003-laranja (1)
pop-100-preta (5)       xre-300 (1)
pop-110-2017 (1)
```

---

## 📊 Antes vs Depois

| Métrica | Antes 🔴 | Depois 🟢 |
|---------|----------|-----------|
| Tabelas no schema public | 6 (1 em uso + 5 vazias) | **1** |
| Usuários Auth | 2 (1 zumbi + 1 ativo) | **1** |
| Buckets de Storage | 3 (1 real + 2 lixo) | **1** |
| Arquivos no Storage | 169 (33 órfãos) | **136** |
| Storage size | 253 MB | **227 MB** (-26 MB) |
| Policies em `motos` | 7 (duplicadas) | **2** |
| Policies em `storage.objects` | 15 (duplicadas) | **4** |
| Triggers `updated_at` | 3 | **1** |
| `anon` privileges | INSERT/UPDATE/DELETE/TRUNCATE | **só SELECT** |
| Signup público | aberto | **fechado** |
| Senha mínima | 6 chars sem requisitos | **10 chars + HIBP** |
| `site_url` | `http://localhost:3000` | **`https://danilomotos.com`** |

---

## 🎯 Próximos passos (você faz)

### 1. Atualizar senha do Danilo (importante!)
A política nova exige 10 caracteres com maiúscula + minúscula + número. Se a senha atual dele é só "123456", **ele ainda consegue logar com a antiga** (a política nova só se aplica a senhas novas). Mas é boa ideia trocar pra uma forte:
- Login no admin
- (Função "trocar senha" — se não tiver no admin, faz via painel Supabase: Auth → Users → Reset password)

### 2. Migrar fotos existentes (compressão)
As 136 fotos ainda estão pesadas (média 1.7 MB). Roda 1 vez o script:
```bash
cd danilomotos.com
cp .env.example .env
# cola SUPABASE_SERVICE_ROLE em .env (já temos: serve_role do projeto)
npm install
npm run optimize:storage -- --dry-run    # vê o que vai mudar
npm run optimize:storage                  # aplica
```
Resultado esperado: **227 MB → ~25 MB** (-90%).

### 3. Downgrade pro Free (R$140 → R$0)
Após a migração das fotos:
- Painel Supabase → Settings → Billing → Downgrade to Free
- Free tem 5 GB egress/mês — com fotos otimizadas, sobra muito.

---

## 🔑 Tokens/keys usados nesta auditoria

- **PAT (Personal Access Token)**: `sbp_xxxxxxxxxxxxx` — você passou pra mim. **Pode revogar** quando quiser em https://supabase.com/dashboard/account/tokens
- **Service role key**: peguei via Management API, está no painel Supabase em Settings → API. **Não vazei em lugar nenhum** (não commitada, não logada permanente).
- **Anon key**: pública, já está em `data.js`

⚠️ **Se quiser rotacionar o PAT por segurança**, revoga e me passa um novo se precisar de mais ajustes futuros.

---

## 🛠️ Como reproduzir / auditar de novo

Comando único para ver o estado atual:
```bash
PAT="<seu PAT aqui>"
curl -s -H "Authorization: Bearer $PAT" \
  "https://api.supabase.com/v1/projects/zhivqujoneqzviasioug/config/auth" | jq '.disable_signup, .site_url, .password_min_length'
```

Se quiser refazer toda a análise, o script SQL completo está em `docs/INFRAESTRUTURA.md` e a auditoria detalhada em commits do branch `otimizacao-supabase`.
