import { describe, expect, it } from 'vitest';
import type { PlanItemInput, SetLogInput } from './progression';
import { suggestProgression } from './progression';

const ITEM: PlanItemInput = { series_min: 3, reps_max: 12, rir_min: 1 };

function serie(reps: number, rir: number | null, numero = 1): SetLogInput {
  return { numero_serie: numero, reps, rir };
}

describe('suggestProgression', () => {
  it('sugere aumento quando todas as séries batem o topo com RIR suficiente', () => {
    const sets = [serie(12, 2, 1), serie(12, 1, 2), serie(12, 2, 3)];
    const sugestao = suggestProgression(sets, ITEM);

    expect(sugestao).not.toBeNull();
    expect(sugestao?.tipo).toBe('aumentar_carga');
    expect(sugestao?.alternativas.length).toBeGreaterThan(0);
  });

  it('não sugere se alguma série ficou abaixo do topo da faixa', () => {
    const sets = [serie(12, 2), serie(10, 2), serie(12, 2)];
    expect(suggestProgression(sets, ITEM)).toBeNull();
  });

  it('não sugere se o RIR ficou abaixo do alvo — teria ido à falha', () => {
    const sets = [serie(12, 0), serie(12, 1), serie(12, 1)];
    expect(suggestProgression(sets, ITEM)).toBeNull();
  });

  it('não sugere sem todas as séries do plano registradas', () => {
    const sets = [serie(12, 2), serie(12, 2)]; // plano pede 3
    expect(suggestProgression(sets, ITEM)).toBeNull();
  });

  it('aceita mais séries do que o mínimo do plano', () => {
    const sets = [serie(12, 2, 1), serie(12, 2, 2), serie(12, 2, 3), serie(12, 2, 4)];
    expect(suggestProgression(sets, ITEM)).not.toBeNull();
  });

  it('rir null quando o plano exige RIR não sugere aumento', () => {
    const sets = [serie(12, null), serie(12, 2), serie(12, 2)];
    expect(suggestProgression(sets, ITEM)).toBeNull();
  });

  it('exercício sem RIR alvo (isométrico) ignora a checagem de RIR', () => {
    const item: PlanItemInput = { series_min: 3, reps_max: 60, rir_min: null };
    const sets = [serie(60, null), serie(65, null), serie(60, null)];
    expect(suggestProgression(sets, item)).not.toBeNull();
  });

  it('sem faixa de reps definida, não há o que sugerir', () => {
    const item: PlanItemInput = { series_min: 3, reps_max: null, rir_min: 1 };
    const sets = [serie(12, 2), serie(12, 2), serie(12, 2)];
    expect(suggestProgression(sets, item)).toBeNull();
  });

  it('sem series_min no plano, uma série já é suficiente para avaliar', () => {
    const item: PlanItemInput = { series_min: null, reps_max: 12, rir_min: 1 };
    expect(suggestProgression([serie(12, 2)], item)).not.toBeNull();
  });

  it('o incremento sugerido é o parâmetro informado', () => {
    const sets = [serie(12, 2, 1), serie(12, 2, 2), serie(12, 2, 3)];
    const sugestao = suggestProgression(sets, ITEM, 1.5);
    expect(sugestao?.incrementoKg).toBe(1.5);
  });

  it('lista as três alternativas da planilha quando não há anilha menor', () => {
    const sets = [serie(12, 2, 1), serie(12, 2, 2), serie(12, 2, 3)];
    const sugestao = suggestProgression(sets, ITEM);
    const tipos = sugestao?.alternativas.map((a) => a.tipo);
    expect(tipos).toContain('mais_reps');
    expect(tipos).toContain('descida_lenta');
    expect(tipos).toContain('mais_serie');
  });

  it('sem nenhuma série registrada, não sugere nada', () => {
    expect(suggestProgression([], ITEM)).toBeNull();
  });
});
