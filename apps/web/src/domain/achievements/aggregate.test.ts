import { describe, expect, it } from 'vitest';
import {
  bestHabitStreak,
  bestWeekAdherence,
  buildSnapshot,
  daysMeetingWaterGoal,
  fullSlotDays,
  loadIncreased,
  monthsUnderBudget,
  perfectHabitDays,
  perfectPlanWeeks,
  weeklyTrainingStreak,
  type SnapshotInput,
} from './aggregate';

describe('weeklyTrainingStreak', () => {
  // 2026-08-31 é segunda; 08-24 e 08-17 são as segundas anteriores.
  it('conta semanas seguidas terminando na atual', () => {
    expect(
      weeklyTrainingStreak(['2026-08-31', '2026-08-26', '2026-08-19'], '2026-08-31'),
    ).toBe(3);
  });

  it('vale a semana anterior quando a atual ainda não teve treino', () => {
    expect(weeklyTrainingStreak(['2026-08-27', '2026-08-20'], '2026-08-31')).toBe(2);
  });

  it('zera com um buraco de semana', () => {
    expect(weeklyTrainingStreak(['2026-08-31', '2026-08-12'], '2026-08-31')).toBe(1);
  });

  it('é 0 sem treinos', () => {
    expect(weeklyTrainingStreak([], '2026-08-31')).toBe(0);
  });
});

describe('loadIncreased', () => {
  const set = (exercise_id: string, carga_kg: number, concluido_em: string) => ({
    exercise_id,
    carga_kg,
    concluido_em,
  });

  it('detecta carga maior num set posterior', () => {
    expect(
      loadIncreased([set('a', 40, '2026-01-01'), set('a', 42.5, '2026-01-08')]),
    ).toBe(true);
  });

  it('ignora aumento entre exercícios diferentes', () => {
    expect(loadIncreased([set('a', 40, '2026-01-01'), set('b', 80, '2026-01-08')])).toBe(false);
  });

  it('é falso se a carga nunca sobe', () => {
    expect(
      loadIncreased([set('a', 40, '2026-01-01'), set('a', 40, '2026-01-08'), set('a', 35, '2026-01-15')]),
    ).toBe(false);
  });
});

describe('bestWeekAdherence', () => {
  it('pega a melhor semana, não a média', () => {
    const r = (data: string, aderencia: 'dentro' | 'parcial' | 'fora') => ({ data, aderencia });
    const refeicoes = [
      r('2026-08-31', 'dentro'),
      r('2026-09-01', 'dentro'), // semana boa
      r('2026-08-24', 'fora'),
      r('2026-08-25', 'fora'), // semana ruim
    ];
    expect(bestWeekAdherence(refeicoes)).toBe(100);
  });
});

describe('daysMeetingWaterGoal', () => {
  it('soma o dia inteiro antes de comparar com a meta', () => {
    const logs = [
      { data: '2026-01-01', ml: 1200 },
      { data: '2026-01-01', ml: 900 },
      { data: '2026-01-02', ml: 500 },
    ];
    expect(daysMeetingWaterGoal(logs, 2000).sort()).toEqual(['2026-01-01']);
  });
});

describe('bestHabitStreak', () => {
  it('é o recorde entre os hábitos', () => {
    const checkins = [
      { habit_id: 'x', data: '2026-01-01' },
      { habit_id: 'x', data: '2026-01-02' },
      { habit_id: 'y', data: '2026-02-01' },
      { habit_id: 'y', data: '2026-02-02' },
      { habit_id: 'y', data: '2026-02-03' },
    ];
    expect(bestHabitStreak(checkins)).toBe(3);
  });
});

describe('perfectHabitDays', () => {
  const habitos = [
    { id: 'h1', frequencia_rrule: 'FREQ=DAILY' },
    { id: 'h2', frequencia_rrule: 'FREQ=DAILY' },
  ];

  it('conta o dia só quando todos os previstos foram feitos', () => {
    const checkins = [
      { habit_id: 'h1', data: '2026-01-01' },
      { habit_id: 'h2', data: '2026-01-01' },
      { habit_id: 'h1', data: '2026-01-02' }, // faltou h2
    ];
    expect(perfectHabitDays(habitos, checkins)).toBe(1);
  });
});

