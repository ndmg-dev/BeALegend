import { uuidv7 } from '@/data/ids';
import { enfileirar } from '@/data/sync/outbox';
import { db, type Session, type SetLog } from './schema';

/**
 * Sessão e séries — escrita otimista, como o resto da camada offline.
 *
 * `set_log` é append-only: nunca chame `atualizar` nem `apagar` para uma
 * série já gravada. O registro é a fonte de verdade do que aconteceu na
 * academia, e sobrescrever perde o dado real.
 */

const ENTIDADE_SESSION = 'session';
const ENTIDADE_SET_LOG = 'set_log';

export interface NovaSessao {
  planDayId: string | null;
  data: string; // YYYY-MM-DD, no fuso do usuário
}

/**
 * Sessão do dia já em andamento para este plan_day, se houver.
 *
 * Sem isto, um reload no meio do treino (fechar e reabrir o app, um crash)
 * criaria uma sessão nova a cada vez — perdendo de vista as séries já
 * registradas na sessão anterior, que continuam no banco mas ficam órfãs.
 */
export async function sessaoEmAndamento(planDayId: string, data: string): Promise<Session | null> {
  const sessoes = await db.session.where('plan_day_id').equals(planDayId).toArray();
  return (
    sessoes.find(
      (s) => s.data === data && s.status !== 'concluida' && s.status !== 'pulada' && s.deleted_at === null,
    ) ?? null
  );
}

export async function iniciarSessao(input: NovaSessao, userId: string): Promise<Session> {
  const agora = new Date().toISOString();
  const linha: Session = {
    id: uuidv7(),
    user_id: userId,
    plan_day_id: input.planDayId,
    data: input.data,
    status: 'em_curso',
    duracao_real_min: null,
    rpe_geral: null,
    notas: null,
    row_version: 0,
    deleted_at: null,
    updated_at: agora,
    criado_em: agora,
  };

  await db.transaction('rw', db.session, db.outbox, async () => {
    await db.session.add(linha);
    await enfileirar({
      entidade: ENTIDADE_SESSION,
      operacao: 'create',
      registroId: linha.id,
      payload: { plan_day_id: linha.plan_day_id, data: linha.data, status: linha.status },
    });
  });

  return linha;
}

/**
 * Retoma a sessão do dia ou cria uma única sessão de forma atômica.
 *
 * React Strict Mode pode montar um efeito duas vezes em desenvolvimento. Fazer
 * o SELECT e o INSERT dentro da mesma transação do Dexie impede que as duas
 * montagens observem "nenhuma sessão" e criem registros concorrentes.
 */
export async function iniciarOuRetomarSessao(
  input: NovaSessao,
  userId: string,
): Promise<Session> {
  return db.transaction('rw', db.session, db.outbox, async () => {
    if (input.planDayId) {
      const existente = await sessaoEmAndamento(input.planDayId, input.data);
      if (existente) return existente;
    }

    return iniciarSessao(input, userId);
  });
}

export interface PatchSessao {
  status?: Session['status'];
  duracao_real_min?: number | null;
  rpe_geral?: number | null;
  notas?: string | null;
}

export async function atualizarSessao(id: string, patch: PatchSessao): Promise<void> {
  await db.transaction('rw', db.session, db.outbox, async () => {
    const atual = await db.session.get(id);
    if (!atual) throw new Error(`Sessão ${id} não existe localmente.`);

    await db.session.update(id, { ...patch, updated_at: new Date().toISOString() });
    await enfileirar({
      entidade: ENTIDADE_SESSION,
      operacao: 'update',
      registroId: id,
      payload: { ...patch },
    });
  });
}

export async function concluirSessao(id: string): Promise<void> {
  await atualizarSessao(id, { status: 'concluida' });
}

export interface NovaSerie {
  sessionId: string;
  exerciseId: string;
  numeroSerie: number;
  reps: number;
  cargaKg: number;
  rir: number | null;
}

/**
 * Registra uma série concluída.
 *
 * O botão "série concluída" no executor chama exatamente isto: grava local,
 * a UI já mostra a série feita, e a sincronização acontece depois — nunca
 * antes, nunca bloqueando.
 */
export async function registrarSerie(input: NovaSerie, userId: string): Promise<SetLog> {
  const agora = new Date().toISOString();
  const linha: SetLog = {
    id: uuidv7(),
    user_id: userId,
    session_id: input.sessionId,
    exercise_id: input.exerciseId,
    numero_serie: input.numeroSerie,
    reps: input.reps,
    carga_kg: input.cargaKg,
    rir: input.rir,
    concluido_em: agora,
    row_version: 0,
    deleted_at: null,
    updated_at: agora,
    criado_em: agora,
  };

  await db.transaction('rw', db.set_log, db.outbox, async () => {
    await db.set_log.add(linha);
    await enfileirar({
      entidade: ENTIDADE_SET_LOG,
      operacao: 'create',
      registroId: linha.id,
      payload: {
        session_id: linha.session_id,
        exercise_id: linha.exercise_id,
        numero_serie: linha.numero_serie,
        reps: linha.reps,
        carga_kg: linha.carga_kg,
        rir: linha.rir,
        concluido_em: linha.concluido_em,
      },
    });
  });

  return linha;
}

/** As séries já registradas nesta sessão para este exercício. */
export async function seriesDaSessao(sessionId: string, exerciseId: string): Promise<SetLog[]> {
  const logs = await db.set_log.where('session_id').equals(sessionId).toArray();
  return logs
    .filter((l) => l.exercise_id === exerciseId && l.deleted_at === null)
    .sort((a, b) => a.numero_serie - b.numero_serie);
}
