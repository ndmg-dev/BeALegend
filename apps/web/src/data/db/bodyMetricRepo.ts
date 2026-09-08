import { uuidv7 } from '@/data/ids';
import { enfileirar } from '@/data/sync/outbox';
import { db, type BodyMetric } from './schema';

/**
 * Peso e medidas — escrita otimista, como o resto da camada offline.
 *
 * `body_metric` sincroniza normalmente (não é append-only nem somente
 * leitura): um registro errado pode ser apagado, mas não editado — o
 * servidor rejeita `update` (`schema_patch=None` no registry de sync); a
 * correção é apagar e lançar de novo.
 */

const ENTIDADE = 'body_metric';

function syncFields(userId: string) {
  const now = new Date().toISOString();
  return { user_id: userId, row_version: 0, deleted_at: null, criado_em: now, updated_at: now };
}

export async function registrar(
  tipo: 'peso' | 'circunferencia',
  valor: number,
  data: string,
  userId: string,
): Promise<BodyMetric> {
  const unidade = tipo === 'peso' ? 'kg' : 'cm';
  const linha: BodyMetric = { id: uuidv7(), data, tipo, valor, unidade, ...syncFields(userId) };
  await db.transaction('rw', db.body_metric, db.outbox, async () => {
    await db.body_metric.add(linha);
    await enfileirar({
      entidade: ENTIDADE, operacao: 'create', registroId: linha.id,
      payload: { data, tipo, valor, unidade },
    });
  });
  return linha;
}

export async function apagar(id: string): Promise<void> {
  await db.transaction('rw', db.body_metric, db.outbox, async () => {
    await db.body_metric.delete(id);
    await enfileirar({ entidade: ENTIDADE, operacao: 'delete', registroId: id });
  });
}

export type RegistroComValor = BodyMetric & { valor: number };

export async function historico(tipo: 'peso' | 'circunferencia'): Promise<RegistroComValor[]> {
  const linhas = await db.body_metric.where('tipo').equals(tipo).toArray();
  return linhas
    .filter((item): item is RegistroComValor => item.deleted_at === null && item.valor !== null)
    .sort((a, b) => a.data.localeCompare(b.data));
}

/**
 * Peso mais recente — entra no cálculo de proteína/gordura/calorias
 * (`domain/nutrition/targets.ts`). `body_metric` sincroniza pelo delta como
 * qualquer outra entidade, então isto funciona offline assim que o primeiro
 * pull trouxer o histórico — sem round-trip dedicado a um endpoint.
 */
export async function pesoAtualKg(): Promise<number | null> {
  const linhas = await historico('peso');
  return linhas.length ? (linhas[linhas.length - 1]?.valor ?? null) : null;
}
