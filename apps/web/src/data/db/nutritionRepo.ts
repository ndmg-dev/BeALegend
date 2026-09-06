import { uuidv7 } from '@/data/ids';
import { enfileirar } from '@/data/sync/outbox';
import {
  db,
  type FoodItem,
  type MealLog,
  type MealPlan,
  type MealSlot,
  type MealSlotItem,
  type NutritionTarget,
  type Supplement,
  type WaterLog,
} from './schema';

function syncFields(userId: string) {
  const now = new Date().toISOString();
  return { user_id: userId, row_version: 0, deleted_at: null, criado_em: now, updated_at: now };
}

export async function activeMealPlan(): Promise<MealPlan | null> {
  const plans = await db.meal_plan.toArray();
  return plans.find((plan) => plan.ativo && plan.deleted_at === null) ?? null;
}

export async function mealSlots(): Promise<MealSlot[]> {
  const plan = await activeMealPlan();
  if (!plan) return [];
  return (await db.meal_slot.where('meal_plan_id').equals(plan.id).toArray())
    .filter((slot) => slot.deleted_at === null)
    .sort((a, b) => a.ordem - b.ordem);
}

export async function mealsOnDay(day: string): Promise<MealLog[]> {
  return (await db.meal_log.where('data').equals(day).toArray())
    .filter((meal) => meal.deleted_at === null)
    .sort((a, b) => a.horario.localeCompare(b.horario));
}

export async function waterOnDay(day: string): Promise<WaterLog[]> {
  return (await db.water_log.where('data').equals(day).toArray()).filter(
    (log) => log.deleted_at === null,
  );
}

export async function ensureNutritionDefaults(userId: string): Promise<void> {
  if (await activeMealPlan()) return;
  const plan: MealPlan = {
    id: uuidv7(), nome: 'Plano diário', ativo: true, ...syncFields(userId),
  };
  await db.transaction('rw', db.meal_plan, db.outbox, async () => {
    await db.meal_plan.add(plan);
    await enfileirar({
      entidade: 'meal_plan', operacao: 'create', registroId: plan.id,
      payload: { nome: plan.nome, ativo: plan.ativo },
    });
  });

  const defaults = [
    ['Café da manhã', '07:30', 'Comece o dia conforme seu plano'],
    ['Almoço', '12:30', 'Refeição principal'],
    ['Lanche da tarde', '16:30', 'Lanche planejado'],
    ['Jantar', '20:00', 'Fechamento do dia'],
  ] as const;
  for (const [index, [name, time, description]] of defaults.entries()) {
    const slot: MealSlot = {
      id: uuidv7(), meal_plan_id: plan.id, nome: name, horario_alvo: time,
      descricao: description, ordem: index, ...syncFields(userId),
    };
    await db.transaction('rw', db.meal_slot, db.outbox, async () => {
      await db.meal_slot.add(slot);
      await enfileirar({
        entidade: 'meal_slot', operacao: 'create', registroId: slot.id,
        payload: {
          meal_plan_id: plan.id, nome: name, horario_alvo: time,
          descricao: description, ordem: index,
        },
      });
    });
  }
}

export interface NewMeal {
  day: string;
  slotId: string | null;
  time: string;
  description: string;
  adherence: MealLog['aderencia'];
  photoUrl?: string | null;
  notes?: string | null;
  tags?: string[];
}

export async function createMeal(input: NewMeal, userId: string): Promise<MealLog> {
  const line: MealLog = {
    id: uuidv7(), data: input.day, slot_id: input.slotId, horario: input.time,
    descricao: input.description, foto_url: input.photoUrl ?? null,
    aderencia: input.adherence, notas: input.notes ?? null, tags: input.tags ?? [],
    ...syncFields(userId),
  };
  await db.transaction('rw', db.meal_log, db.outbox, async () => {
    await db.meal_log.add(line);
    await enfileirar({
      entidade: 'meal_log', operacao: 'create', registroId: line.id,
      payload: {
        data: line.data, slot_id: line.slot_id, horario: line.horario,
        descricao: line.descricao, foto_url: line.foto_url,
        aderencia: line.aderencia, notas: line.notas, tags: line.tags,
      },
    });
  });
  return line;
}

export async function addWater(day: string, ml: number, userId: string): Promise<WaterLog> {
  const now = new Date().toISOString();
  const line: WaterLog = {
    id: uuidv7(), data: day, ml, registrado_em: now, ...syncFields(userId),
  };
  await db.transaction('rw', db.water_log, db.outbox, async () => {
    await db.water_log.add(line);
    await enfileirar({
      entidade: 'water_log', operacao: 'create', registroId: line.id,
      payload: { data: day, ml, registrado_em: now },
    });
  });
  return line;
}

/**
 * O plano alimentar como a tela precisa: refeições, o que compõe cada uma,
 * a base de alimentos e a meta.
 *
 * Tudo isto é somente leitura no cliente — nasce do seed da planilha de dieta
 * e chega pelo delta do sync. Nenhuma função aqui enfileira nada no outbox.
 */
export async function dietPlan(): Promise<{
  plano: MealPlan | null;
  slots: MealSlot[];
  itens: MealSlotItem[];
  alimentosPorId: Map<string, FoodItem>;
  meta: NutritionTarget | null;
} > {
  const plano = await activeMealPlan();
  if (!plano) {
    return { plano: null, slots: [], itens: [], alimentosPorId: new Map(), meta: null };
  }

  const slots = await mealSlots();
  const idsDosSlots = new Set(slots.map((slot) => slot.id));
  const itens = (await db.meal_slot_item.toArray())
    .filter((item) => item.deleted_at === null && idsDosSlots.has(item.meal_slot_id))
    .sort((a, b) => a.ordem - b.ordem);

  const alimentos = (await db.food_item.toArray()).filter((item) => item.deleted_at === null);
  const meta = (await db.nutrition_target.toArray()).find(
    (alvo) => alvo.deleted_at === null && alvo.meal_plan_id === plano.id,
  );

  return {
    plano,
    slots,
    itens,
    alimentosPorId: new Map(alimentos.map((item) => [item.id, item])),
    meta: meta ?? null,
  };
}

export async function foodItems(): Promise<FoodItem[]> {
  return (await db.food_item.toArray())
    .filter((item) => item.deleted_at === null)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export async function supplements(): Promise<Supplement[]> {
  return (await db.supplement.toArray())
    .filter((item) => item.deleted_at === null)
    .sort((a, b) => a.ordem - b.ordem);
}

/**
 * Peso mais recente — entra no cálculo das metas.
 *
 * Diferente do resto do plano, o peso não vive no Dexie: `body_metric` só
 * existe no servidor, então ele chega pelo endpoint do plano e fica cacheado
 * no store `meta` para a tela continuar calculando offline. Um peso de dias
 * atrás muda a meta em gramas — vale muito mais que não mostrar meta nenhuma.
 */
const CHAVE_PESO = 'nutrition_peso_kg';

export async function cachedWeightKg(): Promise<number | null> {
  const linha = await db.meta.get(CHAVE_PESO);
  return typeof linha?.valor === 'number' ? linha.valor : null;
}

export async function saveWeightKg(peso: number | null): Promise<void> {
  await db.meta.put({ chave: CHAVE_PESO, valor: peso });
}
