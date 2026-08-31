import { describe, expect, it } from 'vitest';
import { summarizeWeek } from './weekly';

describe('summarizeWeek', () => {
  it('resume os quatro domínios sem progresso manual', () => {
    expect(summarizeWeek({
      completedTrainingDates: ['2026-08-24', '2026-08-26', '2026-08-26'],
      mealAdherence: ['dentro', 'parcial', 'fora'],
      expenseCents: [1250, 3000],
      completedHabits: 8,
      expectedHabits: 10,
    })).toEqual({
      trainingCount: 2, mealsCount: 3, adherencePercent: 50, expenseCents: 4250,
      completedHabits: 8, expectedHabits: 10,
    });
  });

  it('não divide por zero em uma semana vazia', () => {
    expect(summarizeWeek({
      completedTrainingDates: [], mealAdherence: [], expenseCents: [],
      completedHabits: 0, expectedHabits: 0,
    }).adherencePercent).toBe(0);
  });
});
