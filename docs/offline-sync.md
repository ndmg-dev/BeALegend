# Camada offline

O IndexedDB é cache e fila de escrita. **O servidor é a fonte da verdade** — o
Safari pode limpar o armazenamento local depois de ~7 dias sem uso, e dois
dispositivos precisam convergir.

## O caminho de uma escrita

```
criar()  →  Dexie (aparece na tela)  →  outbox  →  POST /sync/batch  →  Postgres
                                                          ↓
                                          resposta traz a linha do servidor
                                                          ↓
                                                   grava no Dexie
```

Nenhum passo depois do primeiro bloqueia a UI. Se a rede não existe, o registro
está salvo do mesmo jeito e a fila espera.

## IDs

O cliente gera **UUIDv7** (`data/ids.ts`) e o servidor aceita. Isso elimina a
classe inteira de bug de "id temporário virou id real e as referências
quebraram" — que é o que mais mata app offline. A versão 7 é ordenável por
tempo, então as chaves do Dexie saem na ordem de criação.

## Idempotência

Cada item da outbox nasce com uma `idempotency_key` que **não muda entre
retentativas**. O servidor guarda o resultado da primeira aplicação em
`idempotency_record` (PK `(user_id, chave)`) e devolve o mesmo resultado, com
`status: "duplicate"`, em qualquer reenvio.

Sem isso, um retry após timeout duplica lançamento de gasto — o cliente não
tem como saber se o servidor recebeu, e a única saída segura é reenviar.

A chave é escopada por usuário de propósito: uma chave adivinhada não pode
devolver a resposta de outra pessoa.

## Cursor de sync

`GET /sync?since=<cursor>` devolve deltas por entidade. O cursor é um
`row_version` vindo de uma **sequência global do Postgres**, não de
`updated_at`.

Timestamp empata — duas escritas no mesmo microssegundo — e depende do relógio
do servidor. Empate no cursor faz o cliente pular linhas em silêncio, que é o
pior tipo de bug de sync. Um trigger (`bump_row_version`) incrementa a
sequência a cada UPDATE.

> Quem escreve `row_version` é o banco, então o modelo declara
> `server_onupdate=FetchedValue()` e o engine dá `refresh` depois do flush.
> Sem isso o SQLAlchemy devolveria o valor velho que tem em memória e o cursor
> do cliente pararia de avançar sem avisar.

**O push não avança o cursor.** Ele aplica as linhas que a resposta devolveu,
mas quem move o cursor é o pull — senão o cliente pularia as escritas de outro
dispositivo feitas no mesmo intervalo.

## Delete é lógico

Toda tabela sincronizada tem `deleted_at`. Um `DELETE` de verdade sumiria do
delta, o outro dispositivo nunca ficaria sabendo, e a linha ressuscitaria no
próximo push dele.

## Conflitos

**Last-write-wins por campo.** O `update` carrega só os campos que aquele
dispositivo mudou (`exclude_unset` no Pydantic). Dois dispositivos que editam
campos diferentes da mesma linha convivem; quando colidem no mesmo campo, quem
chega depois vence e o `updated_at` do servidor registra a ordem.

`reconciliarLinha` (`domain/sync/reconcile.ts`) decide o que fica gravado. A
regra que menos se pensa e mais importa: **a edição que ainda não subiu
continua visível por cima da versão do servidor**. Sem isso, o campo que o
usuário acabou de digitar "volta" na tela ao sincronizar — o pior sintoma
possível de um app offline.

### Append-only

`SyncEntity.append_only` recusa `update` e `delete`. `set_log` se registra
assim na fase 2: uma série registrada não é editada nem apagada, e
sobrescrever um log de treino perde dado que não volta.

## Coalescência

`coalescerPendencias` funde as operações pendentes do mesmo registro num envio
só. Ajustar a carga de 80 para 82,5 e depois 85 é uma requisição, não três. Um
registro criado e apagado offline não vira requisição nenhuma — nunca existiu
para o servidor.

## Backoff

`nextRetryDelay` dobra a espera a cada tentativa, com teto de 5 min e jitter
determinístico de ±20% (derivado do `criado_em` do item, não de
`Math.random()`, para a função continuar pura). Depois de 10 tentativas o item
para de ser retentado sozinho: se falhou 10 vezes não vai passar na 11ª.

Erro 4xx é permanente — reenviar produz o mesmo erro para sempre e entope a
fila atrás dele. 408 e 429 são exceção: são "tente de novo", não "você errou".

**O backoff precisa de um relógio próprio.** Os gatilhos externos (voltar a
rede, focar o app, intervalo de 5 min) são esparsos demais: sem
`agendarRetentativa`, um item que falhou com espera de 1 s ficaria parado até
o próximo foco do app.

## Gatilhos

Não há worker de fundo — iOS não tem background sync. O app sincroniza quando
está na frente do usuário:

| gatilho | quando |
|---|---|
| `online` | a rede voltou |
| `visibilitychange` | o app voltou ao primeiro plano |
| intervalo | a cada 5 min, com o app aberto |
| `agendarRetentativa` | quando a janela de backoff de algum item vence |

Push antes de pull: assim o delta já volta com o que este dispositivo acabou
de mandar, e a reconciliação acontece uma vez só.

## Sessão offline

Falha de rede no `/auth/refresh` **não** desloga. O perfil do usuário fica em
`meta` (id, e-mail, nome e o fuso — de que toda fronteira de "dia" depende) e
o app abre autenticado a partir dele. Só um 401 de verdade limpa a sessão.

Deslogar por falta de rede expulsaria o usuário do app exatamente na academia
sem sinal, que é onde ele mais precisa registrar. Nenhum segredo é persistido:
o access token continua só em memória e o refresh no cookie `httpOnly`.

## Fuso horário

Toda fronteira de dia — streak, orçamento diário, aderência — é calculada no
fuso do perfil (`domain/time/day.ts`), nunca em UTC nem no fuso do servidor.
Às 21h em São Paulo já é o dia seguinte em UTC, e um streak que quebra sozinho
destrói a confiança no app.

## Versionamento de schema

Alembic no servidor, `db.version(n)` no Dexie. Toda mudança de forma entra
como uma versão nova, nunca editando a anterior.

## Testes

| garantia | onde |
|---|---|
| escrita offline chega íntegra | `apps/api/tests/test_sync.py`, `apps/web/e2e/offline-sync.spec.ts` |
| retry duplicado não duplica | `test_retry_com_a_mesma_chave_nao_duplica`, E2E de sync repetido |
| edição concorrente é determinística | `test_dispositivos_que_editam_campos_diferentes_convivem` |
| backoff e reconciliação | `domain/sync/*.test.ts` — 100% de cobertura |
| reload offline abre o app | E2E, contra o **build de produção** |

Os E2E rodam contra `vite preview`, não contra o dev server: o service worker
só precacheia o shell no build, e sem ele um reload offline não carrega nada —
que é metade do que esta camada promete.
