import { uuidv7 } from '@/data/ids';
import { enfileirar } from '@/data/sync/outbox';
import { db, exerciseSchema, parseOuDescartar, type Exercise } from './schema';

/**
 * Repositório de exercícios — escrita otimista.
 *
 * Grava no Dexie, devolve, enfileira. Nenhuma função aqui espera a rede: se o
 * registro custar uma viagem ao servidor, o app morre em duas semanas.
 */

const ENTIDADE = 'exercise';

export async function listar(): Promise<Exercise[]> {
  const linhas = await db.exercise.orderBy('nome').toArray();
  return linhas
    .map((linha) => parseOuDescartar(exerciseSchema, linha))
    .filter((linha): linha is Exercise => linha !== null && linha.deleted_at === null);
}

export async function obter(id: string): Promise<Exercise | null> {
  const linha = await db.exercise.get(id);
  if (!linha) return null;
  const validada = parseOuDescartar(exerciseSchema, linha);
  return validada?.deleted_at === null ? validada : null;
}

export interface NovoExercicio {
  nome: string;
  grupo_muscular?: string[];
  equipamento?: string | null;
  how_to?: string | null;
  common_mistakes?: string | null;
}

export async function criar(input: NovoExercicio, userId: string): Promise<Exercise> {
  const agora = new Date().toISOString();
  const linha: Exercise = {
    // O id nasce aqui. O servidor aceita — nada de id temporário que depois
    // vira outro e quebra as referências.
    id: uuidv7(),
    user_id: userId,
    is_global: false,
    nome: input.nome,
    grupo_muscular: input.grupo_muscular ?? [],
    equipamento: input.equipamento ?? null,
    how_to: input.how_to ?? null,
    common_mistakes: input.common_mistakes ?? null,
    // row_version 0 = ainda não conhecido pelo servidor. O primeiro delta que
    // chegar traz o valor real e vence.
    row_version: 0,
    deleted_at: null,
    updated_at: agora,
    criado_em: agora,
  };

  await db.transaction('rw', db.exercise, db.outbox, async () => {
    await db.exercise.add(linha);
    await enfileirar({
      entidade: ENTIDADE,
      operacao: 'create',
      registroId: linha.id,
      payload: {
        nome: linha.nome,
        grupo_muscular: linha.grupo_muscular,
        equipamento: linha.equipamento,
        how_to: linha.how_to,
        common_mistakes: linha.common_mistakes,
      },
    });
  });

  return linha;
}

export type PatchExercicio = Partial<
  Pick<Exercise, 'nome' | 'grupo_muscular' | 'equipamento' | 'how_to' | 'common_mistakes'>
>;

export async function atualizar(id: string, patch: PatchExercicio): Promise<void> {
  await db.transaction('rw', db.exercise, db.outbox, async () => {
    const atual = await db.exercise.get(id);
    if (!atual) throw new Error(`Exercício ${id} não existe localmente.`);

    await db.exercise.update(id, { ...patch, updated_at: new Date().toISOString() });
    // Só os campos tocados vão para a fila — é o que faz o last-write-wins
    // ser por campo, e não pela linha inteira.
    await enfileirar({
      entidade: ENTIDADE,
      operacao: 'update',
      registroId: id,
      payload: { ...patch },
    });
  });
}

export async function apagar(id: string): Promise<void> {
  await db.transaction('rw', db.exercise, db.outbox, async () => {
    await db.exercise.delete(id);
    await enfileirar({ entidade: ENTIDADE, operacao: 'delete', registroId: id });
  });
}
