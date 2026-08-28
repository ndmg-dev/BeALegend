import { budgetProgress, budgetState } from '@/domain/finance/budget';
import { formatMoney } from '@/domain/finance/money';

interface Props {
  name: string;
  spentCents: number;
  limitCents: number;
}

export function BudgetBar({ name, spentCents, limitCents }: Props) {
  const state = budgetState({ gasto_centavos: spentCents, limite_centavos: limitCents });
  const percent = Math.min(100, budgetProgress({ gasto_centavos: spentCents, limite_centavos: limitCents }) * 100);
  const stateText = state === 'over' ? 'estourou' : state === 'warning' ? 'atenção' : null;

  return (
    <div>
      <div className="mb-sp-2 flex justify-between gap-sp-3 text-label">
        <span className={state === 'over' ? 'text-danger' : 'text-text-secondary'}>
          {state === 'over' ? <span aria-hidden="true">⚠ </span> : null}
          {name}{stateText ? ` · ${stateText}` : ''}
        </span>
        <span className={state === 'over' ? 'text-danger' : 'text-text'}>
          {formatMoney(spentCents)} de {formatMoney(limitCents)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`Orçamento de ${name}`}
        aria-valuenow={spentCents}
        aria-valuemax={limitCents}
        className="h-2 overflow-hidden rounded-full bg-surface-sunken"
      >
        <div
          className={`h-full rounded-full ${state === 'over' ? 'bg-budget-over' : state === 'warning' ? 'bg-warning' : 'bg-budget-ok'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
