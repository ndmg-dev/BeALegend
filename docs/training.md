# Treino — plano semanal, execução e progressão

## Modelo de dados

Oito tabelas, todas com `row_version`/`deleted_at` (participam do sync) e RLS
por `user_id` denormalizado — mesmo nas filhas de `training_plan`/`session`,
para evitar `EXISTS` em cadeia na policy:

| tabela | o que é | escrita pelo cliente? |
|---|---|---|
| `training_plan` | o plano em si | não — somente leitura |
| `plan_day` | um dia da semana | não — somente leitura |
| `plan_item` | exercício ou bloco de cardio de um dia | não — somente leitura |
| `cardio_protocol` | catálogo de protocolos de cardio (global, como `exercise`) | não |
| `session` | uma execução de `plan_day` numa data | sim — `create`/`update` |
| `set_log` | uma série concluída | sim — **só `create`**, append-only |
| `cardio_log` | um bloco de cardio concluído | sim — `create`/`update` |
| `body_metric` | peso, medida, foto | sim — `create` |

`plan_day`/`plan_item`/`training_plan`/`cardio_protocol` entram no
`REGISTRY` de sync com `somente_leitura=True`: chegam ao cliente pelo delta,
mas qualquer tentativa de escrita é rejeitada — quem escreve é o seed (fase 2)
ou um admin (fase futura), nunca o usuário via app.

Faixas são numéricas (`series_min/max`, `reps_min/max`, `rir_min/max`), nunca
texto — é o que permite calcular progressão. `unidade` distingue exercícios de
repetição da maioria dos isométricos (prancha, farmer hold), que a planilha
mede em segundos.

## O seed

```bash
cd apps/api
DATABASE_OWNER_URL=... python scripts/seed_training_plan.py --email voce@exemplo.com
```

Roda como **owner** — só ele pode gravar `is_global=true` no catálogo, porque
a policy de INSERT da role de runtime exige `user_id = app_current_user_id()`.

Parser específico desta planilha (`app/seed/parsing.py`), não um importador
genérico — nomes de coluna e formato de faixa ("2–3", "8–12 / perna",
"30–60 s") são desta planilha. Toda a lógica de parsing é pura e testada sem
banco em `tests/test_seed_parsing.py`.

**Unificação das duas abas de exercício:** "Treinos de força" (séries, reps,
RIR, descanso) e "Exercícios detalhados" (como executar, erros a evitar) são
a mesma entidade em granularidades diferentes — unificadas por nome do
exercício em `unificar_exercicios`, sem duplicar linha no catálogo.

**Idempotente:** rodar de novo sem `--force` atualiza o catálogo global e
pula a criação do plano se um já existir com o mesmo nome. Com `--force`, o
plano antigo é apagado (cascata: dias, itens, sessões, séries) e recriado —
use com cuidado em produção com dado real.

## Executor de sessão

Um exercício por vez (`ExecutorPage`), carga e reps pré-preenchidos com a
última série registrada (`ultimaSerie`, lida do Dexie — nunca da rede). O
fluxo inteiro passa pelos repositórios de `data/db/trainingSessionRepo.ts`,
que são otimistas como todo o resto da camada offline: grava local, a tela
atualiza, a sincronização acontece depois.

**Resumir sessão em andamento.** Reabrir o app no meio de um treino não pode
criar uma segunda sessão para o mesmo dia — as séries já feitas ficariam
órfãs, presas numa sessão "em_curso" que a tela nunca mais enxerga.
`iniciarOuRetomarSessao(planDayId, data)` procura e, se necessário, cria a
sessão dentro da mesma transação do Dexie. Assim, até duas montagens
concorrentes do React Strict Mode resultam em uma única sessão.

**Wake lock** ativo do início ao fim da sessão (`platform/wakeLock.ts`), não
só durante uma série — a tela não pode apagar entre um exercício e outro.

**Timer de descanso** é lógica pura (`domain/training/restTimer.ts`): um
`tick()` por segundo, sem `setInterval` dentro da função. Vibra ao terminar
(`platform/haptics.ts`), nunca como único sinal — o anel visual e o texto
"Pronto" comunicam o mesmo estado.

## Regra de progressão

`domain/training/progression.ts` — pura, testada, chamada na tela de
execução:

> Quando todas as séries do exercício atingem o topo da faixa de reps com
> RIR ≥ o alvo do plano, sugere aumentar a carga na próxima sessão. Sem
> anilha menor, sugere alternativa: +1–2 reps, descida mais lenta (3 s), ou
> +1 série.

`suggestProgression(sets, item, incrementoKg)` não sabe nada de UI: recebe as
séries já registradas e as faixas do plano, devolve `null` ou uma sugestão
com o incremento e as três alternativas. O executor mostra isso como um chip
dispensável — nunca bloqueia o fluxo.

Exercícios sem RIR alvo (isométricos como prancha) pulam a checagem de RIR;
sem `reps_max` definido, não há o que sugerir.

## Dois bugs que só apareceram testando de ponta a ponta

1. **Reload no meio do treino criava uma segunda sessão.** `useExecutorSessao`
   sempre chamava `iniciarSessao()` ao montar, mesmo quando já existia uma
   sessão "em_curso" para o dia. Corrigido com `iniciarOuRetomarSessao` acima —
   pego pelo teste E2E de reload, não por revisão de código.
2. **O plano semeado fora do app nunca chegava ao cliente sozinho.** O seed
   roda fora dos gatilhos de sync (rede, foco, intervalo de 5 min) — nenhum
   deles dispara quando um admin roda um script no servidor enquanto o
   usuário já está com o app aberto. `PlanoSemanaPage` agora dispara
   `sincronizar()` ao montar: entrar na tela de treino é o próprio sinal de
   "quero o plano atualizado".

## O que ficou fora desta fase

- **Cardio no executor.** O plan_item de cardio (ex.: terça, "Cardio leve")
  aparece no plano mas o executor pula direto para os itens de exercício —
  registrar `cardio_log` pela UI fica para quando a tela "Hoje" (fase 5)
  precisar dele.
- **Histórico e `/training/progress`.** O endpoint de histórico existe
  (`GET /training/exercises/{id}/history`) e alimenta o pré-preenchimento,
  mas não há tela de gráfico de progresso — isso é v3 na arquitetura original.
- **Edição do plano pelo usuário.** Deliberado: v1 é o plano da planilha,
  fixo. Editar dias/itens é trabalho de admin ou de uma fase futura.