describe('fullSlotDays', () => {
  it('conta o dia com todos os slots, ignora refeição sem slot', () => {
    const refeicoes = [
      { data: '2026-01-01', slot_id: 's1' },
      { data: '2026-01-01', slot_id: 's2' },
      { data: '2026-01-02', slot_id: 's1' },
      { data: '2026-01-02', slot_id: null },
    ];
    expect(fullSlotDays(refeicoes, 2)).toBe(1);
  });

  it('é 0 quando não há slots ativos', () => {
    expect(fullSlotDays([{ data: '2026-01-01', slot_id: 's1' }], 0)).toBe(0);
  });
});

describe('monthsUnderBudget', () => {
  const orcamentos = [
    { categoryId: 'mercado', mesAno: '2026-07', limiteCentavos: 100_000 },
    { categoryId: 'lazer', mesAno: '2026-07', limiteCentavos: 20_000 },
  ];

  it('conta o mês só quando todas as categorias ficaram no limite', () => {
    const despesas = [
      { data: '2026-07-05', categoryId: 'mercado', centavos: 90_000 },
      { data: '2026-07-10', categoryId: 'lazer', centavos: 15_000 },
    ];
    expect(monthsUnderBudget(orcamentos, despesas, '2026-08')).toBe(1);
  });

  it('estourar uma categoria derruba o mês', () => {
    const despesas = [{ data: '2026-07-10', categoryId: 'lazer', centavos: 25_000 }];
    expect(monthsUnderBudget(orcamentos, despesas, '2026-08')).toBe(0);
  });

  it('ignora o mês corrente e os futuros', () => {
    expect(monthsUnderBudget(orcamentos, [], '2026-07')).toBe(0);
  });
});

describe('perfectPlanWeeks', () => {
  // 2026-08-31 = segunda (semana atual). Semana de 08-24 é a anterior.
  const diasTreino = [1, 3, 5]; // seg, qua, sex

  it('conta a semana anterior com todos os dias de treino cobertos', () => {
    const datas = ['2026-08-24', '2026-08-26', '2026-08-28']; // seg/qua/sex
    expect(perfectPlanWeeks(datas, diasTreino, '2026-08-31')).toBe(1);
  });

  it('falta um dia = semana não conta', () => {
    expect(perfectPlanWeeks(['2026-08-24', '2026-08-26'], diasTreino, '2026-08-31')).toBe(0);
  });

  it('a semana atual não conta (ainda não encerrou)', () => {
    const datas = ['2026-08-31']; // seg da semana atual
    expect(perfectPlanWeeks(datas, [1], '2026-08-31')).toBe(0);
  });

  it('é 0 se o plano não tem dia de treino', () => {
    expect(perfectPlanWeeks(['2026-08-24'], [], '2026-08-31')).toBe(0);
  });
});

describe('buildSnapshot', () => {
  const base: SnapshotInput = {
    hoje: '2026-08-31',
    timezone: 'America/Sao_Paulo',
    sessoesConcluidas: [],
    sets: [],
    refeicoes: [],
    slotsAtivos: 0,
    aguaLogs: [],
    aguaMetaMl: 2000,
    despesas: [],
    orcamentos: [],
    planDiasTreino: [],
    checkinsConcluidos: [],
    habitosAtivos: [],
  };

  it('entrada vazia dá tudo zerado', () => {
    const s = buildSnapshot(base);
    expect(s.training.sessionsTotal).toBe(0);
    expect(s.cross.diasAtivo).toBe(0);
    expect(s.training.aumentouCarga).toBe(false);
  });

  it('dias ativos é a união das datas; quatro áreas é a interseção', () => {
    const s = buildSnapshot({
      ...base,
      sessoesConcluidas: [{ data: '2026-08-30' }, { data: '2026-08-31' }],
      refeicoes: [{ data: '2026-08-30', aderencia: 'dentro', slot_id: null }],
      despesas: [{ data: '2026-08-30', categoryId: null, centavos: 100 }],
      checkinsConcluidos: [{ habit_id: 'h', data: '2026-08-30' }],
      aguaLogs: [{ data: '2026-08-29', ml: 100 }],
    });
    expect(s.cross.diasAtivo).toBe(3); // 29, 30, 31
    expect(s.cross.diasQuatroAreas).toBe(1); // só 30
  });

  it('marca madrugador por hora local do set', () => {
    // 09:30Z = 06:30 em São Paulo (UTC-3)
    const s = buildSnapshot({
      ...base,
      sets: [{ exercise_id: 'a', carga_kg: 20, concluido_em: '2026-08-31T09:30:00Z' }],
    });
    expect(s.training.treinouAntesDas7).toBe(true);
  });
});
