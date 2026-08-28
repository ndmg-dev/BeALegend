# Rotina, metas e tela Hoje

A fase 5 fecha o ciclo diário do BeALegend. A rota `/hoje` reúne treino,
alimentação, finanças e rotina sem duplicar regras de domínio; cada card abre a
tela onde o dado é registrado e os hábitos podem ser concluídos no próprio
painel.

## Dados e sincronização

- `habit` guarda nome, ícone, frequência RRULE, meta semanal e estado ativo.
- `habit_checkin` registra a conclusão por dia. A restrição única
  `(habit_id, data)` impede dois check-ins do mesmo hábito no mesmo dia.
- `goal` descreve alvo, unidade, domínio e `metrica_ref`.
- As três entidades usam a mesma outbox, UUIDv7, reconciliação e RLS das fases
  anteriores. Um check-in só pode referenciar um hábito visível para o usuário.

As metas não possuem campo de progresso editável. O valor atual é calculado a
partir das sessões concluídas na semana, água registrada no dia ou check-ins de
hábitos do dia. Assim, a tela nunca diverge do histórico que originou a métrica.

## Experiência offline

Hábitos e metas ficam no Dexie. Marcar um hábito atualiza a interface de forma
otimista e cria uma operação na outbox; reloads offline preservam o estado e a
sincronização retoma no evento `online`. A tela Hoje também lê as cópias locais
de treino, refeições, água, transações e orçamentos.

## Endpoints

- `GET /routine/habits/today`: hábitos ativos e conclusão do dia local.
- `GET /goals`: metas ativas com o valor calculado no servidor.
- `GET /dashboard/today`: resumo dos quatro domínios no fuso do usuário.

Os testes de API cobrem cálculo e isolamento; o fluxo E2E cobre painel, metas e
persistência do check-in durante um reload offline em desktop e mobile.
