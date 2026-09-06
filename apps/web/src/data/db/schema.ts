import Dexie, { type EntityTable } from 'dexie';
import { z } from 'zod';

/**
 * Banco local. Cache + fila de escrita, nunca a fonte da verdade — o Safari
 * pode limpar o IndexedDB depois de ~7 dias sem uso, e o servidor é quem
 * arbitra.
 *
 * A versão do schema aqui é o par cliente da migration do Alembic. Toda
 * mudança de forma entra como uma `version()` nova, nunca editando a antiga.
 */

export const exerciseSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid().nullable(),
  is_global: z.boolean(),
  nome: z.string(),
  grupo_muscular: z.array(z.string()),
  equipamento: z.string().nullable(),
  how_to: z.string().nullable(),
  common_mistakes: z.string().nullable(),
  row_version: z.number(),
  deleted_at: z.string().nullable(),
  updated_at: z.string(),
  criado_em: z.string(),
});

export type Exercise = z.infer<typeof exerciseSchema>;

// ---------------------------------------------------------------------------
// Treino — plano semanal (somente leitura pelo cliente) e execução
// ---------------------------------------------------------------------------

const syncFields = {
  row_version: z.number(),
  deleted_at: z.string().nullable(),
  updated_at: z.string(),
  criado_em: z.string(),
};

export const trainingPlanSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  nome: z.string(),
  objetivo: z.string().nullable(),
  ativo: z.boolean(),
  ...syncFields,
});
export type TrainingPlan = z.infer<typeof trainingPlanSchema>;

export const planDaySchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  plan_id: z.string().uuid(),
  dia_semana: z.enum(['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo']),
  tipo: z.enum(['forca', 'cardio', 'hiit', 'descanso']),
  foco: z.string().nullable(),
  duracao_min: z.string().nullable(),
  intensidade: z.string().nullable(),
  observacoes: z.string().nullable(),
  ...syncFields,
});
export type PlanDay = z.infer<typeof planDaySchema>;

export const planItemSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  plan_day_id: z.string().uuid(),
  exercise_id: z.string().uuid().nullable(),
  cardio_protocol_id: z.string().uuid().nullable(),
  ordem: z.number(),
  series_min: z.number().nullable(),
  series_max: z.number().nullable(),
  reps_min: z.number().nullable(),
  reps_max: z.number().nullable(),
  unidade: z.enum(['reps', 'segundos']),
  unilateral: z.boolean(),
  rir_min: z.number().nullable(),
  rir_max: z.number().nullable(),
  descanso_seg: z.number().nullable(),
  notas: z.string().nullable(),
  ...syncFields,
});
export type PlanItem = z.infer<typeof planItemSchema>;

export const cardioProtocolSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid().nullable(),
  is_global: z.boolean(),
  nome: z.string(),
  aquecimento: z.string().nullable(),
  parte_principal: z.string().nullable(),
  recuperacao: z.string().nullable(),
  desaquecimento: z.string().nullable(),
  rpe_alvo: z.string().nullable(),
  observacao: z.string().nullable(),
  ...syncFields,
});
export type CardioProtocol = z.infer<typeof cardioProtocolSchema>;

export const sessionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  plan_day_id: z.string().uuid().nullable(),
  data: z.string(),
  status: z.enum(['planejada', 'em_curso', 'concluida', 'pulada']),
  duracao_real_min: z.number().nullable(),
  rpe_geral: z.number().nullable(),
  notas: z.string().nullable(),
  ...syncFields,
});
export type Session = z.infer<typeof sessionSchema>;

export const setLogSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  session_id: z.string().uuid(),
  exercise_id: z.string().uuid(),
  numero_serie: z.number(),
  reps: z.number(),
  carga_kg: z.number(),
  rir: z.number().nullable(),
  concluido_em: z.string(),
  ...syncFields,
});
export type SetLog = z.infer<typeof setLogSchema>;

// ---------------------------------------------------------------------------
// Finanças — dinheiro sempre em centavos inteiros
// ---------------------------------------------------------------------------

