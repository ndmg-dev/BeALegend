import { describe, expect, it } from 'vitest';
import { addDays, currentStreak, daysBetween, longestStreak, toLocalDate } from './day';

const SP = 'America/Sao_Paulo';

describe('toLocalDate', () => {
  it('usa o dia civil do usuário, não o de UTC', () => {
    // 2025-03-10T02:30Z já é dia 10 em UTC, mas ainda é dia 9 em São Paulo.
    expect(toLocalDate(new Date('2025-03-10T02:30:00Z'), SP)).toBe('2025-03-09');
    expect(toLocalDate(new Date('2025-03-10T02:30:00Z'), 'UTC')).toBe('2025-03-10');
  });

  it('atravessa a virada do ano sem escorregar', () => {
    expect(toLocalDate(new Date('2026-01-01T01:00:00Z'), SP)).toBe('2025-12-31');
  });

  it('respeita fusos à frente de UTC', () => {
    expect(toLocalDate(new Date('2025-06-01T22:00:00Z'), 'Asia/Tokyo')).toBe('2025-06-02');
  });
});

describe('daysBetween / addDays', () => {
  it('conta dias civis, imune a horário de verão', () => {
    expect(daysBetween('2025-10-18', '2025-10-19')).toBe(1);
    expect(daysBetween('2025-10-19', '2025-10-18')).toBe(-1);
    expect(daysBetween('2025-01-01', '2025-12-31')).toBe(364);
  });

  it('addDays é o inverso de daysBetween', () => {
    expect(addDays('2025-02-27', 2)).toBe('2025-03-01');
    expect(addDays('2024-02-27', 2)).toBe('2024-02-29');
    expect(addDays('2025-01-01', -1)).toBe('2024-12-31');
  });
});

describe('currentStreak', () => {
  it('conta dias consecutivos terminando hoje', () => {
    expect(currentStreak(['2025-05-01', '2025-05-02', '2025-05-03'], '2025-05-03')).toBe(3);
  });

  it('mantém a sequência viva se o último registro foi ontem', () => {
    expect(currentStreak(['2025-05-01', '2025-05-02'], '2025-05-03')).toBe(2);
  });

  it('zera quando há mais de um dia de buraco', () => {
    expect(currentStreak(['2025-05-01'], '2025-05-03')).toBe(0);
  });

  it('quebra no primeiro buraco, ignorando o histórico anterior', () => {
    expect(
      currentStreak(['2025-04-20', '2025-04-21', '2025-05-02', '2025-05-03'], '2025-05-03'),
    ).toBe(2);
  });

  it('ignora registros duplicados no mesmo dia', () => {
    expect(currentStreak(['2025-05-03', '2025-05-03', '2025-05-02'], '2025-05-03')).toBe(2);
  });

  it('é 0 sem nenhum registro', () => {
    expect(currentStreak([], '2025-05-03')).toBe(0);
  });
});

describe('longestStreak', () => {
  it('acha o recorde no meio da lista, não o do fim', () => {
    expect(
      longestStreak(['2025-01-01', '2025-01-02', '2025-01-03', '2025-01-10', '2025-01-11']),
    ).toBe(3);
  });

  it('ignora ordem e duplicatas', () => {
    expect(longestStreak(['2025-01-03', '2025-01-01', '2025-01-02', '2025-01-02'])).toBe(3);
  });

  it('é 1 quando não há nenhum par consecutivo', () => {
    expect(longestStreak(['2025-01-01', '2025-01-05', '2025-01-20'])).toBe(1);
  });

  it('é 0 sem registros', () => {
    expect(longestStreak([])).toBe(0);
  });
});
