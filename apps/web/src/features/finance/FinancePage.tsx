import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  accounts,
  budgetsInMonth,
  categories,
  createTransaction,
  ensureFinanceDefaults,
  transactionsInMonth,
  upsertBudget,
} from '@/data/db/financeRepo';
import { sincronizar } from '@/data/sync/engine';
import { spentByCategory } from '@/domain/finance/budget';
import { formatMoney, parseMoney } from '@/domain/finance/money';
import { toLocalDate } from '@/domain/time/day';
import { useSession } from '@/features/auth/useSession';
import { BudgetBar } from '@/ui/BudgetBar';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { TextField } from '@/ui/TextField';
import { QuickEntrySheet } from './QuickEntrySheet';

export function FinancePage() {
  const user = useSession((state) => state.user);
  const today = user ? toLocalDate(new Date(), user.timezone) : '';
  const month = today.slice(0, 7);
  const data = useLiveQuery(async () => ({
    accounts: await accounts(),
    categories: await categories(),
    transactions: await transactionsInMonth(month),
    budgets: await budgetsInMonth(month),
  }), [month]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void sincronizar().then(async () => {
      if (!cancelled) await ensureFinanceDefaults(user.id);
    });
    return () => { cancelled = true; };
  }, [user]);

  const spent = useMemo(() => spentByCategory(data?.transactions ?? []), [data?.transactions]);
  const categoryById = useMemo(
    () => new Map((data?.categories ?? []).map((category) => [category.id, category])),
    [data?.categories],
  );
  const todaySpent = (data?.transactions ?? [])
    .filter((item) => item.data === today && item.tipo === 'despesa')
    .reduce((sum, item) => sum + item.valor_centavos, 0);

  if (!user || !data) return <div role="status" className="text-text-muted">Carregando finanças…</div>;

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-sp-5">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-title">Grana</h1>
          <p className="text-label text-text-muted">{formatMoney(todaySpent)} hoje</p>
        </div>
      </header>

      <QuickEntrySheet
        accounts={data.accounts}
        categories={data.categories}
        onSave={async (input) => {
          await createTransaction({
            accountId: input.accountId, categoryId: input.categoryId, cents: input.cents,
            tipo: 'despesa', date: today, description: input.description || null,
          }, user.id);
          void sincronizar();
        }}
      />

      <Card className="flex flex-col gap-sp-5 border-l-[3px] border-l-financas-400">
        <div className="flex items-baseline justify-between">
          <h2 className="text-heading">Orçamentos</h2>
          <span className="text-label text-text-muted">{month}</span>
        </div>
        {data.budgets.length === 0 ? (
          <p className="text-body text-text-secondary">Defina um limite para acompanhar seus gastos.</p>
        ) : data.budgets.map((budget) => (
          <BudgetBar
            key={budget.id}
            name={categoryById.get(budget.category_id)?.nome ?? 'Categoria'}
            spentCents={spent.get(budget.category_id) ?? 0}
            limitCents={budget.limite_centavos}
          />
        ))}
        <BudgetEditor
          categories={data.categories}
          onSave={async (categoryId, cents) => {
            await upsertBudget(categoryId, month, cents, user.id);
            void sincronizar();
          }}
        />
      </Card>

      <Card>
        <h2 className="mb-sp-3 text-heading">Lançamentos do mês</h2>
        {data.transactions.length === 0 ? (
          <div className="flex flex-col items-center gap-sp-2 py-sp-4 text-center">
            <img src="/assets/empty-gastos.svg" alt="" width={56} height={56} />
            <p className="text-body text-text-muted">Nenhum lançamento ainda.</p>
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {data.transactions.slice(0, 30).map((item) => (
              <div key={item.id} className="flex min-h-tap items-center justify-between gap-sp-3 py-sp-2">
                <div>
                  <p className="text-body">{item.descricao || categoryById.get(item.category_id ?? '')?.nome || 'Gasto'}</p>
                  <p className="text-caption text-text-muted">{item.data}</p>
                </div>
                <span className="text-body text-financas-300">− {formatMoney(item.valor_centavos)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}

function BudgetEditor({
  categories: options,
  onSave,
}: {
  categories: Awaited<ReturnType<typeof categories>>;
  onSave: (categoryId: string, cents: number) => Promise<void>;
}) {
  const [categoryId, setCategoryId] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string>();

  async function save() {
    const cents = parseMoney(value);
    if (!categoryId || !cents) return setError('Escolha a categoria e informe um limite válido.');
    await onSave(categoryId, cents);
    setValue('');
    setError(undefined);
  }

  return (
    <div className="border-t border-border-subtle pt-sp-4">
      <p className="mb-sp-3 text-label text-text-secondary">Definir ou alterar limite</p>
      <div className="grid gap-sp-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="flex flex-col gap-sp-2 text-label text-text-secondary">
          Categoria
          <select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className="min-h-tap rounded-md border border-border bg-surface-sunken px-sp-3 text-body text-text"
          >
            <option value="">Selecione</option>
            {options.map((category) => <option key={category.id} value={category.id}>{category.nome}</option>)}
          </select>
        </label>
        <TextField label="Limite" inputMode="decimal" placeholder="0,00" value={value} onChange={(event) => setValue(event.target.value)} />
        <Button type="button" onClick={() => void save()}>Salvar</Button>
      </div>
      {error ? <p role="alert" className="mt-sp-2 text-label text-danger">⚠ {error}</p> : null}
    </div>
  );
}
