import { z } from 'zod';
import type { NutritionInsight } from '@/data/api/nutritionInsights';
import { db } from './schema';

/**
 * Cache local do último insight de nutrição de cada tipo, para a tela mostrar
 * algo offline. Mora na tabela `meta` (uma linha por chave) porque não é dado
 * de sync — só o cliente de API escreve aqui, nunca o outbox.
 */

const KEYS = {
  diario: 'insight_nutricao_diario',
  semanal: 'insight_nutricao_semanal',
} as const;

type Kind = keyof typeof KEYS;

const cachedSchema = z.object({
  tipo: z.enum(['diario', 'semanal']),
  periodo_ref: z.string(),
  texto: z.string(),
  gerado_em: z.string(),
});

export async function saveInsight(kind: Kind, insight: NutritionInsight | null): Promise<void> {
  // 204 (insight sumiu) não apaga o cache: melhor mostrar o último conhecido
  // com o carimbo de data do que deixar a tela vazia numa falha transitória.
  if (insight === null) return;
  await db.meta.put({ chave: KEYS[kind], valor: JSON.stringify(insight) });
}

export async function cachedInsight(kind: Kind): Promise<NutritionInsight | null> {
  const row = await db.meta.get(KEYS[kind]);
  if (!row || typeof row.valor !== 'string') return null;
  try {
    return cachedSchema.parse(JSON.parse(row.valor));
  } catch {
    return null;
  }
}
