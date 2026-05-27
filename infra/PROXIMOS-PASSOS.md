# Próximos Passos — Cutover e Operação Contínua

> O que está PRONTO e o que ainda precisa de você.

## Estado atual

| Componente | Status | URL/Detalhe |
|---|---|---|
| Catálogo público (HTML estático) | Funcionando | https://danilomotos.oqay.pro |
| Admin de motos | Funcionando | https://danilomotos.oqay.pro/admin.html |
| Dashboard financeiro | Funcionando | https://danilomotos.oqay.pro/dashboard.html |
| API self-hosted | Funcionando | `/api/*` |
| Postgres VPS | Funcionando | 1 user (lucas@admin.com) + 55 motos + 92 fotos |
| Storage local | Funcionando | `/uploads` (fotos) + `/uploads-fin` (recibos) |
| Cloudflare Tunnel | Conectado | 4 conexões ativas |
| Backup automático | Ativo | diário 04:00 (30d retention) |
| CI/CD workflow | Pronto | aguarda secrets (1 → 4) |
| Site antigo | Continua no ar | https://danilomotos.com (GH Pages + Supabase) |

## O que VOCÊ precisa fazer

### 1. Configurar 4 secrets no GitHub (10 min)

Vai em `github.com/EltongarciaTI/danilomotos.com/settings/secrets/actions`:

| Secret | Valor | Como obter |
|---|---|---|
| `SSH_PRIVATE_KEY` | conteúdo da chave SSH | `cat ~/.vps/keys/danilomotos_ed25519` |
| `SSH_HOST` | `2.24.117.195` | direto |
| `SSH_USER` | `elton` | direto |
| `SSH_KNOWN_HOSTS` | fingerprint do server | `ssh-keyscan -t ed25519,ecdsa,rsa 2.24.117.195` |

E em **Settings → Actions → General → Workflow permissions:** marcar **"Read and write permissions"**.

Depois disso, qualquer push pra `main` dispara o pipeline (validate → build → deploy → smoke test).

Detalhes completos em `.github/SECRETS.md`.

### 2. Trocar nameservers do `danilomotos.com` no registrador (5 min + ~30min propagação)

No painel do registrador atual (Registro.br, GoDaddy, Hostgator, etc):
- Localizar `danilomotos.com` → Nameservers / DNS
- Trocar pelos 2 do Cloudflare:
  - `aragorn.ns.cloudflare.com`
  - `martha.ns.cloudflare.com`
- Salvar. Aguardar propagação (geralmente 10-30 min).

Quando propagar, o Cloudflare emite cert SSL **automático** e `https://danilomotos.com` passa a apontar pra VPS.

**Pra confirmar quando tiver propagado:**
```bash
curl -fsS https://danilomotos.com/api/health
# se retornar JSON com "status":"ok" → cutover completo
```

### 3. Atualizar CNAME do repo (já está apontando pra GH Pages)

Quando NS propagar e você validar que VPS responde em `danilomotos.com`:
- Apagar o arquivo `CNAME` do repo (era usado pelo GH Pages)
- Commitar/push

Ou deixar — não vai atrapalhar, só fica como referência morta.

### 4. Downgrade Supabase Pro → Free (2 min, $25/mês economizados)

Painel Supabase → `zhivqujoneqzviasioug` → **Settings → Billing → Downgrade to Free**

**Atenção:** o dashboard agora usa nossa API, não Supabase. O Free pode até ser pausado depois de uns dias sem uso, mas:
- **Aguarda 7-30 dias depois do cutover DNS pra cancelar** — backup vivo caso algo dê errado
- Quando cancelar, **exporta um dump SQL pra guardar** (Settings → Database → Backup)

### 5. (Opcional) Rotacionar senhas de setup

Algumas senhas iniciais (SSH e admin) foram criadas durante o setup. Recomendação geral de rotação após cutover. Detalhes operacionais em `.vps/` (gitignored — só você tem).

Resumo: como o `elton` agora loga por chave SSH, pra desabilitar PasswordAuth no servidor:

```bash
# Como lucas:
sudo bash -c 'cat >> /etc/ssh/sshd_config <<EOF
Match User elton
    PasswordAuthentication no
    AuthenticationMethods publickey
EOF'
sudo sshd -t && sudo systemctl reload ssh
```

Pra trocar senha de admin do site (gerar bcrypt local e fazer UPDATE no Postgres) — ver `RUNBOOK.md` seção "Resetar senha de um admin".

## O que está PRONTO (não precisa fazer nada)

- Estrutura Docker completa, deploy script, smoke test, backup automático
- API com 10 tabelas + 2 buckets de storage
- Sistema de auth unificado (1 login pro admin e dashboard)
- Cloudflare Tunnel conectado
- Cache control inteligente no Caddy
- Workflow CI/CD escrito (só falta os secrets)
- RUNBOOK completo em `infra/RUNBOOK.md`

## Ordem recomendada de execução

1. **Hoje:** Configurar secrets do GitHub → testar pipeline com 1 commit dummy
2. **Quando você tiver acesso ao DNS:** trocar NS → aguardar → validar
3. **+7 dias:** downgrade Supabase Pro → Free
4. **+30 dias:** rotacionar senhas + cancelar Supabase Free (se quiser)

## URLs finais

| Antes | Depois |
|---|---|
| `danilomotos.com` → GH Pages + Supabase | `danilomotos.com` → VPS via CF Tunnel |
| Pagando R$140/mês (Supabase Pro) | R$0/mês (VPS já paga, sem outros custos) |
| 2 lugares pra gerir (GH + Supabase) | 1 lugar (VPS + GitHub só pro código) |
