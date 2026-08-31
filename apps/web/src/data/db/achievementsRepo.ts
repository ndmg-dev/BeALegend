import { buildSnapshot } from '@/domain/achievements/aggregate';
import {
  diffUnlocks,
  evaluateAchievements,
  type AchievementStatus,
} from '@/domain/achievements/evaluate';
import type { AchievementSnapshot } from '@/domain/achievements/metrics';
import { toLocalDate } from '@/domain/time/day';
import { uuidv7 } from '@/data/ids';
import { enfileirar } from '@/data/sync/outbox';
import { db, type AchievementUnlock } from './schema';
import { mealSlots } from './nutritionRepo';

/**
 * Detecção de conquistas.
 *
 * O `evaluate` puro (domain/achievements) é a verdade; aqui só se monta o
 * snapshot varrendo o Dexie, compara com os marcadores já gravados e
 * registra os novos. A tabela `achievement_unlock` fixa a data e serve para
 * a comemoração rodar uma vez (a fila do toast é a fase 4).
 */

const AGUA_META_ML = 2000;

/** dia_semana do plan_day → índice getUTCDay (0=domingo). */
const DIA_SEMANA_WEEKDAY: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
};

const vivos = <T extends { deleted_at: string | null }>(xs: readonly T[]): T[] =>
  xs.filter((x) => x.deleted_at === null);

async function montarSnapshot(timezone: string): Promise<AchievementSnapshot> {
  const [sessions, sets, meals, waters, txns, budgets, checkins, habits, slots, planDays] =
    await Promise.all([
      db.session.toArray(),
      db.set_log.toArray(),
      db.meal_log.toArray(),
      db.water_log.toArray(),
      db.finance_transaction.toArray(),
      db.budget.toArray(),
      db.habit_checkin.toArray(),
      db.habit.toArray(),
      mealSlots(),
      db.plan_day.toArray(),
    ]);

  return buildSnapshot({
    hoje: toLocalDate(new Date(), timezone),
    timezone,
    sessoesConcluidas: vivos(sessions)
      .filter((x) => x.status === 'concluida')
      .map((x) => ({ data: x.data })),
    sets: vivos(sets).map((x) => ({
      exercise_id: x.exercise_id,
      carga_kg: x.carga_kg,
      concluido_em: x.concluido_em,
    })),
    refeicoes: vivos(meals).map((x) => ({
      data: x.data,
      aderencia: x.aderencia,
      slot_id: x.slot_id,
    })),
    slotsAtivos: slots.length,
    aguaLogs: vivos(waters).map((x) => ({ data: x.data, ml: x.ml })),
    aguaMetaMl: AGUA_META_ML,
    despesas: vivos(txns)
      .filter((x) => x.tipo === 'despesa')
      .map((x) => ({ data: x.data, categoryId: x.category_id, centavos: x.valor_centavos })),
    orcamentos: vivos(budgets).map((x) => ({
      categoryId: x.category_id,
      mesAno: x.mes_ano,
      limiteCentavos: x.limite_centavos,
    })),
    planDiasTreino: vivos(planDays)
      .filter((d) => d.tipo !== 'descanso')
      .map((d) => DIA_SEMANA_WEEKDAY[d.dia_semana])
      .filter((n): n is number => n !== undefined),
    checkinsConcluidos: vivos(checkins)
      .filter((x) => x.concluido)
      .map((x) => ({ habit_id: x.habit_id, data: x.data })),
    habitosAtivos: vivos(habits)
      .filter((x) => x.ativo)
      .map((x) => ({ id: x.id, frequencia_rrule: x.frequencia_rrule })),
  });
}

async function temHistorico(): Promise<boolean> {
  const [s, m, t, c] = await Promise.all([
    db.session.count(),
    db.meal_log.count(),
    db.finance_transaction.count(),
    db.habit_checkin.count(),
  ]);
  return s + m + t + c > 0;
}

export interface DeteccaoResultado {
  /** Chaves recém-desbloqueadas para comemorar (uma a uma). */
  novos: string[];
  /** Chaves gravadas em silêncio no backfill do primeiro uso. */
  backfill: string[];
}

export async function detectarConquistas(
  userId: string,
  timezone: string,
): Promise<DeteccaoResultado> {
  const marcadores = await db.achievement_unlock.toArray();
  const jaDesbloqueadas = vivos(marcadores).map((x) => x.achievement_key);

  const statuses = evaluateAchievements(await montarSnapshot(timezone));
  const modoBackfill = jaDesbloqueadas.length === 0 && (await temHistorico());
  const { novos, backfill } = diffUnlocks(statuses, jaDesbloqueadas, modoBackfill);

  const paraGravar = [...novos, ...backfill];
  if (paraGravar.length > 0) {
    const agora = new Date().toISOString();
    await db.transaction('rw', db.achievement_unlock, db.outbox, async () => {
      for (const key of paraGravar) {
        const id = uuidv7();
        const linha: AchievementUnlock = {
          id,
          user_id: userId,
          achievement_key: key,
          desbloqueado_em: agora,
          row_version: 0,
          deleted_at: null,
          criado_em: agora,
          updated_at: agora,
        };
        await db.achievement_unlock.add(linha);
        await enfileirar({
          entidade: 'achievement_unlock',
          operacao: 'create',
          registroId: id,
          payload: { achievement_key: key, desbloqueado_em: agora },
          idempotencyKeyFixa: `unlock:${key}`,
        });
      }
    });
  }

  return { novos, backfill };
}

export interface ConquistaComStatus extends AchievementStatus {
  desbloqueado_em: string | null;
}

/** Estado de todas as conquistas para a tela `/conquistas` (fase 5). */
export async function statusDasConquistas(timezone: string): Promise<ConquistaComStatus[]> {
  const [marcadores, snapshot] = await Promise.all([
    db.achievement_unlock.toArray(),
    montarSnapshot(timezone),
  ]);
  const desbloqueadoEm = new Map(
    vivos(marcadores).map((x) => [x.achievement_key, x.desbloqueado_em]),
  );

  return evaluateAchievements(snapshot).map((s) => ({
    ...s,
    // O marcador manda: apagar registros não devolve o troféu.
    unlocked: s.unlocked || desbloqueadoEm.has(s.key),
    desbloqueado_em: desbloqueadoEm.get(s.key) ?? null,
  }));
}
