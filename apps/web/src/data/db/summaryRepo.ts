import { addDays } from '@/domain/time/day';
import { isHabitDue, weekDates } from '@/domain/routine/habits';
import { summarizeWeek, type WeeklySummary } from '@/domain/summary/weekly';
import { db } from './schema';

export async function weeklySummary(today: string): Promise<WeeklySummary> {
  const week = weekDates(today);
  const start = week[0] ?? today;
  const end = week[6] ?? addDays(start, 6);
  const [sessions, meals, transactions, habits, checkins] = await Promise.all([
    db.session.where('data').between(start, end, true, true).toArray(),
    db.meal_log.where('data').between(start, end, true, true).toArray(),
    db.finance_transaction.where('data').between(start, end, true, true).toArray(),
    db.habit.toArray(),
    db.habit_checkin.where('data').between(start, end, true, true).toArray(),
  ]);
  const activeHabits = habits.filter((habit) => habit.ativo && habit.deleted_at === null);
  const expected = new Set(
    week.flatMap((day) => activeHabits
      .filter((habit) => isHabitDue(habit.frequencia_rrule, day))
      .map((habit) => `${habit.id}:${day}`)),
  );
  const completed = new Set(checkins
    .filter((item) => item.concluido && item.deleted_at === null && expected.has(`${item.habit_id}:${item.data}`))
    .map((item) => `${item.habit_id}:${item.data}`));
  return summarizeWeek({
    completedTrainingDates: sessions
      .filter((item) => item.status === 'concluida' && item.deleted_at === null)
      .map((item) => item.data),
    mealAdherence: meals.filter((item) => item.deleted_at === null).map((item) => item.aderencia),
    expenseCents: transactions
      .filter((item) => item.tipo === 'despesa' && item.deleted_at === null)
      .map((item) => item.valor_centavos),
    completedHabits: completed.size,
    expectedHabits: expected.size,
  });
}
