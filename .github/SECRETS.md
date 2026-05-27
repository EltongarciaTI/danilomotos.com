# GitHub Secrets — necessários pro CI/CD

Vai em **Settings → Secrets and variables → Actions → New repository secret** no repo do GitHub. Configura cada um:

## 1. `SSH_PRIVATE_KEY`

Conteúdo da chave SSH privada que tem acesso ao `elton@2.24.117.195`.

**Como obter:**

```bash
# A chave foi gerada localmente em ~/.vps/keys/danilomotos_ed25519
# Mostra o conteúdo (cola TODO ele, incluindo BEGIN/END):
cat ~/.vps/keys/danilomotos_ed25519
```

Cola o output inteiro (começa com `-----BEGIN OPENSSH PRIVATE KEY-----`).

## 2. `SSH_HOST`

```
2.24.117.195
```

## 3. `SSH_USER`

```
elton
```

## 4. `SSH_KNOWN_HOSTS`

Pra evitar prompt de StrictHostKeyChecking. Como obter:

```bash
ssh-keyscan -t ed25519,ecdsa,rsa 2.24.117.195
```

Cola todas as linhas que aparecerem.

---

## Verificação

Depois de configurar os 4 secrets:

```bash
# Faz qualquer commit e push pra main
git commit --allow-empty -m "test: trigger ci/cd"
git push origin main
```

Vai em **Actions** no repo do GitHub. Deve rodar:
1. ✓ Validate (lint HTML/JS/Caddyfile/compose)
2. ✓ Build & Push API image (vai pro ghcr.io/seu-user/danilomotos-api)
3. ✓ Deploy to VPS (SSH + pull + restart + smoke test)

Total esperado: ~2-3 minutos.

## Permissões do GitHub Token (automático)

O workflow usa `GITHUB_TOKEN` pra push no GHCR. Pra isso funcionar, vai em:

**Settings → Actions → General → Workflow permissions** → marca:
- [x] Read and write permissions
- [x] Allow GitHub Actions to create and approve pull requests (opcional)

E em **Settings → Packages** garante que o pacote `danilomotos-api` (criado no primeiro build) tem **Manage Actions access** com o próprio repo na lista.

## Troubleshooting

### "Permission denied (publickey)" no deploy
A `SSH_PRIVATE_KEY` está errada ou não tem permissão no VPS. Verificar:
```bash
ssh -i /path/to/private/key elton@2.24.117.195 "echo ok"
```

### "Unable to pull image" no deploy
O `docker login` na VPS expirou. O workflow já refaz login a cada deploy via GHCR token, mas se persistir, fazer manual na VPS:
```bash
ssh elton@2.24.117.195
docker logout ghcr.io
docker login ghcr.io  # usa o PAT do GitHub
```

### Smoke test falha
Algum endpoint quebrou. Logs detalhados em **Actions → Deploy job → Smoke test step**.
Pra debug local: `BASE_URL=https://danilomotos.oqay.pro infra/scripts/smoke-test.sh`
