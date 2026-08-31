import { describe, expect, it } from 'vitest';
import { CATALOG, findAchievement } from './catalog';
import { KNOWN_METRICS } from './metrics';

describe('catálogo de conquistas', () => {
  it('tem chaves únicas', () => {
    const keys = CATALOG.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('só referencia métricas conhecidas', () => {
    for (const a of CATALOG) {
      expect(KNOWN_METRICS).toContain(a.metrica);
    }
  });

  it('todo alvo é positivo', () => {
    for (const a of CATALOG) expect(a.alvo).toBeGreaterThan(0);
  });

  it('tem exatamente uma platina, e ela mira todas as outras', () => {
    const platinas = CATALOG.filter((a) => a.tier === 'platina');
    expect(platinas).toHaveLength(1);
    expect(platinas[0]?.metrica).toBe('meta.unlocked.count');
    expect(platinas[0]?.alvo).toBe(CATALOG.length - 1);
  });

  it('nenhuma conquista comum usa métrica meta.*', () => {
    for (const a of CATALOG) {
      if (a.tier !== 'platina') expect(a.metrica.startsWith('meta.')).toBe(false);
    }
  });

  it('findAchievement acha pela chave e devolve undefined pro que não existe', () => {
    expect(findAchievement('treino.primeiro')?.titulo).toBe('Começou');
    expect(findAchievement('nao.existe')).toBeUndefined();
  });
});
