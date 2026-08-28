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

  constructor() {
    super('bealegend');

    // v1 — fase 1: catálogo de exercícios, outbox e o cursor de sync.
    // As entidades de treino, finanças, nutrição e rotina entram em versões
    // seguintes, cada uma no seu `version()`.
    this.version(1).stores({
      exercise: 'id, nome, row_version, deleted_at',
      outbox: 'id_local, entidade, registro_id, criado_em, tentativas',
      meta: 'chave',
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
  await db.transaction('rw', db.exercise, db.outbox, db.meta, async () => {
    await Promise.all([db.exercise.clear(), db.outbox.clear(), db.meta.clear()]);
  });
}
