# Nutrição — Insights de IA (plano de implementação)

> Escrito em 31/08/2026. Decisões: dois insights (semanal + diário leve),
> provider **OpenAI**, atrás de uma interface para não amarrar.
>
> **Fase 1 implementada** (31/08/2026): migration 0008, modelo
> `NutritionInsight`, opt-in `notification_preference.insights_ia_enabled`,
> interface `InsightProvider` + `FakeProvider`, `builder`, `service`,
> endpoints `GET /nutrition/insight/today|weekly`, 6 testes. Sem OpenAI e sem
> worker ainda — a feature roda ponta a ponta com o provider fake quando
> `NUTRITION_INSIGHTS_ENABLED=true` + opt-in do usuário.
>
> Mudança em relação ao plano original: o insight **semanal também gera
> sob demanda** (mesmo cache de 1/período). O worker (fase 3) vira só
> pré-aquecimento, não a única via.
>
> **Fase 2 implementada** (31/08/2026): `OpenAIProvider` (httpx direto no
> `/chat/completions`, sem SDK), `build_provider()` escolhe OpenAI quando há
> `OPENAI_API_KEY` e cai no fake senão. Endpoints recebem o provider por
> `Depends(get_insight_provider)` — testes sobrescrevem via
> `dependency_overrides`. Boot falha em produção se
> `NUTRITION_INSIGHTS_ENABLED=true` sem chave. 9 testes com `httpx.MockTransport`.
>
> Pendente: fase 3 (job do worker), fase 4 (frontend), fase 5 (aviso no
> `docs/security.md`, tirar `notas` do payload).

## Objetivo

Dar ao usuário leitura qualitativa sobre a própria alimentação — padrões,
pontos de atenção, uma sugestão acionável por vez — a partir do que ele já
registra hoje. **Não** é contagem de calorias/macros: o modelo de dados de
nutrição é qualitativo (`descricao` em texto livre, `aderencia`
`dentro/parcial/fora`, `tags`, água em ml). Isso é justamente o tipo de
entrada que um LLM lê bem.

Dois produtos distintos:

| | Insight semanal | Insight diário |
|---|---|---|
| Quando | batch, junto do resumo semanal (worker) | sob demanda, ao abrir a tela Nutrição |
| Cadência | 1× / semana / usuário | no máx. 1× / dia / usuário (cache) |
| Profundidade | análise da semana: aderência, horários, repetições, hidratação, correlação com treino | comentário curto sobre o dia + 1 dica |
| Custo | previsível | variável, limitado pelo cache |
| Gatilho | cron `resumo_dia_semana` do usuário | primeira request de `/nutrition/insight/today` sem cache fresco |

## Restrições do projeto que o desenho precisa respeitar

- **Offline-first**: o insight é online-only. A tela mostra os dados locais
  sempre; o card de IA só aparece quando há insight persistido. Geração exige
  rede — falha silenciosa, nunca bloqueia a tela.
- **Chave da OpenAI nunca sai do servidor.** Toda chamada ao provider mora em
  `apps/api`. O front só lê o resultado já pronto.
- **RLS é a autoridade de isolamento.** A tabela nova entra no mesmo molde de
  `_add_sync_rls` das migrations 0005/0006 (policy por `app_current_user_id()`).
- **Opt-in explícito por usuário.** Mandar descrição de refeição pra terceiro
  é dado sensível — só acontece com consentimento ligado. Novo campo em
  `notification_preference` (é a tabela de preferências que já existe) ou
  coluna em `app_user`. Recomendo `notification_preference.insights_ia_enabled`
  (default `false`), porque a tela de config já edita essa tabela.
