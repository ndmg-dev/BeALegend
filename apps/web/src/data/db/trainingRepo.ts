import { db, type PlanDay, type PlanItem, type SetLog, type TrainingPlan } from './schema';

/**
 * Leitura do plano semanal.
 *
 * O plano é somente leitura pelo cliente — quem escreve é o seed (fase 2) e,
 * no futuro, um admin. Chega inteiro pelo delta de sync (fase 1) e mora aqui
 * só para leitura: nenhuma função deste arquivo enfileira nada na outbox.
 */

export async function planoAtivo(): Promise<TrainingPlan | null> {
  // Não há índice em `ativo` — IndexedDB não aceita boolean como chave, e o
  // volume aqui é de um plano por usuário, então a varredura é barata.
  const planos = await db.training_plan.toArray();
  return planos.find((p) => p.ativo && p.deleted_at === null) ?? null;
}

const ORDEM_DIAS = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];

export async function diasDoPlano(planId: string): Promise<PlanDay[]> {
  const dias = await db.plan_day.where('plan_id').equals(planId).toArray();
  return dias
    .filter((d) => d.deleted_at === null)
    .sort((a, b) => ORDEM_DIAS.indexOf(a.dia_semana) - ORDEM_DIAS.indexOf(b.dia_semana));
}

export async function itensDoDia(planDayId: string): Promise<PlanItem[]> {
  const itens = await db.plan_item.where('plan_day_id').equals(planDayId).toArray();
  return itens.filter((i) => i.deleted_at === null).sort((a, b) => a.ordem - b.ordem);
}

/** O dia de hoje, no fuso do usuário — "hoje" é decisão de fuso, não de UTC. */
export async function diaDeHoje(timezone: string): Promise<PlanDay | null> {
  const plano = await planoAtivo();
  if (!plano) return null;

  const hoje = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long' })
    .format(new Date())
    .toLowerCase();
  const slug: Record<string, string> = {
    monday: 'segunda',
    tuesday: 'terca',
    wednesday: 'quarta',
    thursday: 'quinta',
    friday: 'sexta',
    saturday: 'sabado',
    sunday: 'domingo',
  };
  const diaSemana = slug[hoje];

  const dias = await db.plan_day.where('plan_id').equals(plano.id).toArray();
  return dias.find((d) => d.dia_semana === diaSemana && d.deleted_at === null) ?? null;
}

/** Últimas séries deste exercício — para pré-preencher carga e reps. */
export async function historicoDoExercicio(exerciseId: string, limite = 30): Promise<SetLog[]> {
  const logs = await db.set_log.where('exercise_id').equals(exerciseId).toArray();
  return logs
    .filter((l) => l.deleted_at === null)
    .sort((a, b) => b.concluido_em.localeCompare(a.concluido_em))
    .slice(0, limite);
}

/** A última carga/reps registrada para o exercício, para pré-preencher o executor. */
export async function ultimaSerie(exerciseId: string): Promise<SetLog | null> {
  const historico = await historicoDoExercicio(exerciseId, 1);
  return historico[0] ?? null;
}
