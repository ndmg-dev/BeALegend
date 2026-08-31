# Web Push, resumo semanal e worker

A fase 6 coloca todo agendamento no servidor. Isso é obrigatório para a PWA
funcionar também no iOS, onde não existe Background Sync para executar tarefas
no horário. O service worker recebe um payload pequeno, mostra a notificação e
abre a rota indicada quando ela é tocada.

## Opt-in e privacidade

O app não pede permissão no primeiro carregamento. O card de lembretes aparece
depois do primeiro check-in concluído e a caixa do navegador só é aberta por um
toque explícito em **Ativar**.

Cada endpoint Web Push identifica um navegador e é sensível. As assinaturas:

- ficam no servidor, fora do sync e do IndexedDB;
- são protegidas por RLS;
- são removidas localmente e no servidor no logout;
- mudam de dono atomicamente se o mesmo navegador entrar em outra conta;
- são desativadas quando o provedor Push responde `404` ou `410`.

Essa transferência usa a função restrita `claim_push_subscription`. Ela é
`SECURITY DEFINER`, mas rejeita qualquer `user_id` diferente do contexto RLS e
não devolve dados da conta anterior.

## Gatilhos

- **Treino:** no horário escolhido, se o dia do plano não for descanso.
- **Refeição:** no horário de cada `meal_slot`, se ainda não houver registro.
- **Resumo semanal:** domingo no horário escolhido, com treinos concluídos,
  aderência alimentar, gastos e hábitos previstos/concluídos.

O worker roda uma vez por minuto, calcula o horário no fuso IANA do usuário e
registra cada entrega com uma chave única por assinatura, tipo e horário. Isso
impede duplicação se o job for executado novamente. Assinaturas expiradas são
desativadas automaticamente.

## Operação

As variáveis `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` precisam
estar presentes na API e no worker. `infra/gen-secrets.sh` gera o par no
primeiro deploy. Sem as chaves, os endpoints continuam funcionando, mas a UI
informa que o envio ainda não está configurado e o worker não tenta entregar.

Endpoints autenticados:

- `GET /notifications/config`
- `POST /notifications/subscriptions`
- `POST /notifications/unsubscribe`
- `PATCH /notifications/preferences`
- `GET /summary/weekly`

Os containers da API e do worker são somente leitura, sem capabilities Linux e
com `no-new-privileges`. O Caddy aplica CSP, HSTS, política de permissões,
proteção contra framing e isolamento da janela de origem.
