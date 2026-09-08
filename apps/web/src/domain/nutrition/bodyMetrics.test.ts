import { describe, expect, it } from 'vitest';
import { ordenarPorData, variacao } from './bodyMetrics';

describe('ordenarPorData', () => {
  it('ordena cronologicamente independente da ordem de entrada', () => {
    const registros = [
      { data: '2026-01-15', valor: 82 },
      { data: '2026-01-01', valor: 85 },
      { data: '2026-01-08', valor: 83.5 },
    ];
    expect(ordenarPorData(registros).map((r) => r.data)).toEqual([
      '2026-01-01', '2026-01-08', '2026-01-15',
    ]);
  });

  it('lista vazia devolve lista vazia', () => {
    expect(ordenarPorData([])).toEqual([]);
  });

  it('não muta o array original', () => {
    const registros = [{ data: '2026-01-15', valor: 82 }, { data: '2026-01-01', valor: 85 }];
    const copia = [...registros];
    ordenarPorData(registros);
    expect(registros).toEqual(copia);
  });
});

describe('variacao', () => {
  it('null com menos de dois pontos', () => {
    expect(variacao([])).toBeNull();
    expect(variacao([{ data: '2026-01-01', valor: 85 }])).toBeNull();
  });

  it('diferença entre o primeiro e o último ponto, cronologicamente', () => {
    const registros = [
      { data: '2026-01-15', valor: 82 },
      { data: '2026-01-01', valor: 85 },
    ];
    expect(variacao(registros)).toBe(-3);
  });

  it('pode ser positiva (peso subiu)', () => {
    const registros = [
      { data: '2026-01-01', valor: 78 },
      { data: '2026-02-01', valor: 80.5 },
    ];
    expect(variacao(registros)).toBe(2.5);
  });

  it('arredonda para uma casa decimal', () => {
    const registros = [
      { data: '2026-01-01', valor: 78.33 },
      { data: '2026-02-01', valor: 80.27 },
    ];
    expect(variacao(registros)).toBeCloseTo(1.9);
  });
});
