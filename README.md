# BeALegend

PWA multiusuário de treino, refeições, gastos e hábitos. Offline-first, backend
próprio, deploy em VPS.

- Arquitetura: [`docs/architecture.md`](docs/architecture.md)
- Design system: [`docs/design-system.md`](docs/design-system.md)
- Segurança e isolamento: [`docs/security.md`](docs/security.md)
- Camada offline: [`docs/offline-sync.md`](docs/offline-sync.md)
- Finanças: [`docs/finance.md`](docs/finance.md)
- Nutrição: [`docs/nutrition.md`](docs/nutrition.md)
- Rotina, metas e Hoje: [`docs/routine-dashboard.md`](docs/routine-dashboard.md)

## Estado

| Fase | Entrega | |
|---|---|---|
| 0 | Monorepo, Docker Compose, FastAPI + Postgres + Alembic, auth com RLS, PWA com tokens, CI | ✅ |
| 1 | Camada offline: Dexie, outbox, sync, idempotência, UUIDv7 | ✅ |
| 2 | Treino: seed da planilha, executor de sessão, progressão | ✅ |
| 3 | Finanças | ✅ |
| 4 | Nutrição | ✅ |
| 5 | Rotina, metas, tela Hoje | ✅ |
| 6 | Web Push, resumo semanal, hardening | — |

## Repositório

```
apps/web/    PWA React + TypeScript
apps/api/    FastAPI + PostgreSQL
packages/    tipos TS gerados do OpenAPI
infra/       Docker Compose, Caddy, backup
docs/        arquitetura, design system, segurança
```

`apps/web/src/domain/` é puro: sem React, sem I/O. Progressão de carga, saldo de
orçamento, cálculo de streak — tudo função pura, coberta por teste unitário. O
ESLint bloqueia importar React ou `data/` de dentro de `domain/`.

## Desenvolvimento

**Banco:**

```bash
docker compose -f infra/docker-compose.yml up -d db
docker compose -f infra/docker-compose.yml exec db \
  psql -U bealegend -d bealegend -c \
  "CREATE ROLE bealegend_app LOGIN PASSWORD 'changeme_app';"   # só na 1ª vez fora do compose
```

**API:**

```bash
cd apps/api
python -m venv .venv && ./.venv/bin/pip install -e ".[dev]"
cp .env.example .env
alembic upgrade head
uvicorn app.main:app --reload          # http://localhost:8000/docs
```

**Web:**

```bash
npm install
npm run dev                            # http://localhost:5173
```

**Tipos da API** — nunca escritos à mão:

```bash
# com a API rodando
npm run gen:types
```

## Testes

```bash
npm test                 # Vitest
npm run test:coverage    # idem, com o piso de cobertura de domain/
cd apps/api && pytest    # exige Postgres de verdade: RLS não existe em SQLite
```

Variáveis dos testes da API (`TEST_DATABASE_OWNER_URL`, `TEST_DATABASE_URL`)
apontam para um banco de teste; o padrão é `bealegend_test` em localhost.

Os E2E exercitam auth e sync de verdade — cookie de refresh, rotação, escrita
offline que sobe quando a rede volta — então precisam do stack completo no ar.
Eles rodam contra o **build de produção** (`vite preview`), porque o service
worker só precacheia o shell no build:

```bash
docker compose -f infra/docker-compose.yml up -d db
cd apps/api && alembic upgrade head
RATE_LIMIT_REGISTER=1000/minute RATE_LIMIT_LOGIN=1000/minute \
RATE_LIMIT_REFRESH=1000/minute uvicorn app.main:app &
npm run test:e2e         # Playwright sobe o Vite sozinho
```

Sem a API, o `globalSetup` falha com a instrução acima em vez de deixar os
testes passarem pelo motivo errado.

## Deploy

```bash
./infra/gen-secrets.sh bealegend.exemplo.com   # gera infra/.env com senhas e chaves VAPID
docker compose -f infra/docker-compose.yml up -d
```

Caddy resolve TLS sozinho para o `DOMAIN` configurado. O backup diário é
`infra/backup.sh` — instale no cron do host, apontando `BACKUP_DIR` para um
volume externo.
