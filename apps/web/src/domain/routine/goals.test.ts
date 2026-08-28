import { describe, expect, it } from 'vitest';
import { goalCurrentValue, goalProgress } from './goals';

const snapshot = { trainingSessionsWeek: 2, waterToday: 1500, habitsToday: 3 };

describe('goals', () => {
  it('resolve métricas reais por referência', () => {
    expect(goalCurrentValue({ metrica_ref: 'training.sessions.week', alvo: 3 }, snapshot)).toBe(2);
    expect(goalCurrentValue({ metrica_ref: 'nutrition.water.today', alvo: 2000 }, snapshot)).toBe(1500);
  });

  it('limita progresso entre zero e um', () => {
    expect(goalProgress({ metrica_ref: 'routine.habits.today', alvo: 2 }, snapshot)).toBe(1);
    expect(goalProgress({ metrica_ref: 'unknown', alvo: 10 }, snapshot)).toBe(0);
  });
});
