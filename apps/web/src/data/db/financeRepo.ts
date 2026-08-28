import { uuidv7 } from '@/data/ids';
import { enfileirar } from '@/data/sync/outbox';
import {
  db,
  type Account,
  type Budget,
  type Category,
  type FinanceTransaction,
} from './schema';

function syncFields(userId: string) {
  const now = new Date().toISOString();
  return { user_id: userId, row_version: 0, deleted_at: null, criado_em: now, updated_at: now };
}

export async function accounts(): Promise<Account[]> {
  return (await db.account.orderBy('nome').toArray()).filter((item) => item.deleted_at === null);
}

export async function categories(tipo: Category['tipo'] = 'despesa'): Promise<Category[]> {
  return (await db.category.orderBy('nome').toArray()).filter(
    (item) => item.tipo === tipo && item.deleted_at === null,
  );
}

export async function createAccount(
  input: Pick<Account, 'nome' | 'tipo' | 'saldo_inicial_centavos'>,
  userId: string,
): Promise<Account> {
  const line: Account = { id: uuidv7(), ...input, ...syncFields(userId) };
  await db.transaction('rw', db.account, db.outbox, async () => {
    await db.account.add(line);
    await enfileirar({ entidade: 'account', operacao: 'create', registroId: line.id, payload: input });
  });
  return line;
}

export async function createCategory(
  input: Pick<Category, 'nome' | 'tipo' | 'cor' | 'icone' | 'pai_id'>,
  userId: string,
): Promise<Category> {
  const line: Category = { id: uuidv7(), ...input, ...syncFields(userId) };
  await db.transaction('rw', db.category, db.outbox, async () => {
    await db.category.add(line);
    await enfileirar({ entidade: 'category', operacao: 'create', registroId: line.id, payload: input });
  });
  return line;
}

export async function ensureFinanceDefaults(userId: string): Promise<void> {
  if ((await accounts()).length === 0) {
    await createAccount({ nome: 'Carteira', tipo: 'carteira', saldo_inicial_centavos: 0 }, userId);
  }
  if ((await categories()).length === 0) {
    for (const [nome, icone] of [
      ['Mercado', '🛒'], ['Restaurante', '🍽'], ['Transporte', '↗'],
      ['Moradia', '⌂'], ['Lazer', '◇'],
    ] as const) {
      await createCategory({ nome, tipo: 'despesa', cor: null, icone, pai_id: null }, userId);
    }
  }
}

export interface NewTransaction {
  accountId: string;
  categoryId: string | null;
  cents: number;
  tipo: FinanceTransaction['tipo'];
  date: string;
  description?: string | null;
}

export async function createTransaction(input: NewTransaction, userId: string): Promise<FinanceTransaction> {
  const line: FinanceTransaction = {
    id: uuidv7(),
    account_id: input.accountId,
    category_id: input.categoryId,
    valor_centavos: input.cents,
    tipo: input.tipo,
    data: input.date,
    descricao: input.description ?? null,
    recorrente_id: null,
    tags: [],
    ...syncFields(userId),
  };
  await db.transaction('rw', db.finance_transaction, db.outbox, async () => {
    await db.finance_transaction.add(line);
    await enfileirar({
      entidade: 'transaction', operacao: 'create', registroId: line.id,
      payload: {
        account_id: line.account_id, category_id: line.category_id,
        valor_centavos: line.valor_centavos, tipo: line.tipo, data: line.data,
        descricao: line.descricao, recorrente_id: null, tags: [],
      },
    });
  });
  return line;
}

export async function transactionsInMonth(month: string): Promise<FinanceTransaction[]> {
  const lines = await db.finance_transaction.toArray();
  return lines
    .filter((item) => item.data.startsWith(month) && item.deleted_at === null)
    .sort((a, b) => b.data.localeCompare(a.data) || b.criado_em.localeCompare(a.criado_em));
}

export async function budgetsInMonth(month: string): Promise<Budget[]> {
  return (await db.budget.where('mes_ano').equals(month).toArray()).filter(
    (item) => item.deleted_at === null,
  );
}

export async function upsertBudget(
  categoryId: string,
  month: string,
  cents: number,
  userId: string,
): Promise<void> {
  const existing = (await budgetsInMonth(month)).find((item) => item.category_id === categoryId);
  if (existing) {
    await db.transaction('rw', db.budget, db.outbox, async () => {
      await db.budget.update(existing.id, { limite_centavos: cents, updated_at: new Date().toISOString() });
      await enfileirar({
        entidade: 'budget', operacao: 'update', registroId: existing.id,
        payload: { limite_centavos: cents },
      });
    });
    return;
  }
  const line: Budget = {
    id: uuidv7(), category_id: categoryId, mes_ano: month, limite_centavos: cents,
    ...syncFields(userId),
  };
  await db.transaction('rw', db.budget, db.outbox, async () => {
    await db.budget.add(line);
    await enfileirar({
      entidade: 'budget', operacao: 'create', registroId: line.id,
      payload: { category_id: categoryId, mes_ano: month, limite_centavos: cents },
    });
  });
}
