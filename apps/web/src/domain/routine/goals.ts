export interface GoalMetricInput {
  metrica_ref: string;
  alvo: number;
}

export interface MetricSnapshot {
  trainingSessionsWeek: number;
  waterToday: number;
  habitsToday: number;
}

export function goalCurrentValue(goal: GoalMetricInput, snapshot: MetricSnapshot): number {
  switch (goal.metrica_ref) {
    case 'training.sessions.week': return snapshot.trainingSessionsWeek;
    case 'nutrition.water.today': return snapshot.waterToday;
    case 'routine.habits.today': return snapshot.habitsToday;
    default: return 0;
  }
}

export function goalProgress(goal: GoalMetricInput, snapshot: MetricSnapshot): number {
  if (goal.alvo <= 0) return 0;
  return Math.min(1, Math.max(0, goalCurrentValue(goal, snapshot) / goal.alvo));
}
