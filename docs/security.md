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
- **Refresh token** em cookie `httpOnly` + `Secure` + `SameSite=Lax`, escopo
  `/auth`, com **rotação a cada uso**. Só o SHA-256 é guardado no banco.
- **Detecção de reuso:** cada token pertence a uma *família*. Apresentar um
  token já usado significa que ele vazou — a família inteira é revogada na hora.
- O cliente centraliza a renovação: por mais requisições que esbarrem num 401
  ao mesmo tempo, só uma chamada a `/auth/refresh` fica em voo.

## Superfície exposta

- Rate limit por IP nos endpoints de auth (`5/hora` no cadastro, `10/min` no
  login). Com mais de um worker, troque o storage do `slowapi` por Redis.
- CORS restrito à origem do PWA, com `allow_credentials`.
- Erros em RFC 7807 (`application/problem+json`) — mensagem de credencial
  inválida não distingue e-mail inexistente de senha errada.
- Caddy adiciona HSTS, `nosniff`, `X-Frame-Options: DENY` e referrer policy.
- O container da API roda como usuário não-root.

## O que ainda não está fechado

- Idempotência de escrita (fase 1) — sem ela, um retry após timeout duplica
  lançamento de gasto.
- Rotação de `JWT_SECRET` e revogação em massa por usuário.
- Verificação de e-mail e recuperação de senha.
