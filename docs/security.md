# Segurança e isolamento multiusuário

## Duas roles no Postgres, e o porquê

| role | usa | RLS |
|---|---|---|
| `bealegend` (owner) | Alembic, seeds, backup | **isenta** — é dona das tabelas |
| `bealegend_app` | a API, em todo request | **sujeita** às policies |

A API nunca conecta como owner. Esse é o ponto inteiro: se o isolamento
dependesse do `WHERE` da aplicação, um `WHERE` esquecido vazaria dados de outro
usuário em silêncio. Com a role de runtime sujeita à RLS, o `WHERE` esquecido
devolve zero linhas.

Os endpoints em `app/routers/exercises.py` **não filtram por `user_id` de
propósito**. Quem filtra é a policy. Se a policy sumir, `tests/test_rls.py`
fica vermelho.

## Como o contexto chega ao banco

Cada request abre uma sessão e executa
`set_config('app.user_id', <uuid>, true)`. As policies leem esse valor via
`app_current_user_id()`.

Dois detalhes que custam caro se forem ignorados:

1. **`true` = transaction-local.** O valor morre no fim da transação e nunca
   vaza para o próximo checkout de uma conexão do pool.
2. **Um `commit` apaga o contexto.** Por isso `app/db.py` registra um listener
   em `after_begin` que reaplica o `set_config` a cada nova transação da mesma
   sessão. Sem ele, a primeira query depois de um commit rodaria sem usuário —
   e a policy negaria até a linha recém-criada.

Request anônimo deixa `app.user_id` vazio: `app_current_user_id()` devolve
`NULL`, toda comparação vira `NULL`, toda policy nega. Deny by default.

## Catálogo global

`exercise` aceita dois formatos, garantidos por check constraint:

- `is_global = true` e `user_id IS NULL` — catálogo compartilhado, legível por
  todos, gravável só pelo owner (é o que o seed da fase 2 usa).
- `is_global = false` e `user_id` preenchido — exercício do usuário, isolado.

## Plano de autenticação

`app_user` e `refresh_token` **não** têm RLS: são lidas antes de existir um
usuário autenticado. Todo acesso a elas passa por `app/routers/auth.py`, que
nunca aceita filtro vindo do cliente. A RLS protege as tabelas de *dados*.

## Tokens

- Senha com **Argon2** (`passlib`).
- **Access token** JWT de 15 min, guardado **só em memória** no cliente. Não vai
  para `localStorage`: XSS persistente não teria o que roubar.
- **Refresh token** em cookie `httpOnly` + `Secure` + `SameSite=Lax`, com
  **rotação a cada uso**. Só o SHA-256 é guardado no banco.
- O `path` do cookie é `REFRESH_COOKIE_PATH`, e vale o caminho **visto pelo
  navegador**, não a rota interna. O Caddy publica a API sob `/api` e remove o
  prefixo antes de chegar ao FastAPI; um cookie com `path=/auth` nunca seria
  reenviado, e a sessão morreria a cada reload. O padrão é `/api/auth`; os
  testes ASGI, que falam direto com a API, usam `/auth`.
- **Detecção de reuso:** cada token pertence a uma *família*. Apresentar um
  token já usado significa que ele vazou — a família inteira é revogada na hora.
- O cliente centraliza a renovação: por mais requisições que esbarrem num 401
  ao mesmo tempo, só uma chamada a `/auth/refresh` fica em voo.

## Superfície exposta

- Rate limit por IP nos endpoints de auth: `RATE_LIMIT_REGISTER` (5/hora),
  `RATE_LIMIT_LOGIN` (10/min), `RATE_LIMIT_REFRESH` (60/min). São configuráveis
  de propósito — limite que atrapalha a suíte E2E acaba apagado do código; o
  limite em si é coberto por `tests/test_rate_limit.py`. Com mais de um worker,
  troque o storage do `slowapi` por Redis.
- CORS restrito à origem do PWA, com `allow_credentials`.
- Erros em RFC 7807 (`application/problem+json`) — mensagem de credencial
  inválida não distingue e-mail inexistente de senha errada.
- Caddy adiciona HSTS, `nosniff`, `X-Frame-Options: DENY` e referrer policy.
- O container da API roda como usuário não-root.
- API e worker rodam com filesystem somente leitura, sem capabilities Linux e
  com `no-new-privileges`.
- O host é validado pelo `TrustedHostMiddleware`; em produção, o segredo JWT
  padrão faz a aplicação recusar a inicialização.
- O Caddy adiciona CSP, `Permissions-Policy` e `Cross-Origin-Opener-Policy`,
  além dos cabeçalhos já descritos.
- Assinaturas Web Push ficam fora do sync, sob RLS. Um endpoint só pode ter um
  dono e é transferido de forma atômica ao trocar de conta no mesmo navegador.

## Segredos

`./infra/gen-secrets.sh <dominio>` gera `infra/.env` (modo 600) com senhas
aleatórias e um par de chaves VAPID. Ele se recusa a sobrescrever um `.env`
existente: trocar `JWT_SECRET` desloga todo mundo e trocar `APP_DB_PASSWORD`
exige `ALTER ROLE` no Postgres.

## Fora do escopo da v1

- Rotação de `JWT_SECRET` e revogação em massa por usuário.
- Verificação de e-mail e recuperação de senha.
