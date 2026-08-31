/**
 * Agregados de vida inteira sobre os quais as conquistas são avaliadas, e o
 * resolvedor de métrica — mesma ideia do `metrica_ref` de
 * `domain/routine/goals.ts`, mas somando desde sempre em vez da semana.
 *
 * Puro: quem monta o snapshot (varrendo o Dexie) é a camada de dados. Aqui só
 * se lê o que já veio pronto. Nada de "hoje" — datas já viraram contagens.
 */

export interface AchievementSnapshot {
  training: {
    sessionsTotal: number;
    setsTotal: number;
    /** Semanas seguidas com pelo menos um treino concluído, terminando na semana atual. */
    semanasStreak: number;
    /** Semanas em que todos os dias de treino do plano foram cumpridos. */
    semanasNoPlano: number;
    /** Já aumentou a carga de algum exercício entre duas sessões. */
    aumentouCarga: boolean;
    /** Já registrou uma sessão começando antes das 7h no fuso do usuário. */
    treinouAntesDas7: boolean;
  };
  nutrition: {
    refeicoesTotal: number;
    /** Melhor aderência semanal já registrada, 0–100. */
    melhorSemanaAderencia: number;
    /** Dias seguidos batendo a meta de água, terminando hoje ou ontem. */
    streakAgua: number;
    /** Dias em que todos os slots do plano foram registrados. */
    diasSlotsCompletos: number;
  };
  finance: {
    orcamentosCriados: number;
    mesesDentroDoOrcamento: number;
    /** Dias seguidos registrando ao menos um gasto. */
    streakRegistroGasto: number;
  };
  routine: {
    checkinsTotal: number;
    /** Maior streak já alcançado por qualquer hábito. */
    melhorStreakHabito: number;
    /** Dias em que todos os hábitos previstos foram concluídos. */
    diasPerfeitos: number;
  };
  cross: {
    /** Dias civis distintos com qualquer registro no app. */
    diasAtivo: number;
    /** Dias com treino + refeição + gasto + hábito no mesmo dia. */
    diasQuatroAreas: number;
  };
  /**
   * Quantas conquistas já contam como desbloqueadas. O `evaluateAchievements`
   * recalcula isto por conta própria para as métricas `meta.*`; um chamador
   * avulso de `metricValue` pode passar a contagem da tabela de marcadores.
   */
  conquistasDesbloqueadas: number;
}

/** Toda métrica que o catálogo tem permissão de referenciar. */
export const KNOWN_METRICS = [
  'training.sessions.total',
  'training.sets.total',
  'training.weeks.streak',
  'training.weeks.perfect',
  'training.load.increased',
  'training.earlybird',
  'nutrition.meals.total',
  'nutrition.adherence.bestWeek',
  'nutrition.water.streak',
  'nutrition.slots.fullDays',
  'finance.budgets.created',
  'finance.months.underBudget',
  'finance.expense.streak',
  'routine.checkins.total',
  'routine.habit.bestStreak',
  'routine.days.perfect',
  'cross.days.active',
  'cross.days.fourAreas',
  'meta.unlocked.count',
] as const;

export type Metric = (typeof KNOWN_METRICS)[number];

/** Snapshot zerado — ponto de partida para quem monta o real a partir do Dexie. */
export function emptySnapshot(): AchievementSnapshot {
  return {
    training: {
      sessionsTotal: 0,
      setsTotal: 0,
      semanasStreak: 0,
      semanasNoPlano: 0,
      aumentouCarga: false,
      treinouAntesDas7: false,
    },
    nutrition: {
      refeicoesTotal: 0,
      melhorSemanaAderencia: 0,
      streakAgua: 0,
      diasSlotsCompletos: 0,
    },
    finance: { orcamentosCriados: 0, mesesDentroDoOrcamento: 0, streakRegistroGasto: 0 },
    routine: { checkinsTotal: 0, melhorStreakHabito: 0, diasPerfeitos: 0 },
    cross: { diasAtivo: 0, diasQuatroAreas: 0 },
    conquistasDesbloqueadas: 0,
  };
}

const bool = (b: boolean): number => (b ? 1 : 0);

export function metricValue(metrica: string, s: AchievementSnapshot): number {
  switch (metrica) {
    case 'training.sessions.total': return s.training.sessionsTotal;
    case 'training.sets.total': return s.training.setsTotal;
    case 'training.weeks.streak': return s.training.semanasStreak;
    case 'training.weeks.perfect': return s.training.semanasNoPlano;
    case 'training.load.increased': return bool(s.training.aumentouCarga);
    case 'training.earlybird': return bool(s.training.treinouAntesDas7);
    case 'nutrition.meals.total': return s.nutrition.refeicoesTotal;
    case 'nutrition.adherence.bestWeek': return s.nutrition.melhorSemanaAderencia;
    case 'nutrition.water.streak': return s.nutrition.streakAgua;
    case 'nutrition.slots.fullDays': return s.nutrition.diasSlotsCompletos;
    case 'finance.budgets.created': return s.finance.orcamentosCriados;
    case 'finance.months.underBudget': return s.finance.mesesDentroDoOrcamento;
    case 'finance.expense.streak': return s.finance.streakRegistroGasto;
    case 'routine.checkins.total': return s.routine.checkinsTotal;
    case 'routine.habit.bestStreak': return s.routine.melhorStreakHabito;
    case 'routine.days.perfect': return s.routine.diasPerfeitos;
    case 'cross.days.active': return s.cross.diasAtivo;
    case 'cross.days.fourAreas': return s.cross.diasQuatroAreas;
    case 'meta.unlocked.count': return s.conquistasDesbloqueadas;
    default: return 0;
  }
}
