# Arquitetura — App de Rotina, Metas, Treino, Refeições e Gastos

> Documento de arquitetura (v1). Serve de insumo para (1) gerar o design system no Claude Design e (2) gerar o prompt de implementação no Claude Code.

---

## 1. Visão e escopo

**Problema:** manter consistência em treino, alimentação e finanças pessoais. Hoje o treino vive numa planilha (5 abas: Semana, Treinos de força, Exercícios detalhados, Cardio, Registro semanal, Progresso) e o resto não vive em lugar nenhum.

**Princípio central de produto:** *fricção mínima no registro*. Todo registro (série feita, refeição, gasto) precisa custar menos de 10 segundos e ≤ 3 toques. Se registrar dói, o app morre em 2 semanas.

**Não-objetivos da v1:**
- Contador de calorias com base de alimentos completa (fica pra v2, com busca externa).
- Integração bancária (Open Finance) — só entrada manual + importação de CSV/OFX.
- Rede social, compartilhamento, gamificação com terceiros.

### Escopo por versão

| | v1 (MVP) | v2 | v3 |
|---|---|---|---|
| Treino | Plano semanal importado da planilha, execução guiada, registro de carga/RPE, progressão | Templates alternativos, deload automático | Gráficos de volume por grupo muscular |
| Refeições | Registro por refeição com foto + tags + "aderência ao plano" | Base de alimentos + macros | Foto → estimativa via LLM |
| Gastos | Lançamento rápido, categorias, orçamento mensal, recorrentes | Import OFX/CSV, cartões e faturas | Previsão de fluxo |
| Rotina/Metas | Hábitos diários, streaks, metas com progresso | Metas encadeadas a métricas | Revisão semanal automatizada |

---

## 2. Decisão de plataforma

**PWA como alvo primário.** Justificativa:

- Um único codebase para desktop e celular, instalável na home screen.
- Você já usa stack web nos outros projetos — reaproveitamento total de conhecimento.
- Custo zero de loja, deploy contínuo.

**Limitações que você precisa aceitar conscientemente:**

| Recurso | Android (Chrome) | iOS (Safari 16.4+) |
|---|---|---|
| Instalar na home | Sim | Sim (só via "Adicionar à Tela de Início") |
| Push notification | Sim | Sim, **apenas** se instalado na home |
| Background sync | Sim | Não |
| Armazenamento local | Generoso | Pode ser limpo após ~7 dias sem uso |

**Consequência arquitetural:** o app precisa ser *offline-first com sincronização no servidor*, nunca offline-only. O IndexedDB é cache + fila de escrita, não fonte da verdade.

Se um dia precisar de widget de tela inicial ou HealthKit/Health Connect, o caminho é empacotar com Capacitor — a arquitetura abaixo suporta isso sem reescrita, desde que toda API nativa fique atrás de uma camada de abstração (`platform/`).

---

## 3. Stack proposta

**Frontend**
- React + TypeScript, Vite
- `vite-plugin-pwa` (Workbox) para service worker e manifest
- TanStack Query para estado de servidor + cache
- Zustand para estado de UI (pouco)
- Dexie.js sobre IndexedDB para o banco local
- Tailwind + tokens do design system (seção 8)
- Recharts para gráficos

**Backend**
- FastAPI + SQLAlchemy + Alembic (Python) — alinhado com o que você já roda no Fronteira
- PostgreSQL
- Auth: JWT (access curto + refresh em cookie httpOnly)
- Web Push via VAPID (`pywebpush`)
- Worker leve (APScheduler ou Celery) para lembretes agendados e fechamento mensal

**Alternativa a considerar:** Supabase no lugar do backend próprio. Ganha auth, Postgres, realtime e storage prontos; perde controle e amarra o schema ao PostgREST. Para um app pessoal, encurta semanas de trabalho. Decisão em aberto — ver seção 12.

---

## 4. Modelo de domínio

Quatro contextos delimitados, com pouco acoplamento entre eles. O ponto de encontro é o **Dia** e a **Meta**.

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   TREINO     │  │  NUTRIÇÃO    │  │  FINANÇAS    │  │   ROTINA     │
│              │  │              │  │              │  │              │
│ Plano        │  │ Refeição     │  │ Transação    │  │ Hábito       │
│ Sessão       │  │ PlanoAlim.   │  │ Categoria    │  │ Check-in     │
│ Exercício    │  │ Ingestão     │  │ Orçamento    │  │ Streak       │
│ SetLog       │  │ Água         │  │ Recorrente   │  │ Meta         │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       └─────────────────┴────────┬────────┴─────────────────┘
                                  │
                          ┌───────▼────────┐
                          │   DIA / METAS  │
                          │  (agregação)   │
                          └────────────────┘
