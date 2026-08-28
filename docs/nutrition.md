# Nutrição — aderência, refeições e água

## Princípio da v1

A fase mede **aderência ao plano e regularidade**, não calorias ou macros.
Registrar uma refeição planejada exige abrir o horário, escolher um dos três
estados e confirmar; a descrição já vem preenchida pelo plano.

## Modelo

Quatro tabelas offline-first e protegidas por RLS:

| tabela | finalidade |
|---|---|
| `meal_plan` | plano alimentar ativo do usuário |
| `meal_slot` | horários/refeições planejadas e sua ordem |
| `meal_log` | o que foi consumido, aderência, tags, foto e notas |
| `water_log` | adições de água ao longo do dia |

`user_id` é denormalizado em todas. O sync valida `meal_plan_id` e `slot_id`
dentro da RLS antes de criar ou editar uma linha, impedindo referências a
dados de outra pessoa.

## Primeiro uso

Depois do primeiro pull, se não houver plano local, o cliente cria `Plano
diário` com Café da manhã, Almoço, Lanche da tarde e Jantar. Tudo nasce no
Dexie e entra na outbox; portanto o onboarding também funciona offline.

## Fotos

Sem um serviço de object storage no stack atual, a foto v1 é uma imagem de
até 750 KB convertida em data URL, persistida no IndexedDB e sincronizada com
o log. Ao adicionar storage na v2, `foto_url` passa a guardar a URL do objeto
sem mudar o modelo da feature.

## Aderência e hidratação

- `dentro` vale 1 ponto; `parcial`, meio ponto; `fora`, zero.
- O percentual é função pura e sem registros vale zero.
- Água é append de 250 ou 500 ml em um toque; a meta de 2 L é visual nesta
  fase e poderá ser configurável junto de metas na fase 5.

## API

As escritas passam por `POST /sync/batch`. `GET /nutrition/day/{YYYY-MM-DD}`
devolve slots, refeições do dia e total de água para integrações e para a
futura tela Hoje.

## Fora desta fase

- Base de alimentos, calorias e macros.
- Análise de foto por modelo de visão.
- Lembretes por horário; o agendamento no servidor faz parte da fase 6.
