import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  activeGoals,
  checkins,
  createHabit,
  ensureRoutineDefaults,
  habits,
  metricSnapshot,
  setHabitCompleted,
} from '@/data/db/routineRepo';
import { sincronizar } from '@/data/sync/engine';
import {
  completedThisWeek,
  isHabitDue,
  isStreakAtRisk,
  streakForHabit,
  weekDates,
} from '@/domain/routine/habits';
import { goalCurrentValue, goalProgress } from '@/domain/routine/goals';
import { toLocalDate } from '@/domain/time/day';
import { useSession } from '@/features/auth/useSession';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { DayStrip } from '@/ui/DayStrip';
import { EmptyState } from '@/ui/EmptyState';
import { ProgressRing } from '@/ui/ProgressRing';
import { StreakBadge } from '@/ui/StreakBadge';
import { TextField } from '@/ui/TextField';

const DOMAIN_COLOR: Record<string, string> = {
  treino: 'var(--tr-400)', nutricao: 'var(--nu-400)', financas: 'var(--fi-400)', rotina: 'var(--ro-400)',
};

export function GoalsPage() {
  const user = useSession((state) => state.user);
  const today = user ? toLocalDate(new Date(), user.timezone) : '';
  const [name, setName] = useState('');
  const [weekdaysOnly, setWeekdaysOnly] = useState(false);
  const data = useLiveQuery(async () => ({
    habits: await habits(), checkins: await checkins(), goals: await activeGoals(),
    snapshot: await metricSnapshot(today),
  }), [today]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void sincronizar().then(async () => {
      if (!cancelled) await ensureRoutineDefaults(user.id);
    });
    return () => { cancelled = true; };
  }, [user]);

  const due = useMemo(
    () => (data?.habits ?? []).filter((habit) => isHabitDue(habit.frequencia_rrule, today)),
    [data?.habits, today],
  );
  const week = weekDates(today);

  if (!user || !data) return <div role="status" className="text-text-muted">Carregando metas…</div>;

  async function addHabit() {
    if (!user || !name.trim()) return;
    await createHabit({
      nome: name.trim(), icone: '◇',
      frequencia_rrule: weekdaysOnly ? 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' : 'FREQ=DAILY',
      meta_por_semana: weekdaysOnly ? 5 : 7,
    }, user.id);
    setName('');
    void sincronizar();
  }

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-sp-5">
      <header className="flex items-center justify-between gap-sp-3">
        <div><h1 className="text-title">Metas</h1><p className="text-label text-text-muted">Progresso vindo do que você registra</p></div>
        <StreakBadge days={Math.max(0, ...data.habits.map((habit) => streakForHabit(
          data.checkins.filter((item) => item.habit_id === habit.id && item.concluido).map((item) => item.data), today,
        )))} />
      </header>

      <DayStrip days={week} today={today} stateFor={(day) => {
        const expected = data.habits.filter((habit) => isHabitDue(habit.frequencia_rrule, day));
        const done = data.checkins.filter((item) => item.data === day && item.concluido && expected.some((habit) => habit.id === item.habit_id));
        if (day > today) return 'future';
        if (expected.length > 0 && done.length === expected.length) return 'completed';
        return done.length > 0 ? 'partial' : 'empty';
      }} />

      <Card className="border-l-[3px] border-l-rotina-400">
        <h2 className="mb-sp-3 text-heading">Hábitos de hoje</h2>
        {due.length ? <div className="flex flex-col gap-sp-2">{due.map((habit) => {
          const history = data.checkins.filter((item) => item.habit_id === habit.id && item.concluido).map((item) => item.data);
          const done = data.checkins.some((item) => item.habit_id === habit.id && item.data === today && item.concluido);
          return <label key={habit.id} className="flex min-h-tap cursor-pointer items-center gap-sp-3 border-b border-border-subtle py-sp-2 last:border-0">
            <input type="checkbox" className="h-6 w-6 accent-rotina-500" checked={done} onChange={(event) => void setHabitCompleted(habit.id, today, event.target.checked, user.id).then(() => sincronizar())} />
            <span aria-hidden="true">{habit.icone}</span>
            <span className="min-w-0 flex-1"><strong className="block text-body">{habit.nome}</strong><small className="text-caption text-text-muted">{completedThisWeek(history, today)}/{habit.meta_por_semana} nesta semana</small></span>
            <StreakBadge days={streakForHabit(history, today)} atRisk={isStreakAtRisk(history, today)} />
          </label>;
        })}</div> : <EmptyState title="Tudo em dia">Nenhum hábito previsto para hoje.</EmptyState>}
      </Card>

      <div>
        <h2 className="mb-sp-3 text-heading">Progresso atual</h2>
        <div className="grid gap-sp-3 sm:grid-cols-2">{data.goals.map((goal) => {
          const current = goalCurrentValue(goal, data.snapshot);
          return <Card key={goal.id} className="flex items-center gap-sp-4">
            <ProgressRing value={goalProgress(goal, data.snapshot)} label={goal.dominio} color={DOMAIN_COLOR[goal.dominio] ?? 'var(--ro-400)'} size={88} />
            <div className="min-w-0"><h3 className="text-body font-semibold">{goal.titulo}</h3><p className="text-label text-text-muted">{current} de {goal.alvo} {goal.unidade ?? ''}</p></div>
          </Card>;
        })}</div>
      </div>

      <Card>
        <h2 className="mb-sp-3 text-heading">Novo hábito</h2>
        <div className="flex flex-col gap-sp-3">
          <TextField label="Nome do hábito" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
          <label className="flex min-h-tap items-center gap-sp-3 text-label"><input type="checkbox" checked={weekdaysOnly} onChange={(event) => setWeekdaysOnly(event.target.checked)} /> Apenas dias úteis</label>
          <Button disabled={!name.trim()} onClick={() => void addHabit()}>Adicionar hábito</Button>
        </div>
      </Card>
    </section>
  );
}