export const accountSchema = z.object({
  id: z.string().uuid(), user_id: z.string().uuid(), nome: z.string(),
  tipo: z.enum(['conta', 'cartao', 'carteira']), saldo_inicial_centavos: z.number().int(),
  ...syncFields,
});
export type Account = z.infer<typeof accountSchema>;

export const categorySchema = z.object({
  id: z.string().uuid(), user_id: z.string().uuid(), nome: z.string(),
  tipo: z.enum(['receita', 'despesa']), cor: z.string().nullable(),
  icone: z.string().nullable(), pai_id: z.string().uuid().nullable(), ...syncFields,
});
export type Category = z.infer<typeof categorySchema>;

export const recurringSchema = z.object({
  id: z.string().uuid(), user_id: z.string().uuid(), template_json: z.record(z.unknown()),
  regra_rrule: z.string(), proxima_ocorrencia: z.string().nullable(), ...syncFields,
});
export type Recurring = z.infer<typeof recurringSchema>;

export const financeTransactionSchema = z.object({
  id: z.string().uuid(), user_id: z.string().uuid(), account_id: z.string().uuid(),
  category_id: z.string().uuid().nullable(), valor_centavos: z.number().int().positive(),
  tipo: z.enum(['receita', 'despesa', 'transferencia']), data: z.string(),
  descricao: z.string().nullable(), recorrente_id: z.string().uuid().nullable(),
  tags: z.array(z.string()), ...syncFields,
});
export type FinanceTransaction = z.infer<typeof financeTransactionSchema>;

export const budgetSchema = z.object({
  id: z.string().uuid(), user_id: z.string().uuid(), category_id: z.string().uuid(),
  mes_ano: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  limite_centavos: z.number().int().positive(), ...syncFields,
});
export type Budget = z.infer<typeof budgetSchema>;

// ---------------------------------------------------------------------------
// Nutrição — aderência e regularidade, sem calorias/macros na v1
// ---------------------------------------------------------------------------

export const mealPlanSchema = z.object({
  id: z.string().uuid(), user_id: z.string().uuid(), nome: z.string(), ativo: z.boolean(),
  ...syncFields,
});
export type MealPlan = z.infer<typeof mealPlanSchema>;

export const mealSlotSchema = z.object({
  id: z.string().uuid(), user_id: z.string().uuid(), meal_plan_id: z.string().uuid(),
  nome: z.string(), horario_alvo: z.string().nullable(), descricao: z.string().nullable(),
  ordem: z.number().int(), ...syncFields,
});
export type MealSlot = z.infer<typeof mealSlotSchema>;

export const mealLogSchema = z.object({
  id: z.string().uuid(), user_id: z.string().uuid(), data: z.string(),
  slot_id: z.string().uuid().nullable(), horario: z.string(), descricao: z.string(),
  foto_url: z.string().nullable(), aderencia: z.enum(['dentro', 'parcial', 'fora']),
  notas: z.string().nullable(), tags: z.array(z.string()), ...syncFields,
});
export type MealLog = z.infer<typeof mealLogSchema>;

export const waterLogSchema = z.object({
  id: z.string().uuid(), user_id: z.string().uuid(), data: z.string(),
  ml: z.number().int().positive(), registrado_em: z.string(), ...syncFields,
});
export type WaterLog = z.infer<typeof waterLogSchema>;

/**
 * Catálogo de alimentos — macros por 100 g/ml, como a TACO e os rótulos
 * publicam. `user_id` é nulo nas linhas globais que vieram do seed.
 */
export const foodItemSchema = z.object({
  id: z.string().uuid(), user_id: z.string().uuid().nullable(), is_global: z.boolean(),
  nome: z.string(), kcal: z.number(), proteina_g: z.number(), carboidrato_g: z.number(),
  gordura_g: z.number(), fibra_g: z.number(), referencia_pratica: z.string().nullable(),
  fonte: z.string().nullable(), conferir_rotulo: z.boolean(), ...syncFields,
});
export type FoodItem = z.infer<typeof foodItemSchema>;

/** Alimento planejado numa refeição. `quantidade_g` nula = sugestão sem porção. */
export const mealSlotItemSchema = z.object({
  id: z.string().uuid(), user_id: z.string().uuid(), meal_slot_id: z.string().uuid(),
  food_item_id: z.string().uuid(), quantidade_g: z.number().nullable(),
  ordem: z.number().int(), observacao: z.string().nullable(), ...syncFields,
});
export type MealSlotItem = z.infer<typeof mealSlotItemSchema>;

