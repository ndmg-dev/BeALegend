/**
 * Monta o `AchievementSnapshot` a partir de listas cruas (já filtradas para
 * vivas e do status certo pela camada de dados). Puro — nada de Dexie aqui.
 *
 * Algumas contas são aproximações honestas de troféu, não relatórios: usam o
 * conjunto atual de hábitos/slots contra dias históricos. Marcado onde acontece.
 */

import type { Adherence } from '@/domain/nutrition/adherence';
import { summarizeAdherence } from '@/domain/nutrition/adherence';
import { isHabitDue, weekDates } from '@/domain/routine/habits';
import { addDays, currentStreak, localHour, longestStreak, type LocalDate } from '@/domain/time/day';
import { emptySnapshot, type AchievementSnapshot } from './metrics';

export interface SnapshotInput {
  hoje: LocalDate;
  timezone: string;
  sessoesConcluidas: readonly { data: LocalDate }[];
  sets: readonly { exercise_id: string; carga_kg: number; concluido_em: string }[];
  refeicoes: readonly { data: LocalDate; aderencia: Adherence; slot_id: string | null }[];
  slotsAtivos: number;
  aguaLogs: readonly { data: LocalDate; ml: number }[];
  aguaMetaMl: number;
  despesasDatas: readonly LocalDate[];
  orcamentosAtivos: number;
  checkinsConcluidos: readonly { habit_id: string; data: LocalDate }[];
  habitosAtivos: readonly { id: string; frequencia_rrule: string }[];
}

function agrupar<T, K>(itens: readonly T[], chave: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const item of itens) {
    const k = chave(item);
    const lista = m.get(k);
    if (lista) lista.push(item);
    else m.set(k, [item]);
  }
  return m;
}

function semanaDe(d: LocalDate): LocalDate {
  return weekDates(d)[0] ?? d;
}

/** Semanas seguidas com ao menos um treino, terminando na semana atual ou na anterior. */
export function weeklyTrainingStreak(datasTreino: readonly LocalDate[], hoje: LocalDate): number {
  const semanas = new Set(datasTreino.map(semanaDe));
  if (semanas.size === 0) return 0;

  const atual = semanaDe(hoje);
  let cursor = semanas.has(atual) ? atual : addDays(atual, -7);
  let streak = 0;
  while (semanas.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -7);
  }
  return streak;
}

/** Já levantou mais pesado num set posterior do que no primeiro daquele exercício. */
export function loadIncreased(
  sets: readonly { exercise_id: string; carga_kg: number; concluido_em: string }[],
): boolean {
  for (const lista of agrupar(sets, (s) => s.exercise_id).values()) {
    if (lista.length < 2) continue;
    const ordenados = [...lista].sort((a, b) => a.concluido_em.localeCompare(b.concluido_em));
    const inicial = ordenados[0]?.carga_kg ?? 0;
    if (ordenados.some((s) => s.carga_kg > inicial)) return true;
  }
  return false;
}

/** Melhor aderência semanal já registrada, 0–100. */
export function bestWeekAdherence(
  refeicoes: readonly { data: LocalDate; aderencia: Adherence }[],
): number {
  let melhor = 0;
  for (const lista of agrupar(refeicoes, (r) => semanaDe(r.data)).values()) {
    melhor = Math.max(melhor, summarizeAdherence(lista.map((r) => r.aderencia)).percentual);
  }
  return melhor;
}

/** Dias em que a soma de água bateu a meta. */
export function daysMeetingWaterGoal(
  aguaLogs: readonly { data: LocalDate; ml: number }[],
  metaMl: number,
): LocalDate[] {
  const porDia = new Map<LocalDate, number>();
  for (const w of aguaLogs) porDia.set(w.data, (porDia.get(w.data) ?? 0) + Math.max(0, w.ml));
  return [...porDia.entries()].filter(([, ml]) => ml >= metaMl).map(([d]) => d);
}

/** Maior streak alcançado por qualquer hábito (recorde histórico, não o atual). */
export function bestHabitStreak(
  checkins: readonly { habit_id: string; data: LocalDate }[],
): number {
  let melhor = 0;
  for (const lista of agrupar(checkins, (c) => c.habit_id).values()) {
    melhor = Math.max(melhor, longestStreak(lista.map((c) => c.data)));
  }
  return melhor;
}

