import { uuidv7 } from '@/data/ids';
import { enfileirar } from '@/data/sync/outbox';
import { weekDates } from '@/domain/routine/habits';
import type { MetricSnapshot } from '@/domain/routine/goals';
import {
  db,
  type Goal,
  type Habit,
  type HabitCheckin,
} from './schema';

function syncFields(userId: string) {
  const now = new Date().toISOString();
  return { user_id: userId, row_version: 0, deleted_at: null, criado_em: now, updated_at: now };
}

export async function habits(): Promise<Habit[]> {
  return (await db.habit.orderBy('nome').toArray()).filter(
    (habit) => habit.ativo && habit.deleted_at === null,
  );
}

export async function checkins(): Promise<HabitCheckin[]> {
  return (await db.habit_checkin.toArray()).filter((item) => item.deleted_at === null);
}

export async function activeGoals(): Promise<Goal[]> {
  return (await db.goal.where('status').equals('ativa').toArray()).filter(
    (goal) => goal.deleted_at === null,
  );
}

export async function createHabit(
  input: Pick<Habit, 'nome' | 'icone' | 'frequencia_rrule' | 'meta_por_semana'>,
  userId: string,
): Promise<Habit> {
  const line: Habit = { id: uuidv7(), ativo: true, ...input, ...syncFields(userId) };
  await db.transaction('rw', db.habit, db.outbox, async () => {
    await db.habit.add(line);
    await enfileirar({
      entidade: 'habit', operacao: 'create', registroId: line.id,
      payload: { ...input, ativo: true },
    });
  });
  return line;
}

export async function createGoal(
  input: Pick<Goal, 'titulo' | 'dominio' | 'tipo' | 'alvo' | 'unidade' | 'prazo' | 'metrica_ref'>,
  userId: string,
): Promise<Goal> {
  const line: Goal = { id: uuidv7(), status: 'ativa', ...input, ...syncFields(userId) };
  await db.transaction('rw', db.goal, db.outbox, async () => {
    await db.goal.add(line);
    await enfileirar({
      entidade: 'goal', operacao: 'create', registroId: line.id,
      payload: { ...input, status: 'ativa' },
    });
  });
  return line;
}

export async function ensureRoutineDefaults(userId: string): Promise<void> {
  if ((await habits()).length === 0) {
    await createHabit({
      nome: 'Ler 20 min', icone: '◇', frequencia_rrule: 'FREQ=DAILY', meta_por_semana: 7,
    }, userId);
    await createHabit({
      nome: 'Planejar amanhã', icone: '✓',
      frequencia_rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', meta_por_semana: 5,
    }, userId);
  }
  if ((await activeGoals()).length === 0) {
    await createGoal({
      titulo: '3 treinos na semana', dominio: 'treino', tipo: 'numerica', alvo: 3,
      unidade: 'sessões', prazo: null, metrica_ref: 'training.sessions.week',
    }, userId);
    await createGoal({
      titulo: 'Beber 2 L de água', dominio: 'nutricao', tipo: 'numerica', alvo: 2000,
      unidade: 'ml', prazo: null, metrica_ref: 'nutrition.water.today',
    }, userId);
    await createGoal({
      titulo: 'Concluir hábitos de hoje', dominio: 'rotina', tipo: 'numerica', alvo: 2,
      unidade: 'hábitos', prazo: null, metrica_ref: 'routine.habits.today',
    }, userId);
  }
}

export async function setHabitCompleted(
  habitId: string,
  day: string,
  completed: boolean,
  userId: string,
): Promise<void> {
  const existing = (await db.habit_checkin.where('habit_id').equals(habitId).toArray())
    .find((item) => item.data === day && item.deleted_at === null);
  if (existing) {
    await db.transaction('rw', db.habit_checkin, db.outbox, async () => {
      await db.habit_checkin.update(existing.id, {
        concluido: completed, updated_at: new Date().toISOString(),
      });
      await enfileirar({
        entidade: 'habit_checkin', operacao: 'update', registroId: existing.id,
        payload: { concluido: completed },
      });
    });
    return;
  }
  const line: HabitCheckin = {
    id: uuidv7(), habit_id: habitId, data: day, concluido: completed, valor: null,
    ...syncFields(userId),
  };
  await db.transaction('rw', db.habit_checkin, db.outbox, async () => {
    await db.habit_checkin.add(line);
    await enfileirar({
      entidade: 'habit_checkin', operacao: 'create', registroId: line.id,
      payload: { habit_id: habitId, data: day, concluido: completed, valor: null },
    });
  });
}

export async function metricSnapshot(today: string): Promise<MetricSnapshot> {
  const week = weekDates(today);
  const sessions = await db.session.where('data').between(week[0] ?? today, week[6] ?? today, true, true).toArray();
  const water = await db.water_log.where('data').equals(today).toArray();
  const todayCheckins = await db.habit_checkin.where('data').equals(today).toArray();
  return {
    trainingSessionsWeek: sessions.filter(
      (session) => session.status === 'concluida' && session.deleted_at === null,
    ).length,
    waterToday: water.filter((item) => item.deleted_at === null).reduce((sum, item) => sum + item.ml, 0),
    habitsToday: todayCheckins.filter(
      (item) => item.concluido && item.deleted_at === null,
    ).length,
  };
}