- **Sync é a única porta de escrita em massa.** O insight é gerado pelo
  servidor, não pelo cliente — fica **fora** do `/sync/batch`. Vai por
  endpoint de leitura dedicado (a convenção permite: "endpoints dedicados são
  só para leitura pontual") e é cacheado no Dexie pra ler offline.

## Modelo de dados

Migration `0008_nutrition_insights.py`:

```
nutrition_insight
  id            uuid  pk
  user_id       uuid  fk app_user  not null
  tipo          text  check in ('semanal','diario')
  periodo_ref   date  not null   -- semanal: 2ª-feira da semana; diario: o dia
  texto         text  not null   -- markdown curto, já pronto pra renderizar
  modelo        text  not null   -- ex.: 'gpt-4o-mini', pra auditoria/rollback
  gerado_em     timestamptz not null default now()
  + colunas do SyncMixin (row_version, deleted_at, criado_em, updated_at)

  unique (user_id, tipo, periodo_ref)   -- idempotência: 1 insight por período
```

- Mesmo `_sync_columns()` + `_add_sync_rls("nutrition_insight")` das outras.
- O `unique` garante que reprocessar a semana não duplica; a geração faz
  `INSERT ... ON CONFLICT (user_id, tipo, periodo_ref) DO UPDATE`.
- Sem catálogo global aqui, então roda como a role de runtime normal (não
  precisa de OWNER como o seed de treino).

## Backend

### Config novo (`app/config.py`)

```python
openai_api_key: str = ""
openai_model: str = "gpt-4o-mini"          # barato, suficiente pro caso
openai_base_url: str = "https://api.openai.com/v1"
openai_timeout_seconds: int = 20
nutrition_insights_enabled: bool = False   # kill switch global
```

`app_env == "production"` não deve exigir a chave (feature opcional), mas o
endpoint/worker checa `settings.nutrition_insights_enabled and
settings.openai_api_key` antes de qualquer chamada.

### Interface do provider (`app/services/insights/`)

```
app/services/insights/
  __init__.py
  provider.py     # Protocol InsightProvider + dataclass InsightRequest/InsightResult
  openai_provider.py   # implementação: httpx.AsyncClient -> /chat/completions
  fake_provider.py     # determinístico, pros testes — nunca toca a rede
  builder.py      # monta o payload a partir do banco (sem IA)
  service.py      # orquestra: builder -> provider -> upsert em nutrition_insight
```

`InsightProvider` é um `typing.Protocol` com um método
`async def gerar(req: InsightRequest) -> InsightResult`. `service.py` recebe
o provider por parâmetro (injeção), então:
- produção: `OpenAIProvider(settings)`
- testes: `FakeProvider()`
- futuro: trocar sem tocar em `service.py`/router/worker.

`openai_provider.py` usa `httpx` (já é dependência transitiva; senão
adicionar) direto no endpoint `/chat/completions` — **não** o SDK da OpenAI,
pra manter a superfície pequena e o mock trivial. `response_format` JSON não
é necessário; a resposta é texto curto em markdown.

### `builder.py` — o que vai pro modelo

Reaproveita a lógica de janela do `build_weekly_summary`. Entrada montada em
Python (nunca manda linha crua de tabela):

- **Semanal**: por dia da semana — nº de refeições, distribuição de
  `aderencia`, horário médio, `tags` mais frequentes, total de água vs. meta,
  nº de treinos concluídos na semana (correlação treino×alimentação).
  Descrições de refeição truncadas e agregadas (ex.: as 10 mais recorrentes),
  não todas.
- **Diário**: refeições do dia (`horario`, `descricao`, `aderencia`, `tags`),
  água do dia vs. meta, se treinou hoje.

Limite duro de tamanho do prompt (ex.: 4 KB de contexto) — trunca antes de
enviar.

### Prompt

System prompt fixo, versionado no código:

> Você é um assistente de nutrição. Recebe um resumo estruturado dos
> registros alimentares de uma pessoa (qualitativos, sem calorias). Devolva
> no máximo 3 frases curtas em português: 1 observação de padrão, 1 ponto de
> atenção, 1 sugestão acionável. Não invente dados que não estão no resumo.
> Não dê conselho médico. Não mencione que é uma IA.

User message = JSON do `builder`. `temperature` baixa (0.3). `max_tokens`
apertado (~200 semanal, ~120 diário).

### Endpoints (`app/routers/nutrition.py`)

```
GET /nutrition/insight/today
  -> 200 NutritionInsightOut         (cache fresco do dia, ou gera na hora)
  -> 204                             (feature off, opt-in off, ou sem rede/erro)

GET /nutrition/insight/weekly?semana=YYYY-MM-DD
  -> 200 NutritionInsightOut         (lê o que o worker já gerou)
  -> 204                             (ainda não gerado / opt-in off)
```

- `today` gera sob demanda: se já existe `nutrition_insight` do dia, retorna;
  senão chama o provider, faz upsert, retorna. Erro do provider ⇒ 204 (front
  trata como "sem insight"), loga o erro.
- `weekly` **nunca** gera on-demand — só lê. Quem gera é o worker.
- `NutritionInsightOut`: `{ tipo, periodo_ref, texto, gerado_em }`.

### Worker (`app/worker.py`)

Novo job cron, análogo a `deliver_notifications`:

```python
scheduler.add_job(gerar_insights_semanais, "cron", minute="*/15",
                  id="nutrition-insights", max_instances=1, coalesce=True)
```

`gerar_insights_semanais`:
1. Se `not settings.nutrition_insights_enabled`: return.
2. Query dos usuários com `insights_ia_enabled` e cujo `resumo_dia_semana` +
   `resumo_horario` caem na janela atual (mesma lógica de disparo do resumo
   semanal) **e** que ainda não têm `nutrition_insight` `semanal` pra semana
   corrente.
3. Pra cada um: `builder` → `OpenAIProvider.gerar` → upsert.
4. Rodar como `OwnerSession` (worker já usa) mas setando o RLS user por
   usuário, ou fazer o upsert com `user_id` explícito — seguir o padrão que o
   `dispatch_due_notifications` já usa.

Rate/custo: no máx. N usuários opt-in por semana. Adicionar um teto defensivo
(ex.: 200 gerações/ciclo) e log de contagem.

## Frontend

### `data/api/nutritionInsights.ts` (novo)

Cliente + schemas zod, no molde de `data/api/notifications.ts`:
`getTodayInsight()`, `getWeeklyInsight(semana)`. 204 ⇒ `null`.

### Dexie

Nova tabela `nutrition_insight` no `schema.ts` (bump de versão do Dexie,
seguir o padrão das migrations de schema já existentes). Guarda o último
insight de cada tipo pra leitura offline. **Não** entra no registry de sync
(`data/sync/engine.ts`) — é populada só pelo cliente de API dedicado.

Fluxo na `NutritionPage`:
1. Ao montar / ao sincronizar: se online, chama `getTodayInsight()` e
   `getWeeklyInsight(semanaAtual)`, salva no Dexie.
2. `useLiveQuery` lê do Dexie e renderiza um `<Card>` de insight (ícone de
   IA/estrela do sprite, texto em markdown curto).
3. Sem insight no Dexie ⇒ card não aparece. Sem rede ⇒ mostra o último que
   tiver, com carimbo de data ("há 2 dias").

### Config / opt-in

Em `features/routine/NotificationSettings.tsx` (ou uma seção nova de
"Privacidade"), um `PreferenceToggle`:

> **Insights de IA na alimentação** — envia um resumo dos seus registros pra
> OpenAI pra gerar observações. Descrições de refeição saem do seu
> dispositivo. Desligado por padrão.

Liga/desliga `insights_ia_enabled` via o mesmo `patchPreferences`.

## Testes

- `fake_provider.py` determinístico ⇒ testes de `service.py` e dos endpoints
  sem rede.
- pytest: upsert idempotente (rodar 2× não duplica, respeita o unique);
  endpoint retorna 204 com feature off / opt-in off; `builder` trunca no
  limite; RLS (usuário A não lê insight de B).
- Teste do `OpenAIProvider` com `httpx` mockado (respx ou monkeypatch) — só
  valida montagem da request e parsing da resposta, 1 caso feliz + timeout.
- vitest: `NutritionPage` renderiza card com insight no Dexie, esconde sem;
  cliente de API mapeia 204 → null.
- E2E: opcional, com o provider fake via env no CI.

## Riscos / decisões em aberto

- **Privacidade**: mesmo com opt-in, vale um aviso no `docs/security.md` e no
  texto do toggle. Considerar hashear/omitir `notas` (campo mais livre) do
  payload — mandar só `descricao`, `aderencia`, `tags`, `horario`.
- **Custo**: `gpt-4o-mini` é barato, mas sem teto o worker pode surpreender.
  Teto por ciclo + alerta de log. Reavaliar se crescer a base.
- **Qualidade do insight diário**: com poucos registros no dia o modelo tende
  a encher linguiça. Regra: não gerar diário com < 1 refeição registrada.
- **Latência no `today` on-demand**: 2-5s de chamada síncrona na abertura da
  tela. Mitigação: gerar em background (o front pede, recebe 202/204, faz
  poll leve ou pega no próximo open). Simplificação aceitável pra v1:
  gerar síncrono com spinner no card só.
- **i18n do provider**: forçar português no system prompt; validar que não
  volta em inglês.

## Faseamento sugerido

1. Migration 0008 + modelo + `notification_preference.insights_ia_enabled` +
   `fake_provider` + `service` + endpoints + testes. **Sem OpenAI ainda** —
   feature funciona ponta a ponta com o fake.
2. `openai_provider` + config + teste com httpx mockado. Flip do
   `nutrition_insights_enabled` em dev.
3. Job do worker pro semanal.
4. Frontend: Dexie, cliente de API, card, toggle de opt-in.
5. Aviso no `docs/security.md`, revisão de payload (tirar `notas`).