/** Parâmetros da meta diária. Os valores absolutos derivam do peso atual. */
export const nutritionTargetSchema = z.object({
  id: z.string().uuid(), user_id: z.string().uuid(), meal_plan_id: z.string().uuid(),
  proteina_g_kg: z.number(), gordura_g_kg: z.number(), fibra_g_por_1000kcal: z.number(),
  fator_atividade: z.number(), ajuste_calorico: z.number(),
  manutencao_kcal_manual: z.number().int().nullable(),
  sexo: z.enum(['M', 'F']).nullable(), idade: z.number().int().nullable(),
  altura_cm: z.number().int().nullable(), ...syncFields,
});
export type NutritionTarget = z.infer<typeof nutritionTargetSchema>;

export const supplementSchema = z.object({
  id: z.string().uuid(), user_id: z.string().uuid().nullable(), is_global: z.boolean(),
  nome: z.string(), como_usar: z.string().nullable(), faixa: z.string().nullable(),
  horario: z.string().nullable(), observar: z.string().nullable(),
  fonte: z.string().nullable(), status: z.string().nullable(),
  ordem: z.number().int(), ...syncFields,
});
export type Supplement = z.infer<typeof supplementSchema>;

// ---------------------------------------------------------------------------
// Rotina e metas — progresso sempre derivado de métricas reais
// ---------------------------------------------------------------------------

export const habitSchema = z.object({
  id: z.string().uuid(), user_id: z.string().uuid(), nome: z.string(),
  icone: z.string().nullable(), frequencia_rrule: z.string(),
  meta_por_semana: z.number().int(), ativo: z.boolean(), ...syncFields,
});
export type Habit = z.infer<typeof habitSchema>;

export const habitCheckinSchema = z.object({
  id: z.string().uuid(), user_id: z.string().uuid(), habit_id: z.string().uuid(),
  data: z.string(), concluido: z.boolean(), valor: z.number().nullable(), ...syncFields,
});
export type HabitCheckin = z.infer<typeof habitCheckinSchema>;

export const goalSchema = z.object({
  id: z.string().uuid(), user_id: z.string().uuid(), titulo: z.string(),
  dominio: z.enum(['treino', 'nutricao', 'financas', 'rotina']),
  tipo: z.enum(['numerica', 'binaria', 'habito']), alvo: z.number().positive(),
  unidade: z.string().nullable(), prazo: z.string().nullable(), metrica_ref: z.string(),
  status: z.enum(['ativa', 'concluida', 'arquivada']), ...syncFields,
});
export type Goal = z.infer<typeof goalSchema>;

// ---------------------------------------------------------------------------
// Conquistas — marcador append-only. A verdade é o evaluate puro em
// domain/achievements; esta linha só fixa a data e a comemoração.
// ---------------------------------------------------------------------------

export const achievementUnlockSchema = z.object({
  id: z.string().uuid(), user_id: z.string().uuid(),
  achievement_key: z.string(), desbloqueado_em: z.string(), ...syncFields,
});
export type AchievementUnlock = z.infer<typeof achievementUnlockSchema>;

export const operacaoSchema = z.enum(['create', 'update', 'delete']);
export type Operacao = z.infer<typeof operacaoSchema>;

/**
 * Item da fila de escrita.
 *
 * `idempotency_key` nasce junto com o item e sobrevive a toda retentativa —
 * é o que o servidor usa para reconhecer um reenvio.
 */
export const outboxItemSchema = z.object({
  id_local: z.string().uuid(),
  entidade: z.string(),
  operacao: operacaoSchema,
  registro_id: z.string().uuid(),
  payload: z.record(z.unknown()),
  idempotency_key: z.string(),
  criado_em: z.number(),
  tentativas: z.number(),
  ultima_tentativa_em: z.number().nullable(),
  ultimo_erro: z.string().nullable(),
});

export type OutboxItem = z.infer<typeof outboxItemSchema>;

