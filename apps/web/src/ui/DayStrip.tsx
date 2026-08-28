import type { LocalDate } from '@/domain/time/day';

type DayState = 'completed' | 'partial' | 'empty' | 'future';

export function DayStrip({
  days, today, stateFor,
}: {
  days: LocalDate[];
  today: LocalDate;
  stateFor: (day: LocalDate) => DayState;
}) {
  const labels = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  return (
    <div className="grid grid-cols-7 gap-sp-1" aria-label="Resumo da semana">
      {days.map((day) => {
        const state = stateFor(day);
        const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
        const stateClass = state === 'completed'
          ? 'bg-nutricao-600 text-white'
          : state === 'partial'
            ? 'border border-nutricao-600 bg-nutricao-900 text-nutricao-200'
            : state === 'future'
              ? 'border border-dashed border-border text-text-muted'
              : 'border border-border bg-surface-sunken text-text-muted';
        return (
          <div key={day} className="text-center">
            <span className="text-caption text-text-muted">{labels[weekday]}</span>
            <div className={`mt-sp-1 grid h-10 place-items-center rounded-md text-label ${stateClass} ${day === today ? 'ring-2 ring-treino-400' : ''}`}>
              {state === 'completed' ? '✓' : state === 'partial' ? '◐' : day === today ? day.slice(-2) : '–'}
            </div>
          </div>
        );
      })}
    </div>
  );
}
