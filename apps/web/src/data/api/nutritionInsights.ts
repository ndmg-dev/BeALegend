import { z } from 'zod';
import { request } from './client';

/**
 * Insight de nutrição gerado pelo servidor (IA). Só leitura — nunca entra no
 * outbox nem no sync. O endpoint responde 204 quando não há insight (feature
 * desligada, sem opt-in, sem dados ou erro do provider); nesse caso `request`
 * devolve `undefined` e aqui vira `null`.
 */
const insightSchema = z.object({
  tipo: z.enum(['diario', 'semanal']),
  periodo_ref: z.string(),
  texto: z.string(),
  gerado_em: z.string(),
});
export type NutritionInsight = z.infer<typeof insightSchema>;

async function fetchInsight(path: string): Promise<NutritionInsight | null> {
  // 204 → `request` devolve undefined sem tocar no schema (ver client.ts).
  const data: NutritionInsight | undefined = await request(path, { schema: insightSchema });
  return data ?? null;
}

export function fetchTodayInsight(): Promise<NutritionInsight | null> {
  return fetchInsight('/nutrition/insight/today');
}

export function fetchWeeklyInsight(): Promise<NutritionInsight | null> {
  return fetchInsight('/nutrition/insight/weekly');
}
