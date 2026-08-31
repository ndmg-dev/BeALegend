import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { budgetsInMonth, ensureFinanceDefaults, transactionsInMonth } from '@/data/db/financeRepo';
import { ensureNutritionDefaults, mealsOnDay, mealSlots, waterOnDay } from '@/data/db/nutritionRepo';
import { checkins, ensureRoutineDefaults, habits, setHabitCompleted } from '@/data/db/routineRepo';
import { diaDeHoje, itensDoDia } from '@/data/db/trainingRepo';
import { sincronizar } from '@/data/sync/engine';
import { formatMoney } from '@/domain/finance/money';
import { isHabitDue, streakForHabit, weekDates } from '@/domain/routine/habits';
import { toLocalDate } from '@/domain/time/day';
import { useSession } from '@/features/auth/useSession';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { DayStrip } from '@/ui/DayStrip';
import { ProgressRing } from '@/ui/ProgressRing';
import { Skeleton } from '@/ui/Skeleton';
import { StreakBadge } from '@/ui/StreakBadge';

export function TodayPage() {
  const user = useSession((state) => state.user);
  const navigate = useNavigate();
  const today = user ? toLocalDate(new Date(), user.timezone) : '';
  const month = today.slice(0, 7);
  const data = useLiveQuery(async () => {
    const trainingDay = user ? await diaDeHoje(user.timezone) : null;
    return {
      trainingDay,
      trainingItems: trainingDay ? await itensDoDia(trainingDay.id) : [],
      slots: await mealSlots(), meals: await mealsOnDay(today), water: await waterOnDay(today),
      transactions: await transactionsInMonth(month), budgets: await budgetsInMonth(month),
      habits: await habits(), checkins: await checkins(),
    };
  }, [month, today, user?.timezone]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void sincronizar().then(async () => {
      if (!cancelled) await Promise.all([
        ensureFinanceDefaults(user.id), ensureNutritionDefaults(user.id), ensureRoutineDefaults(user.id),
      ]);
    });
    return () => { cancelled = true; };
  }, [user]);

  if (!user || !data) return <Skeleton className="mx-auto h-96 max-w-2xl" />;

  const due = data.habits.filter((habit) => isHabitDue(habit.frequencia_rrule, today));
  const todayDone = data.checkins.filter((item) => item.data === today && item.concluido);
  const waterMl = data.water.reduce((sum, item) => sum + item.ml, 0);
  const spentToday = data.transactions.filter((item) => item.data === today && item.tipo === 'despesa')
    .reduce((sum, item) => sum + item.valor_centavos, 0);
  const budgetTotal = data.budgets.reduce((sum, item) => sum + item.limite_centavos, 0);
  const spentMonth = data.transactions.filter((item) => item.tipo === 'despesa')
    .reduce((sum, item) => sum + item.valor_centavos, 0);
  const week = weekDates(today);
  const streak = Math.max(0, ...data.habits.map((habit) => streakForHabit(
    data.checkins.filter((item) => item.habit_id === habit.id && item.concluido).map((item) => item.data), today,
  )));
  const dataFmt = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: user.timezone,
  }).format(new Date());
  // Só a primeira letra maiúscula — `capitalize` do CSS deixaria "Segunda-Feira De Agosto".
  const headingDate = dataFmt.charAt(0).toUpperCase() + dataFmt.slice(1);

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-sp-5">
      <header className="flex items-start justify-between gap-sp-3">
        <div><p className="text-label text-text-muted">{headingDate}</p><h1 className="text-title">Hoje</h1></div>
        <StreakBadge days={streak} />
      </header>

      <DayStrip days={week} today={today} stateFor={(day) => {
        const expected = data.habits.filter((habit) => isHabitDue(habit.frequencia_rrule, day));
        const done = data.checkins.filter((item) => item.data === day && item.concluido && expected.some((habit) => habit.id === item.habit_id));
        if (day > today) return 'future';
        if (expected.length > 0 && done.length === expected.length) return 'completed';
        return done.length > 0 ? 'partial' : 'empty';
      }} />

      <Card className="border-l-[3px] border-l-treino-400">
        <div className="flex items-center justify-between gap-sp-4"><div><p className="text-caption uppercase text-treino-300">Treino</p><h2 className="text-heading">{data.trainingDay?.foco ?? 'Sem treino planejado'}</h2><p className="text-label text-text-muted">{data.trainingDay ? `${data.trainingItems.length} exercícios · ${data.trainingDay.tipo}` : 'Consulte o plano da semana'}</p></div><Button variant="secondary" onClick={() => navigate(data.trainingDay?.tipo === 'forca' ? `/treino/${data.trainingDay.id}` : '/treino')}>{data.trainingDay ? 'Abrir' : 'Ver plano'}</Button></div>
      </Card>

      <Card className="border-l-[3px] border-l-nutricao-400">
        <div className="flex items-center justify-between gap-sp-4"><div><p className="text-caption uppercase text-nutricao-300">Comer</p><h2 className="text-heading">{data.meals.length} de {data.slots.length} refeições</h2><p className="text-label text-text-muted">{waterMl} ml de água hoje</p></div><ProgressRing value={waterMl / 2000} label="água" color="var(--nu-400)" size={76} /></div>
        <Button className="mt-sp-3" variant="secondary" full onClick={() => navigate('/comer')}>Registrar refeição ou água</Button>
      </Card>

      <Card className="border-l-[3px] border-l-financas-400">
        <div className="flex items-center justify-between gap-sp-4"><div><p className="text-caption uppercase text-financas-300">Grana</p><h2 className="text-heading">{formatMoney(spentToday)}</h2><p className="text-label text-text-muted">Gastos hoje · {budgetTotal ? `${Math.round((spentMonth / budgetTotal) * 100)}% dos orçamentos no mês` : 'defina seus orçamentos mensais'}</p></div><Button variant="secondary" onClick={() => navigate('/grana')}>Lançar</Button></div>
      </Card>

      <Card className="border-l-[3px] border-l-rotina-400">
        <div className="mb-sp-3 flex items-baseline justify-between"><div><p className="text-caption uppercase text-rotina-300">Rotina</p><h2 className="text-heading">Hábitos pendentes</h2></div><button className="text-label font-semibold text-rotina-300" onClick={() => navigate('/metas')}>Ver metas</button></div>
        <div className="flex flex-col gap-sp-2">{due.map((habit) => {
          const done = todayDone.some((item) => item.habit_id === habit.id);
          return <label key={habit.id} className="flex min-h-tap cursor-pointer items-center gap-sp-3 border-b border-border-subtle py-sp-2 last:border-0"><input type="checkbox" className="h-6 w-6 accent-rotina-500" checked={done} onChange={(event) => void setHabitCompleted(habit.id, today, event.target.checked, user.id).then(() => sincronizar())} /><span aria-hidden="true">{habit.icone}</span><span className={done ? 'text-text-muted line-through' : 'text-body'}>{habit.nome}</span></label>;
        })}</div>
        <p className="mt-sp-3 text-label text-text-muted">{todayDone.filter((item) => due.some((habit) => habit.id === item.habit_id)).length} de {due.length} concluídos</p>
      </Card>
    </section>
  );
}
