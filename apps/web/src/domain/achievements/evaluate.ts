/**
 * Estado das conquistas a partir de um snapshot de agregados. Puro: é a
 * verdade do sistema — a tabela `achievement_unlock` só marca data e
 * comemoração (ver docs/achievements.md).
 */

import { CATALOG, type Achievement } from './catalog';
import { metricValue, type AchievementSnapshot } from './metrics';

export interface AchievementStatus {
  key: string;
  unlocked: boolean;
  progress: {
    atual: number;
    alvo: number;
    /** atual / alvo, limitado a [0, 1]. */
    fracao: number;
  };
}

function isMeta(a: Achievement): boolean {
  return a.metrica.startsWith('meta.');
}

export function evaluateAchievements(
  snapshot: AchievementSnapshot,
  catalog: readonly Achievement[] = CATALOG,
): AchievementStatus[] {
  // As métricas `meta.*` dependem de quantas conquistas comuns estão
  // desbloqueadas — recalculado aqui, não confiando no que veio no snapshot,
  // para a platina desbloquear na mesma avaliação que fecha a última de ouro.
  const desbloqueadasComuns = catalog.reduce(
    (n, a) => n + (!isMeta(a) && metricValue(a.metrica, snapshot) >= a.alvo ? 1 : 0),
    0,
  );
  const efetivo: AchievementSnapshot = {
    ...snapshot,
    conquistasDesbloqueadas: desbloqueadasComuns,
  };

  return catalog.map((a) => {
    const atual = metricValue(a.metrica, isMeta(a) ? efetivo : snapshot);
    const fracao = a.alvo > 0 ? Math.min(1, Math.max(0, atual / a.alvo)) : 0;
    return { key: a.key, unlocked: atual >= a.alvo, progress: { atual, alvo: a.alvo, fracao } };
  });
}

export interface UnlockDiff {
  /** Recém-satisfeitas, para comemorar uma a uma. */
  novos: string[];
  /** Recém-satisfeitas em modo backfill — gravar sem comemorar. */
  backfill: string[];
}

/**
 * O que gravar depois de uma avaliação.
 *
 * `modoBackfill` é decidido pela camada de dados: primeira detecção de sempre
 * (nenhuma linha de unlock) num usuário que já tem histórico. Aí tudo que já
 * está satisfeito entra silencioso; caso contrário, comemora.
 */
export function diffUnlocks(
  statuses: readonly AchievementStatus[],
  jaDesbloqueadas: readonly string[],
  modoBackfill: boolean,
): UnlockDiff {
  const conhecidas = new Set(jaDesbloqueadas);
  const recem = statuses.filter((s) => s.unlocked && !conhecidas.has(s.key)).map((s) => s.key);
  return modoBackfill ? { novos: [], backfill: recem } : { novos: recem, backfill: [] };
}