/**
 * Dias em que todos os hábitos previstos foram concluídos.
 *
 * Aproximação: casa o conjunto ATUAL de hábitos ativos contra dias passados.
 * Um hábito criado hoje conta como previsto para ontem. Aceitável para troféu.
 */
export function perfectHabitDays(
  habitosAtivos: readonly { id: string; frequencia_rrule: string }[],
  checkins: readonly { habit_id: string; data: LocalDate }[],
): number {
  const feitosPorDia = agrupar(checkins, (c) => c.data);
  let n = 0;
  for (const [dia, feitos] of feitosPorDia) {
    const devidos = habitosAtivos.filter((h) => isHabitDue(h.frequencia_rrule, dia)).map((h) => h.id);
    if (devidos.length === 0) continue;
    const ids = new Set(feitos.map((c) => c.habit_id));
    if (devidos.every((id) => ids.has(id))) n += 1;
  }
  return n;
}

/** Dias em que todos os slots ativos do plano tiveram refeição registrada. */
export function fullSlotDays(
  refeicoes: readonly { data: LocalDate; slot_id: string | null }[],
  slotsAtivos: number,
): number {
  if (slotsAtivos === 0) return 0;
  const porDia = new Map<LocalDate, Set<string>>();
  for (const r of refeicoes) {
    if (!r.slot_id) continue;
    (porDia.get(r.data) ?? porDia.set(r.data, new Set()).get(r.data)!).add(r.slot_id);
  }
  return [...porDia.values()].filter((s) => s.size >= slotsAtivos).length;
}

export function buildSnapshot(i: SnapshotInput): AchievementSnapshot {
  const s = emptySnapshot();
  const datasTreino = i.sessoesConcluidas.map((x) => x.data);

  s.training.sessionsTotal = i.sessoesConcluidas.length;
  s.training.setsTotal = i.sets.length;
  s.training.semanasStreak = weeklyTrainingStreak(datasTreino, i.hoje);
  s.training.semanasNoPlano = 0; // TODO fase futura: casar plan_day x sessão por semana
  s.training.aumentouCarga = loadIncreased(i.sets);
  s.training.treinouAntesDas7 = i.sets.some(
    (x) => localHour(new Date(x.concluido_em), i.timezone) < 7,
  );

  s.nutrition.refeicoesTotal = i.refeicoes.length;
  s.nutrition.melhorSemanaAderencia = bestWeekAdherence(i.refeicoes);
  s.nutrition.streakAgua = currentStreak(
    daysMeetingWaterGoal(i.aguaLogs, i.aguaMetaMl),
    i.hoje,
  );
  s.nutrition.diasSlotsCompletos = fullSlotDays(i.refeicoes, i.slotsAtivos);

  s.finance.orcamentosCriados = i.orcamentosAtivos;
  s.finance.mesesDentroDoOrcamento = 0; // TODO fase futura: gasto por mês x limite por categoria
  s.finance.streakRegistroGasto = currentStreak([...new Set(i.despesasDatas)], i.hoje);

  s.routine.checkinsTotal = i.checkinsConcluidos.length;
  s.routine.melhorStreakHabito = bestHabitStreak(i.checkinsConcluidos);
  s.routine.diasPerfeitos = perfectHabitDays(i.habitosAtivos, i.checkinsConcluidos);

  const diasTreino = new Set(datasTreino);
  const diasRefeicao = new Set(i.refeicoes.map((x) => x.data));
  const diasGasto = new Set(i.despesasDatas);
  const diasHabito = new Set(i.checkinsConcluidos.map((x) => x.data));
  const diasAgua = new Set(i.aguaLogs.map((x) => x.data));
  s.cross.diasAtivo = new Set([
    ...diasTreino,
    ...diasRefeicao,
    ...diasGasto,
    ...diasHabito,
    ...diasAgua,
  ]).size;
  s.cross.diasQuatroAreas = [...diasTreino].filter(
    (d) => diasRefeicao.has(d) && diasGasto.has(d) && diasHabito.has(d),
  ).length;

  return s;
}