```

### 4.1 Treino (derivado da sua planilha)

A planilha mapeia quase 1:1. As abas viram:

- **Semana** → `training_plan` + `plan_day` (7 dias: Força A, Cardio leve, Força B, HIIT, Força C, Cardio+antebraço, Descanso)
- **Treinos de força** + **Exercícios detalhados** → `exercise` (catálogo) e `plan_item` (o que fazer em cada dia). As duas abas são a mesma entidade em granularidades diferentes: unifique em `exercise` com campos `how_to` e `common_mistakes`.
- **Cardio** → `cardio_protocol` (aquecimento, principal, recuperação, desaquecimento, RPE alvo)
- **Registro semanal** → `set_log`
- **Progresso** → view/agregação, não tabela

```
training_plan (id, user_id, nome, objetivo, ativo, criado_em)
plan_day      (id, plan_id, dia_semana, tipo[forca|cardio|hiit|descanso],
               foco, duracao_min, intensidade, observacoes)
exercise      (id, user_id?, nome, grupo_muscular[], equipamento,
               how_to, common_mistakes, is_global)
plan_item     (id, plan_day_id, exercise_id?, cardio_protocol_id?, ordem,
               series_min, series_max, reps_min, reps_max, unilateral,
               rir_alvo, descanso_seg, notas)
session       (id, user_id, plan_day_id?, data, status[planejada|em_curso|
               concluida|pulada], duracao_real_min, rpe_geral, notas)
set_log       (id, session_id, exercise_id, numero_serie, reps, carga_kg,
               rir, concluido_em)
cardio_log    (id, session_id, protocolo_id?, duracao_min, distancia_km?,
               rpe, tipo[corrida|bike|caminhada])
body_metric   (id, user_id, data, tipo[peso|circunferencia|foto], valor, unidade)
```

**Regra de progressão** (está na planilha, vira lógica do app): quando todas as séries de um exercício atingem o topo da faixa de reps com RIR ≥ 1–2, o app sugere aumento de carga na próxima sessão. Implementar como uma função pura `suggestProgression(lastSessions, planItem) -> Suggestion`, chamada na tela de execução — sugestão, nunca imposição, e sempre descartável com um toque.

Modele `series_min/max` e `reps_min/max` como faixas de verdade, não string. Sua planilha usa "2–3 séries", "8–20 reps", "8–12 / perna" — se guardar como texto você perde a capacidade de calcular progressão e volume.

### 4.2 Nutrição

```
meal_plan     (id, user_id, nome, ativo)
meal_slot     (id, meal_plan_id, nome, horario_alvo, descricao)
meal_log      (id, user_id, data, slot_id?, horario, descricao,
               foto_url?, aderencia[dentro|parcial|fora], notas)
water_log     (id, user_id, data, ml, registrado_em)
```

Deliberadamente **sem macros e sem calorias na v1**. A métrica da v1 é aderência ao plano e regularidade de horários — é o que sustenta hábito nas primeiras semanas e é o que dá pra registrar em 5 segundos. Contagem numérica entra na v2, se você quiser, e como recurso opcional que pode ficar desligado.

### 4.3 Finanças

```
account       (id, user_id, nome, tipo[conta|cartao|carteira], saldo_inicial)
category      (id, user_id, nome, tipo[receita|despesa], cor, icone, pai_id?)
transaction   (id, user_id, account_id, category_id, valor_centavos,
               tipo[receita|despesa|transferencia], data, descricao,
               recorrente_id?, tags[])
budget        (id, user_id, category_id, mes_ano, limite_centavos)
recurring     (id, user_id, template_json, regra_rrule, proxima_ocorrencia)
```

**Dinheiro sempre em inteiros (centavos).** Nunca float. `BIGINT` no Postgres,
`number` inteiro seguro no cliente.

### 4.4 Rotina e metas

```
habit         (id, user_id, nome, icone, frequencia_rrule, meta_por_semana)
habit_checkin (id, habit_id, data, concluido, valor?)
goal          (id, user_id, titulo, dominio[treino|nutricao|financas|rotina],
               tipo[numerica|binaria|habito], alvo, unidade,
               prazo, metrica_ref, status)
```

`metrica_ref` é o que conecta a meta aos outros contextos: uma meta como "3 treinos de força por semana" aponta para uma consulta agregada em `session`, e o progresso é calculado, não digitado. Metas que exigem digitação manual do progresso são abandonadas.

---

## 5. Arquitetura de aplicação

### 5.1 Camadas (frontend)

```
src/
  app/            # rotas, providers, shell, service worker registration
  features/
    training/     # componentes, hooks, queries, lógica de progressão
    nutrition/
    finance/
    routine/
    dashboard/
  domain/         # tipos + regras puras, sem React e sem I/O
  data/
    api/          # cliente HTTP tipado
    db/           # Dexie: schema, migrations, repositórios
    sync/         # fila de mutações, reconciliação, resolução de conflito
  platform/       # notificações, câmera, share — abstração p/ Capacitor futuro
  ui/             # design system: tokens, primitivos, componentes
