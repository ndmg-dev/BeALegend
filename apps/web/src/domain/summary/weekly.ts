export interface WeeklySummaryInput {
  completedTrainingDates: readonly string[];
  mealAdherence: readonly ('dentro' | 'parcial' | 'fora')[];
  expenseCents: readonly number[];
  completedHabits: number;
  expectedHabits: number;
}

export interface WeeklySummary {
  trainingCount: number;
  mealsCount: number;
  adherencePercent: number;
  expenseCents: number;
  completedHabits: number;
  expectedHabits: number;
}

export function summarizeWeek(input: WeeklySummaryInput): WeeklySummary {
  const points = input.mealAdherence.reduce(
    (sum, adherence) => sum + (adherence === 'dentro' ? 100 : adherence === 'parcial' ? 50 : 0),
    0,
  );
  return {
    trainingCount: new Set(input.completedTrainingDates).size,
    mealsCount: input.mealAdherence.length,
    adherencePercent: input.mealAdherence.length ? Math.round(points / input.mealAdherence.length) : 0,
    expenseCents: input.expenseCents.reduce((sum, cents) => sum + cents, 0),
    completedHabits: input.completedHabits,
    expectedHabits: input.expectedHabits,
  };
}
