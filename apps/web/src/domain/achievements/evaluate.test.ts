import { describe, expect, it } from 'vitest';
import type { Achievement } from './catalog';
import { CATALOG } from './catalog';
import { diffUnlocks, evaluateAchievements, type AchievementStatus } from './evaluate';
import { emptySnapshot } from './metrics';

const A = (over: Partial<Achievement>): Achievement => ({
  key: 'x',
  titulo: 't',
  descricao: 'd',
  tier: 'bronze',
  metrica: 'training.sessions.total',
  alvo: 1,
  icone: 'i',
  ...over,
});

const status = (key: string, unlocked: boolean): AchievementStatus => ({
  key,
  unlocked,
  progress: { atual: unlocked ? 1 : 0, alvo: 1, fracao: unlocked ? 1 : 0 },
});

describe('evaluateAchievements', () => {
  it('desbloqueia no limiar, não antes', () => {
    const cat = [A({ key: 'k', alvo: 10 })];
    const s = emptySnapshot();

    s.training.sessionsTotal = 9;
    expect(evaluateAchievements(s, cat)[0]).toMatchObject({ unlocked: false });

    s.training.sessionsTotal = 10;
    expect(evaluateAchievements(s, cat)[0]).toMatchObject({ unlocked: true });
  });

  it('reporta progresso fracionário limitado a 1', () => {
    const cat = [A({ key: 'k', alvo: 4 })];
    const s = emptySnapshot();

    s.training.sessionsTotal = 1;
    expect(evaluateAchievements(s, cat)[0]?.progress).toEqual({ atual: 1, alvo: 4, fracao: 0.25 });

    s.training.sessionsTotal = 99;
    expect(evaluateAchievements(s, cat)[0]?.progress.fracao).toBe(1);
  });

  it('preserva a ordem do catálogo', () => {
    const cat = [A({ key: 'a' }), A({ key: 'b' }), A({ key: 'c' })];
    expect(evaluateAchievements(emptySnapshot(), cat).map((s) => s.key)).toEqual(['a', 'b', 'c']);
  });

  it('a platina fecha na mesma avaliação que a última conquista comum', () => {
    const cat: Achievement[] = [
      A({ key: 'comum1', metrica: 'training.sessions.total', alvo: 1 }),
      A({ key: 'comum2', metrica: 'nutrition.meals.total', alvo: 1 }),
      A({ key: 'plat', tier: 'platina', metrica: 'meta.unlocked.count', alvo: 2 }),
    ];
    const s = emptySnapshot();
    s.training.sessionsTotal = 1;
    s.nutrition.refeicoesTotal = 1;
    // conquistasDesbloqueadas no snapshot é 0, mas o evaluate recalcula.
    const byKey = Object.fromEntries(evaluateAchievements(s, cat).map((x) => [x.key, x.unlocked]));
    expect(byKey).toEqual({ comum1: true, comum2: true, plat: true });
  });

  it('roda o catálogo real sem quebrar', () => {
    const all = evaluateAchievements(emptySnapshot());
    expect(all).toHaveLength(CATALOG.length);
    expect(all.every((s) => !s.unlocked)).toBe(true);
  });
});

describe('diffUnlocks', () => {
  const statuses = [status('a', true), status('b', true), status('c', false)];

  it('modo normal: só o que virou verdadeiro e ainda não estava marcado', () => {
    expect(diffUnlocks(statuses, ['a'], false)).toEqual({ novos: ['b'], backfill: [] });
  });

  it('modo backfill: manda tudo para gravação silenciosa', () => {
    expect(diffUnlocks(statuses, [], true)).toEqual({ novos: [], backfill: ['a', 'b'] });
  });

  it('nada novo quando tudo já está marcado', () => {
    expect(diffUnlocks(statuses, ['a', 'b'], false)).toEqual({ novos: [], backfill: [] });
  });
});
