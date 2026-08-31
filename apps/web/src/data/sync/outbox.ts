import { coalescerPendencias, type PendenciaLocal } from '@/domain/sync/reconcile';
import { idempotencyKey, uuidv7 } from '@/data/ids';
import { db, type OutboxItem, type Operacao } from '@/data/db/schema';

/**
 * Fila de escrita persistente.
 *
 * Toda mutação passa por aqui antes de existir para o servidor. A UI nunca
 * espera a rede: grava no Dexie, atualiza a tela, enfileira. Quem se preocupa
 * com conexão é o motor de sync.
 */

export type { Operacao };

interface EnfileirarInput {
  entidade: string;
  operacao: Operacao;
  registroId: string;
  payload?: Record<string, unknown>;
  /**
   * Sobrescreve a chave de idempotência gerada. Use só quando a dedup precisa
   * ser estável **entre dispositivos**, não só entre retentativas: conquistas
   * usam `unlock:<key>`, então dois aparelhos que detectam o mesmo troféu
   * mandam a mesma chave e o servidor devolve `duplicate` em vez de estourar
   * o unique.
   */
  idempotencyKeyFixa?: string;
}

export async function enfileirar({
  entidade,
  operacao,
  registroId,
  payload = {},
  idempotencyKeyFixa,
}: EnfileirarInput): Promise<OutboxItem> {
  const item: OutboxItem = {
    id_local: uuidv7(),
    entidade,
    operacao,
    registro_id: registroId,
    payload,
    // A chave nasce aqui e não muda mais: é o mesmo item lógico em toda
    // retentativa, e é assim que o servidor reconhece o reenvio.
    idempotency_key: idempotencyKeyFixa ?? idempotencyKey(),
    criado_em: Date.now(),
    tentativas: 0,
    ultima_tentativa_em: null,
    ultimo_erro: null,
  };

  await db.outbox.add(item);
  return item;
}

/** Itens pendentes, na ordem em que foram enfileirados. */
export async function pendentes(): Promise<OutboxItem[]> {
  return db.outbox.orderBy('criado_em').toArray();
}

export async function pendentesDoRegistro(registroId: string): Promise<PendenciaLocal[]> {
  const itens = await db.outbox.where('registro_id').equals(registroId).sortBy('criado_em');
  return itens.map((i) => ({ operacao: i.operacao, payload: i.payload }));
}

/** Mapa registro_id → pendências, para reconciliar um delta inteiro de uma vez. */
export async function pendenciasPorRegistro(): Promise<Map<string, PendenciaLocal[]>> {
  const itens = await db.outbox.orderBy('criado_em').toArray();
  const mapa = new Map<string, PendenciaLocal[]>();
  for (const item of itens) {
    const lista = mapa.get(item.registro_id) ?? [];
    lista.push({ operacao: item.operacao, payload: item.payload });
    mapa.set(item.registro_id, lista);
  }
  return mapa;
}

export async function quantidadePendente(): Promise<number> {
  return db.outbox.count();
}

export async function remover(idsLocais: readonly string[]): Promise<void> {
  await db.outbox.bulkDelete([...idsLocais]);
}

export async function registrarFalha(
  idsLocais: readonly string[],
  erro: string,
): Promise<void> {
  const agora = Date.now();
  await db.transaction('rw', db.outbox, async () => {
    for (const id of idsLocais) {
      const item = await db.outbox.get(id);
      if (!item) continue;
      await db.outbox.update(id, {
        tentativas: item.tentativas + 1,
        ultima_tentativa_em: agora,
        ultimo_erro: erro,
      });
    }
  });
}

/**
 * Agrupa a fila por registro e funde cada grupo num envio só.
 *
 * Devolve, para cada operação a enviar, os `id_local` que ela representa —
 * é o que permite apagar todos os itens fundidos quando o servidor confirma.
 */
export interface EnvioAgrupado {
  registroId: string;
  entidade: string;
  operacao: Operacao;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  idsLocais: string[];
}

export interface Agrupamento {
  envios: EnvioAgrupado[];
  /** Itens que saem da fila sem virar requisição nenhuma. */
  descartar: string[];
}

export function agrupar(itens: readonly OutboxItem[]): Agrupamento {
  const porRegistro = new Map<string, OutboxItem[]>();
  for (const item of itens) {
    const lista = porRegistro.get(item.registro_id) ?? [];
    lista.push(item);
    porRegistro.set(item.registro_id, lista);
  }

  const envios: EnvioAgrupado[] = [];
  const descartar: string[] = [];

  for (const [registroId, grupo] of porRegistro) {
    const primeiro = grupo[0];
    if (!primeiro) continue;

    const fundido = coalescerPendencias(
      grupo.map((i) => ({ operacao: i.operacao, payload: i.payload })),
    );

    // `null` = criado e apagado offline. Nunca existiu para o servidor, então
    // não há o que enviar: os itens só saem da fila.
    if (fundido === null) {
      descartar.push(...grupo.map((i) => i.id_local));
      continue;
    }

    envios.push({
      registroId,
      entidade: primeiro.entidade,
      operacao: fundido.operacao,
      payload: fundido.payload,
      // A chave do item mais antigo do grupo: estável entre retentativas.
      idempotencyKey: primeiro.idempotency_key,
      idsLocais: grupo.map((i) => i.id_local),
    });
  }

  return { envios, descartar };
}
