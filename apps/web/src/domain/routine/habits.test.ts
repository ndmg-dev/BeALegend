import { describe, expect, it } from 'vitest';
import { completedThisWeek, isHabitDue, isStreakAtRisk, streakForHabit, weekDates } from './habits';

describe('habits', () => {
  it('interpreta hábito diário e BYDAY', () => {
    expect(isHabitDue('FREQ=DAILY', '2026-08-28')).toBe(true);
    expect(isHabitDue('FREQ=WEEKLY;BYDAY=MO,WE,FR', '2026-08-28')).toBe(true);
    expect(isHabitDue('FREQ=WEEKLY;BYDAY=TU,TH', '2026-08-28')).toBe(false);
  });

  it('monta semana civil de segunda a domingo', () => {
    expect(weekDates('2026-08-28')).toEqual([
      '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27',
      '2026-08-28', '2026-08-29', '2026-08-30',
    ]);
  });

  it('calcula streak, progresso semanal e risco', () => {
    const dates = ['2026-08-25', '2026-08-26', '2026-08-27'];
    expect(streakForHabit(dates, '2026-08-28')).toBe(3);
    expect(completedThisWeek(dates, '2026-08-28')).toBe(3);
    expect(isStreakAtRisk(dates, '2026-08-28')).toBe(true);
  });
});