```

A regra que segura a manutenção: `domain/` não importa nada de `features/` nem de `data/`. Cálculo de progressão, agregação de volume, saldo de orçamento, cálculo de streak — tudo função pura, testável sem montar componente.

### 5.2 Estratégia offline-first

Este é o ponto mais delicado da arquitetura, então vale detalhar.

**Escrita:** toda mutação vai primeiro pro IndexedDB e entra numa `outbox` (fila persistente) com `{id_local, entidade, operacao, payload, timestamp, tentativas}`. A UI atualiza imediatamente (optimistic). Um worker de sync drena a fila quando há rede.

**IDs:** o cliente gera UUIDv7 no momento da criação. O servidor aceita o ID do cliente. Isso elimina a classe inteira de bugs de "ID temporário virou ID real e as referências quebraram" — que é o que mais mata app offline.

**Idempotência:** cada item da outbox carrega uma `idempotency_key`. O servidor rejeita duplicatas. Sem isso, um retry após timeout duplica o lançamento de gasto.

**Leitura:** TanStack Query com `persister` no IndexedDB. Stale-while-revalidate.

**Conflitos:** last-write-wins por campo, com `updated_at` do servidor como árbitro. Para um app de usuário único em múltiplos dispositivos isso é suficiente — CRDT aqui seria engenharia excessiva. A exceção é `set_log`: nunca sobrescreva, só acrescente. Log de treino é append-only por natureza.

**Sync:** endpoint `GET /sync?since=<cursor>` devolvendo deltas por entidade. Pull no foco do app e a cada N minutos; push imediato quando a outbox tem itens e há conexão.

### 5.3 Notificações

Três gatilhos:
1. **Lembrete de treino** — agendado por `plan_day`, horário configurável.
2. **Lembrete de refeição** — por `meal_slot`.
3. **Resumo semanal** — domingo, com aderência dos 3 domínios.

Como iOS não tem background sync, o agendamento **mora no servidor**, não no service worker. O worker do backend dispara Web Push nos horários. O service worker só recebe e exibe.

Peça permissão de notificação depois do primeiro registro concluído, nunca no primeiro carregamento. Pedir cedo demais é a forma mais rápida de ter a permissão negada permanentemente.

---

## 6. API (esboço)

```
POST   /auth/login | /auth/refresh | /auth/logout

GET    /sync?since=<iso>                    # delta multi-entidade
POST   /sync/batch                           # drenagem da outbox

GET    /training/plans/active
GET    /training/days/today
POST   /training/sessions                    # inicia sessão
PATCH  /training/sessions/{id}
POST   /training/sessions/{id}/sets
GET    /training/exercises/{id}/history
GET    /training/progress?range=90d

GET    /nutrition/day/{date}
POST   /nutrition/meals
POST   /nutrition/water

GET    /finance/transactions?from&to&category
POST   /finance/transactions
GET    /finance/budgets/{mes_ano}
GET    /finance/summary?range=30d

GET    /routine/habits/today
POST   /routine/checkins
GET    /goals
PATCH  /goals/{id}