export interface MetaEntry {
  chave: string;
  valor: string | number | null;
}

class BeALegendDB extends Dexie {
  exercise!: EntityTable<Exercise, 'id'>;
  outbox!: EntityTable<OutboxItem, 'id_local'>;
  meta!: EntityTable<MetaEntry, 'chave'>;
  training_plan!: EntityTable<TrainingPlan, 'id'>;
  plan_day!: EntityTable<PlanDay, 'id'>;
  plan_item!: EntityTable<PlanItem, 'id'>;
  cardio_protocol!: EntityTable<CardioProtocol, 'id'>;
  session!: EntityTable<Session, 'id'>;
  set_log!: EntityTable<SetLog, 'id'>;
  account!: EntityTable<Account, 'id'>;
  category!: EntityTable<Category, 'id'>;
  recurring!: EntityTable<Recurring, 'id'>;
  finance_transaction!: EntityTable<FinanceTransaction, 'id'>;
  budget!: EntityTable<Budget, 'id'>;
  meal_plan!: EntityTable<MealPlan, 'id'>;
  meal_slot!: EntityTable<MealSlot, 'id'>;
  meal_log!: EntityTable<MealLog, 'id'>;
  water_log!: EntityTable<WaterLog, 'id'>;
  food_item!: EntityTable<FoodItem, 'id'>;
  meal_slot_item!: EntityTable<MealSlotItem, 'id'>;
  nutrition_target!: EntityTable<NutritionTarget, 'id'>;
  supplement!: EntityTable<Supplement, 'id'>;
  habit!: EntityTable<Habit, 'id'>;
  habit_checkin!: EntityTable<HabitCheckin, 'id'>;
  goal!: EntityTable<Goal, 'id'>;
  achievement_unlock!: EntityTable<AchievementUnlock, 'id'>;

