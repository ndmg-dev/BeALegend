import { describe, expect, it } from 'vitest';
import { emptySnapshot, KNOWN_METRICS, metricValue } from './metrics';

describe('metricValue', () => {
  it('resolve cada métrica conhecida a partir do snapshot', () => {
    const s = emptySnapshot();
    s.training.sessionsTotal = 42;
    s.nutrition.melhorSemanaAderencia = 88;
    s.finance.mesesDentroDoOrcamento = 2;
    s.routine.melhorStreakHabito = 15;
    s.cross.diasAtivo = 60;
    s.conquistasDesbloqueadas = 7;

    expect(metricValue('training.sessions.total', s)).toBe(42);
    expect(metricValue('nutrition.adherence.bestWeek', s)).toBe(88);
    expect(metricValue('finance.months.underBudget', s)).toBe(2);
    expect(metricValue('routine.habit.bestStreak', s)).toBe(15);
    expect(metricValue('cross.days.active', s)).toBe(60);
    expect(metricValue('meta.unlocked.count', s)).toBe(7);
  });

  it('trata booleano como 0/1', () => {
    const s = emptySnapshot();
    expect(metricValue('training.load.increased', s)).toBe(0);
    s.training.aumentouCarga = true;
    expect(metricValue('training.load.increased', s)).toBe(1);
  });

  it('devolve 0 para métrica desconhecida', () => {
    expect(metricValue('nao.existe', emptySnapshot())).toBe(0);
  });

  it('snapshot zerado dá 0 em toda métrica conhecida', () => {
    const s = emptySnapshot();
    for (const m of KNOWN_METRICS) {
      const v = metricValue(m, s);
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBe(0);
    }
  });
});