GET    /dashboard/today
GET    /dashboard/week
```

Padrões: cursor pagination, `snake_case` no JSON, erros no formato RFC 7807, todos os timestamps em UTC ISO-8601 com o timezone do usuário guardado no perfil (crítico — "hoje" é uma decisão de fuso, e cálculo de streak errado por fuso destrói a confiança no app).

---

## 7. Navegação e telas

Bottom tab bar com 5 destinos (celular) / sidebar (desktop):

1. **Hoje** — o coração do app. Card de treino do dia, refeições do plano com estado, gasto do dia vs orçamento, hábitos pendentes. Tudo acionável direto do card.
2. **Treino** — plano da semana, executor de sessão, histórico, progressão por exercício.
3. **Comer** — dia atual, registro rápido, histórico de aderência.
4. **Grana** — lançamento rápido (FAB), lista, orçamento, gráfico do mês.
5. **Metas** — metas ativas com progresso, hábitos, streaks, revisão semanal.

**Tela crítica: o executor de treino.** É onde o app vive ou morre. Requisitos:
- Um exercício por vez, ocupando a tela.
- Carga e reps pré-preenchidos com o valor da última sessão.
- Botão grande de "série concluída", com timer de descanso disparando sozinho (usando `descanso_seg` do `plan_item`).
- Ajuste de carga em ±, sem teclado.
- Wake lock ativo (a tela não pode apagar no meio da série).
- Funciona 100% offline.

---

## 8. Insumos para o design system (Claude Design)

Este é o briefing a ser levado para o Claude Design.

**Personalidade:** ferramenta calma e confiável, não um app de fitness gritando motivação. Nada de gradientes neon, nada de "VOCÊ CONSEGUE!". A satisfação vem do registro completo e da série de dias, não de confete.

**Modo escuro como padrão.** O app é usado em academia e à noite.

**Cores por domínio** (cada contexto precisa de identidade visual própria, já que a tela "Hoje" mistura os quatro):
- Treino — um tom frio e sólido
- Nutrição — um tom verde/terroso
- Finanças — um tom âmbar/dourado
- Rotina — um tom neutro/roxo suave
- Semânticas: sucesso, atenção, erro, e um par "dentro do orçamento / estourado"

**Tokens necessários:** escala de cor com 9 passos por matiz + superfícies (bg, surface, surface-raised, border), escala tipográfica de 7 passos, espaçamento base 4px, raios, sombras (discretas), durações de animação.

**Tipografia:** números precisam de fonte tabular. O app é cheio de valores alinhados (carga, reps, dinheiro) e sem `font-variant-numeric: tabular-nums` as colunas dançam.

**Alvos de toque:** mínimo 48×48px. O usuário está com mão suada segurando halter.

**Componentes a especificar:**
- `StatCard`, `ProgressRing`, `StreakBadge`
- `SetRow` (linha de série: número, reps, carga, RIR, check)
- `RestTimer` (circular, com som e vibração)
- `NumberStepper` (± sem teclado)
- `QuickEntrySheet` (bottom sheet de lançamento rápido)
- `CategoryPill`, `BudgetBar`
- `DayStrip` (fita de 7 dias com estado)
- `EmptyState`, `Skeleton`, `OfflineBanner`, `SyncIndicator`

**Acessibilidade:** contraste AA mínimo, respeitar `prefers-reduced-motion`, nunca usar cor sozinha para comunicar estado (o "estourou o orçamento" precisa de ícone e texto, não só vermelho).

---

## 9. Roadmap de implementação (para o Claude Code)

Ordem que mantém o app utilizável desde cedo:

| Fase | Entrega | Por quê primeiro |
|---|---|---|
| 0 | Scaffold: Vite+React+TS, PWA, Tailwind com tokens, FastAPI+Postgres, auth | Base |
| 1 | Camada offline: Dexie, outbox, sync, UUIDv7, idempotência | Se vier depois, é reescrita |
| 2 | Treino completo (importar a planilha como seed) | Maior valor imediato, dados já existem |
| 3 | Finanças | Segundo maior valor, modelo simples |
| 4 | Nutrição | Depende de hábito já formado |
| 5 | Rotina, metas, dashboard "Hoje" | Agrega os anteriores |
| 6 | Push notifications + resumo semanal | Requer todo o resto funcionando |

A fase 2 inclui um script de seed que lê o `.xlsx` e popula `exercise`, `plan_day`, `plan_item` e `cardio_protocol`. Um parser único, rodado uma vez — não construa importador genérico de planilha.

---

## 10. Riscos

| Risco | Mitigação |
|---|---|
| Sync mal feito corrompe dados | Fase 1 antes de qualquer feature; testes de conflito; append-only em set_log |
| Safari limpa o IndexedDB | Servidor é a fonte da verdade; sync no foco do app |
| Escopo explode (4 domínios!) | Roadmap por fase; cada fase entrega app usável |
| Registro com fricção → abandono | Meta dura de ≤3 toques por registro; medir isso |
| Fuso horário quebra streaks | Timezone no perfil; toda fronteira de dia calculada no fuso do usuário |
| Contagem de calorias vira obrigação chata | Fora da v1 por decisão; opcional quando entrar |

---

## 11. Convenções técnicas

- TypeScript `strict`, sem `any`
- Zod para validar toda resposta de API e todo dado que sai do IndexedDB
- Schema de banco como fonte da verdade → tipos gerados (OpenAPI → TS)
- Testes: Vitest para `domain/` (cobertura alta, é lógica pura), Playwright para os 3 fluxos críticos (executar treino, lançar gasto, sync após offline)
- Migrations versionadas: Alembic no servidor, versão de schema do Dexie no cliente
- Commits convencionais, CI rodando lint + testes + build

---

## 12. Decisões em aberto

Precisam da sua resposta antes de gerar o prompt do Claude Code:

1. **Backend próprio (FastAPI) ou Supabase?** Trade-off na seção 3.
2. **Uso individual ou vai ter mais gente?** Muda auth, multi-tenancy e custo de infra.
3. **Onde hospedar?** VPS própria, Fly.io, Railway, Vercel+Neon.
4. **Nutrição: aderência (v1) ou macros desde o início?** Recomendo aderência.
5. **Finanças: cartão de crédito com fatura precisa entrar na v1?** Complica bastante o modelo (transação ≠ pagamento).
6. **Já quer o caminho para app nativo (Capacitor) reservado**, ou PWA puro é suficiente?
