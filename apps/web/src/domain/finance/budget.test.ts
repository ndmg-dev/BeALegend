import { describe, expect, it } from 'vitest';
import { budgetProgress, budgetState, spentByCategory } from './budget';

describe('budget', () => {
  it('calcula progresso e os três estados', () => {
    expect(budgetProgress({ limite_centavos: 10000, gasto_centavos: 6400 })).toBe(0.64);
    expect(budgetState({ limite_centavos: 10000, gasto_centavos: 6400 })).toBe('ok');
    expect(budgetState({ limite_centavos: 10000, gasto_centavos: 8500 })).toBe('warning');
    expect(budgetState({ limite_centavos: 10000, gasto_centavos: 10001 })).toBe('over');
  });

  it('soma apenas despesas categorizadas', () => {
    const result = spentByCategory([
      { category_id: 'mercado', tipo: 'despesa', valor_centavos: 1200 },
      { category_id: 'mercado', tipo: 'despesa', valor_centavos: 300 },
      { category_id: 'mercado', tipo: 'receita', valor_centavos: 9000 },
      { category_id: null, tipo: 'despesa', valor_centavos: 100 },
    ]);
    expect(result.get('mercado')).toBe(1500);
  });
});
