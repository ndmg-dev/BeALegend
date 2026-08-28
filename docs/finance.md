# Finanças — lançamento rápido e orçamento mensal

## Modelo e precisão

Cinco tabelas sincronizadas: `account`, `category`, `transaction`, `budget` e
`recurring`. Todo valor monetário atravessa API, Postgres e IndexedDB como
**centavos inteiros** (`BIGINT`/`number` seguro); não há conversão por `float`.

Todas carregam `user_id`, RLS direta, `row_version` e `deleted_at`. O motor de
sync valida as referências sob a RLS tanto no create quanto no patch: uma
transação não consegue apontar para a conta ou categoria de outro usuário.

## Offline-first

O primeiro acesso cria, localmente, a conta `Carteira` e cinco categorias de
despesa. Essas criações e todo lançamento entram na mesma outbox idempotente
das demais features. A tela atualiza antes da rede e o pull posterior
reconcilia a versão do servidor.

O Dexie usa a tabela `finance_transaction` porque `transaction` já é o nome do
método transacional da biblioteca. No protocolo de sync, a entidade continua
se chamando `transaction`.

## Tela Grana

- Novo gasto: valor, categoria e confirmar; descrição é opcional e a primeira
  conta é usada como padrão.
- Histórico do mês, ordenado do mais recente para o mais antigo.
- Limite mensal por categoria com barra e três estados: normal, atenção em
  85% e estourado acima de 100%. O estado sempre inclui texto/ícone, nunca só
  cor.
- Formatação `pt-BR`; `parseMoney("1.234,56")` produz `123456` centavos sem
  passar por aritmética de ponto flutuante.

## API

Escritas usam `POST /sync/batch`. Leituras agregadas disponíveis:

- `GET /finance/transactions?from&to&category`
- `GET /finance/budgets/{YYYY-MM}`
- `GET /finance/summary?from&to`

## Fora desta fase

- Importação OFX/CSV e cartões/faturas (v2 do produto).
- Geração automática das recorrências; a entidade já existe, mas o worker é
  parte da fase 6.
- Interface de transferências e receitas. O modelo e o sync aceitam ambos,
  enquanto a tela v1 prioriza o lançamento de despesas em poucos toques.
