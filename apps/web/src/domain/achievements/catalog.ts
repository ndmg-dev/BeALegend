/**
 * Catálogo de conquistas — dado puro, versionado no código (igual ao catálogo
 * de exercícios). A `key` é a chave estável do desbloqueio: **append-only**,
 * nunca renomeie nem remova (órfã as linhas de `achievement_unlock`).
 *
 * Este é o conjunto inicial. A lista completa (~30-40, com ícones) entra na
 * fase 6 — ver docs/achievements.md.
 */

import type { Metric } from './metrics';

export type Tier = 'bronze' | 'prata' | 'ouro' | 'platina';

export interface Achievement {
  key: string;
  titulo: string;
  descricao: string;
  tier: Tier;
  metrica: Metric;
  /** Limiar: desbloqueia quando o valor da métrica alcança este número. > 0. */
  alvo: number;
  /** Nome no sprite de ícones. */
  icone: string;
  /** Fica oculta (silhueta + "???") até desbloquear. */
  secreta?: boolean;
}

const BASE: readonly Achievement[] = [
  // ── Treino ──────────────────────────────────────────────────────────────
  { key: 'treino.primeiro', titulo: 'Começou', descricao: 'Conclua seu primeiro treino.', tier: 'bronze', metrica: 'training.sessions.total', alvo: 1, icone: 'dumbbell' },
  { key: 'treino.dez', titulo: 'Pegando o ritmo', descricao: 'Conclua 10 treinos.', tier: 'bronze', metrica: 'training.sessions.total', alvo: 10, icone: 'dumbbell' },
  { key: 'treino.cinquenta', titulo: 'Constância', descricao: 'Conclua 50 treinos.', tier: 'prata', metrica: 'training.sessions.total', alvo: 50, icone: 'dumbbell' },
  { key: 'treino.cem', titulo: 'Veterano', descricao: 'Conclua 100 treinos.', tier: 'ouro', metrica: 'training.sessions.total', alvo: 100, icone: 'dumbbell' },
  { key: 'treino.streak4', titulo: 'Mês fechado', descricao: 'Treine ao menos uma vez por 4 semanas seguidas.', tier: 'prata', metrica: 'training.weeks.streak', alvo: 4, icone: 'flame' },
  { key: 'treino.plano12', titulo: 'Fiel ao plano', descricao: 'Cumpra o plano inteiro da semana 12 vezes.', tier: 'ouro', metrica: 'training.weeks.perfect', alvo: 12, icone: 'calendar-check' },
  { key: 'treino.progressao', titulo: 'Mais peso', descricao: 'Aumente a carga de um exercício entre duas sessões.', tier: 'ouro', metrica: 'training.load.increased', alvo: 1, icone: 'trending-up' },
  { key: 'treino.madrugador', titulo: 'Madrugador', descricao: 'Comece um treino antes das 7h.', tier: 'prata', metrica: 'training.earlybird', alvo: 1, icone: 'sunrise', secreta: true },
  { key: 'treino.series500', titulo: 'Mil repetições depois', descricao: 'Registre 500 séries.', tier: 'ouro', metrica: 'training.sets.total', alvo: 500, icone: 'list-checks' },

  // ── Nutrição ────────────────────────────────────────────────────────────
  { key: 'comer.primeira', titulo: 'Anotado', descricao: 'Registre sua primeira refeição.', tier: 'bronze', metrica: 'nutrition.meals.total', alvo: 1, icone: 'utensils' },
  { key: 'comer.vintecinco', titulo: 'Virou hábito', descricao: 'Registre 25 refeições.', tier: 'bronze', metrica: 'nutrition.meals.total', alvo: 25, icone: 'utensils' },
  { key: 'comer.cem', titulo: 'Disciplina à mesa', descricao: 'Registre 100 refeições.', tier: 'ouro', metrica: 'nutrition.meals.total', alvo: 100, icone: 'utensils' },
  { key: 'comer.semana90', titulo: 'Quase perfeito', descricao: 'Feche uma semana com 90% de aderência ou mais.', tier: 'prata', metrica: 'nutrition.adherence.bestWeek', alvo: 90, icone: 'target' },
  { key: 'comer.agua7', titulo: 'Hidratado', descricao: 'Bata a meta de água 7 dias seguidos.', tier: 'prata', metrica: 'nutrition.water.streak', alvo: 7, icone: 'droplet' },
  { key: 'comer.agua30', titulo: 'Fonte', descricao: 'Bata a meta de água 30 dias seguidos.', tier: 'ouro', metrica: 'nutrition.water.streak', alvo: 30, icone: 'droplet' },
  { key: 'comer.diacompleto', titulo: 'Dia redondo', descricao: 'Registre todas as refeições do plano num dia, 10 vezes.', tier: 'prata', metrica: 'nutrition.slots.fullDays', alvo: 10, icone: 'clipboard-check' },

  // ── Grana ───────────────────────────────────────────────────────────────
  { key: 'grana.primeiroorcamento', titulo: 'Plano de voo', descricao: 'Crie seu primeiro orçamento.', tier: 'bronze', metrica: 'finance.budgets.created', alvo: 1, icone: 'wallet' },
  { key: 'grana.mesnoazul', titulo: 'No azul', descricao: 'Feche um mês inteiro dentro do orçamento.', tier: 'prata', metrica: 'finance.months.underBudget', alvo: 1, icone: 'piggy-bank' },
  { key: 'grana.trimestre', titulo: 'Sob controle', descricao: 'Feche 3 meses dentro do orçamento.', tier: 'ouro', metrica: 'finance.months.underBudget', alvo: 3, icone: 'piggy-bank' },
  { key: 'grana.registro30', titulo: 'Olho no bolso', descricao: 'Registre um gasto por 30 dias seguidos.', tier: 'prata', metrica: 'finance.expense.streak', alvo: 30, icone: 'receipt' },

  // ── Rotina ──────────────────────────────────────────────────────────────
  { key: 'rotina.habito7', titulo: 'Semente', descricao: 'Mantenha um hábito por 7 dias seguidos.', tier: 'bronze', metrica: 'routine.habit.bestStreak', alvo: 7, icone: 'sprout' },
  { key: 'rotina.habito30', titulo: 'Raiz', descricao: 'Mantenha um hábito por 30 dias seguidos.', tier: 'prata', metrica: 'routine.habit.bestStreak', alvo: 30, icone: 'sprout' },
  { key: 'rotina.habito100', titulo: 'Árvore', descricao: 'Mantenha um hábito por 100 dias seguidos.', tier: 'ouro', metrica: 'routine.habit.bestStreak', alvo: 100, icone: 'trees' },
  { key: 'rotina.diaperfeito', titulo: 'Dia impecável', descricao: 'Conclua todos os hábitos previstos num dia.', tier: 'prata', metrica: 'routine.days.perfect', alvo: 1, icone: 'check-circle' },
  { key: 'rotina.checkins500', titulo: 'Quinhentas vezes', descricao: 'Faça 500 check-ins de hábito.', tier: 'ouro', metrica: 'routine.checkins.total', alvo: 500, icone: 'check-circle' },

  // ── Transversais ────────────────────────────────────────────────────────
  { key: 'geral.semana', titulo: 'Uma semana', descricao: 'Use o app em 7 dias distintos.', tier: 'bronze', metrica: 'cross.days.active', alvo: 7, icone: 'star' },
  { key: 'geral.mes', titulo: 'Um mês', descricao: 'Use o app em 30 dias distintos.', tier: 'prata', metrica: 'cross.days.active', alvo: 30, icone: 'star' },
  { key: 'geral.trimestre', titulo: 'Um trimestre', descricao: 'Use o app em 90 dias distintos.', tier: 'ouro', metrica: 'cross.days.active', alvo: 90, icone: 'star' },
  { key: 'geral.quatroareas', titulo: 'Dia cheio', descricao: 'Registre treino, refeição, gasto e hábito no mesmo dia.', tier: 'prata', metrica: 'cross.days.fourAreas', alvo: 1, icone: 'layout-grid' },
];

const PLATINA: Achievement = {
  key: 'platina.lenda',
  titulo: 'Lenda',
  descricao: 'Desbloqueie todas as outras conquistas.',
  tier: 'platina',
  metrica: 'meta.unlocked.count',
  alvo: BASE.length,
  icone: 'trophy',
};

export const CATALOG: readonly Achievement[] = [...BASE, PLATINA];

export function findAchievement(key: string): Achievement | undefined {
  return CATALOG.find((a) => a.key === key);
}
