import { z } from 'zod';
import { request } from './client';

/**
 * Plano alimentar vindo do servidor.
 *
 * O plano em si (refeições, itens, alimentos, meta) também chega pelo delta
 * do sync e vive no Dexie — a tela lê de lá para funcionar offline. Este
 * endpoint existe pelo `peso_kg`: ele mora em `body_metric`, que o cliente
 * não sincroniza, e sem ele não há meta de proteína nem de gordura.
 */
const planSchema = z.object({
  nome: z.string(),
  peso_kg: z.number().nullable(),
});
export type DietPlanResponse = z.infer<typeof planSchema>;

export async function fetchDietPlan(): Promise<DietPlanResponse | null> {
  const data: DietPlanResponse | undefined = await request('/nutrition/plan', {
    schema: planSchema,
  });
  return data ?? null;
}
