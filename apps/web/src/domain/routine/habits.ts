import { addDays, currentStreak, daysBetween, type LocalDate } from '@/domain/time/day';

const RRULE_DAY: Record<number, string> = {
  0: 'SU', 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA',
};

export function isHabitDue(rrule: string, date: LocalDate): boolean {
  if (!rrule.includes('FREQ=')) return true;
  const byDay = rrule.match(/(?:^|;)BYDAY=([^;]+)/)?.[1];
  if (!byDay) return rrule.includes('FREQ=DAILY');
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return byDay.split(',').includes(RRULE_DAY[weekday] ?? '');
}

export function weekDates(today: LocalDate): LocalDate[] {
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const monday = addDays(today, mondayOffset);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

/**
 * Streak de um hábito específico.
 *
 * A regra de "dias consecutivos terminando hoje ou ontem" já existe em
 * `domain/time/day.ts` — é a mesma conta usada em qualquer streak do app
 * (treino, hábito, o que vier depois). Este wrapper só existe para o nome
 * ficar claro no domínio de rotina; a lógica mora um lugar só.
 */
export function streakForHabit(completedDates: readonly LocalDate[], today: LocalDate): number {
  return currentStreak(completedDates, today);
}

export function completedThisWeek(dates: readonly LocalDate[], today: LocalDate): number {
  const week = weekDates(today);
  return new Set(dates.filter((date) => week.includes(date))).size;
}

export function isStreakAtRisk(completedDates: readonly LocalDate[], today: LocalDate): boolean {
  const last = [...new Set(completedDates)].sort().at(-1);
  return last !== undefined && last !== today && daysBetween(last, today) === 1;
}