  constructor() {
    super('bealegend');

    // v1 — fase 1: catálogo de exercícios, outbox e o cursor de sync.
    this.version(1).stores({
      exercise: 'id, nome, row_version, deleted_at',
      outbox: 'id_local, entidade, registro_id, criado_em, tentativas',
      meta: 'chave',
    });

    // v2 — fase 2: plano semanal (somente leitura) e execução de sessão.
    // Dexie exige o schema completo em cada version(), não só o delta.
    this.version(2).stores({
      exercise: 'id, nome, row_version, deleted_at',
      outbox: 'id_local, entidade, registro_id, criado_em, tentativas',
      meta: 'chave',
      // 'ativo' não entra no índice: IndexedDB não aceita boolean como chave.
      training_plan: 'id, row_version, deleted_at',
      plan_day: 'id, plan_id, dia_semana, row_version, deleted_at',
      plan_item: 'id, plan_day_id, ordem, row_version, deleted_at',
      cardio_protocol: 'id, row_version, deleted_at',
      session: 'id, data, status, plan_day_id, row_version, deleted_at',
      set_log: 'id, session_id, exercise_id, concluido_em, row_version, deleted_at',
    });

    // v3 — fase 3: contas, categorias, lançamentos, orçamentos e recorrências.
    this.version(3).stores({
      exercise: 'id, nome, row_version, deleted_at',
      outbox: 'id_local, entidade, registro_id, criado_em, tentativas',
      meta: 'chave',
      training_plan: 'id, row_version, deleted_at',
      plan_day: 'id, plan_id, dia_semana, row_version, deleted_at',
      plan_item: 'id, plan_day_id, ordem, row_version, deleted_at',
      cardio_protocol: 'id, row_version, deleted_at',
      session: 'id, data, status, plan_day_id, row_version, deleted_at',
      set_log: 'id, session_id, exercise_id, concluido_em, row_version, deleted_at',
      account: 'id, nome, tipo, row_version, deleted_at',
      category: 'id, nome, tipo, pai_id, row_version, deleted_at',
      recurring: 'id, proxima_ocorrencia, row_version, deleted_at',
      finance_transaction: 'id, data, tipo, account_id, category_id, row_version, deleted_at',
      budget: 'id, mes_ano, category_id, row_version, deleted_at',
    });

    // v4 — fase 4: plano alimentar, refeições registradas e hidratação.
    this.version(4).stores({
      exercise: 'id, nome, row_version, deleted_at',
      outbox: 'id_local, entidade, registro_id, criado_em, tentativas',
      meta: 'chave',
      training_plan: 'id, row_version, deleted_at',
      plan_day: 'id, plan_id, dia_semana, row_version, deleted_at',
      plan_item: 'id, plan_day_id, ordem, row_version, deleted_at',
      cardio_protocol: 'id, row_version, deleted_at',
      session: 'id, data, status, plan_day_id, row_version, deleted_at',
      set_log: 'id, session_id, exercise_id, concluido_em, row_version, deleted_at',
      account: 'id, nome, tipo, row_version, deleted_at',
      category: 'id, nome, tipo, pai_id, row_version, deleted_at',
      recurring: 'id, proxima_ocorrencia, row_version, deleted_at',
      finance_transaction: 'id, data, tipo, account_id, category_id, row_version, deleted_at',
      budget: 'id, mes_ano, category_id, row_version, deleted_at',
      meal_plan: 'id, ativo, row_version, deleted_at',
      meal_slot: 'id, meal_plan_id, ordem, row_version, deleted_at',
      meal_log: 'id, data, slot_id, horario, row_version, deleted_at',
      water_log: 'id, data, registrado_em, row_version, deleted_at',
    });

    // v5 — fase 5: hábitos, check-ins e metas calculadas.
    this.version(5).stores({
      exercise: 'id, nome, row_version, deleted_at',
      outbox: 'id_local, entidade, registro_id, criado_em, tentativas',
      meta: 'chave',
      training_plan: 'id, row_version, deleted_at',
      plan_day: 'id, plan_id, dia_semana, row_version, deleted_at',
      plan_item: 'id, plan_day_id, ordem, row_version, deleted_at',
      cardio_protocol: 'id, row_version, deleted_at',
      session: 'id, data, status, plan_day_id, row_version, deleted_at',
      set_log: 'id, session_id, exercise_id, concluido_em, row_version, deleted_at',
      account: 'id, nome, tipo, row_version, deleted_at',
      category: 'id, nome, tipo, pai_id, row_version, deleted_at',
      recurring: 'id, proxima_ocorrencia, row_version, deleted_at',
      finance_transaction: 'id, data, tipo, account_id, category_id, row_version, deleted_at',
      budget: 'id, mes_ano, category_id, row_version, deleted_at',
      meal_plan: 'id, ativo, row_version, deleted_at',
      meal_slot: 'id, meal_plan_id, ordem, row_version, deleted_at',
      meal_log: 'id, data, slot_id, horario, row_version, deleted_at',
      water_log: 'id, data, registrado_em, row_version, deleted_at',
      habit: 'id, nome, ativo, row_version, deleted_at',
      habit_checkin: 'id, habit_id, data, concluido, row_version, deleted_at',
      goal: 'id, status, dominio, metrica_ref, row_version, deleted_at',
    });

    // v6 — conquistas: marcador append-only de troféu desbloqueado.
    this.version(6).stores({
      exercise: 'id, nome, row_version, deleted_at',
      outbox: 'id_local, entidade, registro_id, criado_em, tentativas',
      meta: 'chave',
      training_plan: 'id, row_version, deleted_at',
      plan_day: 'id, plan_id, dia_semana, row_version, deleted_at',
      plan_item: 'id, plan_day_id, ordem, row_version, deleted_at',
      cardio_protocol: 'id, row_version, deleted_at',
      session: 'id, data, status, plan_day_id, row_version, deleted_at',
      set_log: 'id, session_id, exercise_id, concluido_em, row_version, deleted_at',
      account: 'id, nome, tipo, row_version, deleted_at',
      category: 'id, nome, tipo, pai_id, row_version, deleted_at',
      recurring: 'id, proxima_ocorrencia, row_version, deleted_at',
      finance_transaction: 'id, data, tipo, account_id, category_id, row_version, deleted_at',
      budget: 'id, mes_ano, category_id, row_version, deleted_at',
      meal_plan: 'id, ativo, row_version, deleted_at',
      meal_slot: 'id, meal_plan_id, ordem, row_version, deleted_at',
      meal_log: 'id, data, slot_id, horario, row_version, deleted_at',
      water_log: 'id, data, registrado_em, row_version, deleted_at',
      habit: 'id, nome, ativo, row_version, deleted_at',
      habit_checkin: 'id, habit_id, data, concluido, row_version, deleted_at',
      goal: 'id, status, dominio, metrica_ref, row_version, deleted_at',
      achievement_unlock: 'id, achievement_key, row_version, deleted_at',
    });

    // v7 — dieta: catálogo de alimentos, itens da refeição, meta e suplementos.
    // Todas somente leitura no cliente; quem escreve é o seed, via delta.
    this.version(7).stores({
      exercise: 'id, nome, row_version, deleted_at',
      outbox: 'id_local, entidade, registro_id, criado_em, tentativas',
      meta: 'chave',
      training_plan: 'id, row_version, deleted_at',
      plan_day: 'id, plan_id, dia_semana, row_version, deleted_at',
      plan_item: 'id, plan_day_id, ordem, row_version, deleted_at',
      cardio_protocol: 'id, row_version, deleted_at',
      session: 'id, data, status, plan_day_id, row_version, deleted_at',
      set_log: 'id, session_id, exercise_id, concluido_em, row_version, deleted_at',
      account: 'id, nome, tipo, row_version, deleted_at',
      category: 'id, nome, tipo, pai_id, row_version, deleted_at',
      recurring: 'id, proxima_ocorrencia, row_version, deleted_at',
      finance_transaction: 'id, data, tipo, account_id, category_id, row_version, deleted_at',
      budget: 'id, mes_ano, category_id, row_version, deleted_at',
      meal_plan: 'id, ativo, row_version, deleted_at',
      meal_slot: 'id, meal_plan_id, ordem, row_version, deleted_at',
      meal_log: 'id, data, slot_id, horario, row_version, deleted_at',
      water_log: 'id, data, registrado_em, row_version, deleted_at',
      habit: 'id, nome, ativo, row_version, deleted_at',
      habit_checkin: 'id, habit_id, data, concluido, row_version, deleted_at',
      goal: 'id, status, dominio, metrica_ref, row_version, deleted_at',
      achievement_unlock: 'id, achievement_key, row_version, deleted_at',
      food_item: 'id, nome, row_version, deleted_at',
      meal_slot_item: 'id, meal_slot_id, food_item_id, ordem, row_version, deleted_at',
      nutrition_target: 'id, meal_plan_id, row_version, deleted_at',
      supplement: 'id, nome, ordem, row_version, deleted_at',
    });
  }
}

