export interface BudgetInput {
  limite_centavos: number;
  gasto_centavos: number;
}

export type BudgetState = 'ok' | 'warning' | 'over';

export function budgetProgress(input: BudgetInput): number {
  if (input.limite_centavos <= 0) return input.gasto_centavos > 0 ? 1 : 0;
  return Math.max(0, input.gasto_centavos / input.limite_centavos);
}

export function budgetState(input: BudgetInput): BudgetState {
  const progress = budgetProgress(input);
  if (progress > 1) return 'over';
  if (progress >= 0.85) return 'warning';
  return 'ok';
}

export function spentByCategory(
  transactions: readonly { category_id: string | null; tipo: string; valor_centavos: number }[],
): Map<string, number> {
  const result = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.tipo !== 'despesa' || !transaction.category_id) continue;
    result.set(
      transaction.category_id,
      (result.get(transaction.category_id) ?? 0) + transaction.valor_centavos,
    );
  }
  return result;
}