export const db = new BeALegendDB();

/** Chaves da tabela `meta`. */
export const META_CURSOR = 'sync_cursor';
export const META_ULTIMO_SYNC = 'sync_ultimo_em';

/**
 * Valida um registro lido do Dexie.
 *
 * O dado local é tão suspeito quanto uma resposta de API: veio de uma versão
 * antiga do app, de uma migration que meio rodou, de um navegador que limpou
 * pela metade. Uma linha corrompida é descartada, não propagada para a UI.
 */
export function parseOuDescartar<T>(schema: z.ZodType<T>, valor: unknown): T | null {
  const resultado = schema.safeParse(valor);
  if (resultado.success) return resultado.data;
  console.warn('[db] registro local inválido, descartado', resultado.error.issues);
  return null;
}

export async function limparTudo(): Promise<void> {
  const tabelas = [
    db.exercise,
    db.outbox,
    db.meta,
    db.training_plan,
    db.plan_day,
    db.plan_item,
    db.cardio_protocol,
    db.session,
    db.set_log,
    db.account,
    db.category,
    db.recurring,
    db.finance_transaction,
    db.budget,
    db.meal_plan,
    db.meal_slot,
    db.meal_log,
    db.water_log,
    db.habit,
    db.habit_checkin,
    db.goal,
    db.achievement_unlock,
    db.food_item,
    db.meal_slot_item,
    db.nutrition_target,
    db.supplement,
  ] as const;
  await db.transaction('rw', tabelas, async () => {
    await Promise.all(tabelas.map((t) => t.clear()));
  });
}
