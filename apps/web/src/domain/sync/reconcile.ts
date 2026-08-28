/**
 * Reconciliação entre o que chegou do servidor e o que ainda não subiu.
 *
 * Pura: recebe a linha remota, a linha local e as operações pendentes daquele
 * id, e decide o que fica gravado no Dexie. É a regra mais fácil de errar da
 * camada offline e a mais cara de depurar depois — por isso mora aqui, longe
 * de I/O.
 */

export interface LinhaSincronizavel {
  id: string;
  row_version: number;
  deleted_at: string | null;
  [campo: string]: unknown;
}

export type Operacao = 'create' | 'update' | 'delete';

export interface PendenciaLocal {
  operacao: Operacao;
  /** Só os campos que este dispositivo mudou. */
  payload: Record<string, unknown>;
}

export type Decisao =
  | { acao: 'gravar'; linha: LinhaSincronizavel }
  | { acao: 'remover'; id: string }
  | { acao: 'ignorar' };

/**
 * Aplica uma linha vinda do delta por cima do estado local.
 *
 * O servidor é o árbitro: se ele mandou algo, o local perde. A exceção são as
 * edições que ainda não subiram — elas continuam visíveis por cima da versão
 * do servidor, senão o campo que o usuário acabou de digitar "volta" na tela
 * ao sincronizar, que é o pior sintoma possível de um app offline.
 */
export function reconciliarLinha(
  remota: LinhaSincronizavel,
  local: LinhaSincronizavel | undefined,
  pendentes: readonly PendenciaLocal[],
): Decisao {
  // Delta velho: o cliente já tem uma versão igual ou mais nova.
  if (local && local.row_version >= remota.row_version && pendentes.length === 0) {
    return { acao: 'ignorar' };
  }

  const apagadaNoServidor = remota.deleted_at !== null;
  const apagadaLocalmente = pendentes.some((p) => p.operacao === 'delete');

  if (apagadaNoServidor || apagadaLocalmente) {
    return { acao: 'remover', id: remota.id };
  }

  // As pendências entram na ordem em que foram enfileiradas: a última edição
  // de um campo é a que o usuário está vendo.
  const linha: LinhaSincronizavel = { ...remota };
  // Um delete pendente já saiu acima como 'remover', então aqui só há
  // create e update.
  for (const pendencia of pendentes) Object.assign(linha, pendencia.payload);

  return { acao: 'gravar', linha };
}

/**
 * Junta operações pendentes do mesmo registro num único patch.
 *
 * Trocar a carga de 80 para 82,5 e depois para 85 não precisa virar três
 * requisições — só o valor final importa. `create` absorve os updates
 * seguintes: um registro que nunca chegou ao servidor sobe uma vez só, já
 * com o conteúdo final.
 */
export function coalescerPendencias(
  pendentes: readonly PendenciaLocal[],
): PendenciaLocal | null {
  if (pendentes.length === 0) return null;

  // Um delete anula tudo que veio antes. Se o registro nem chegou a existir
  // no servidor (create pendente), não há o que enviar.
  const indiceDelete = pendentes.findIndex((p) => p.operacao === 'delete');
  if (indiceDelete !== -1) {
    const houveCreatePendente = pendentes
      .slice(0, indiceDelete)
      .some((p) => p.operacao === 'create');
    return houveCreatePendente ? null : { operacao: 'delete', payload: {} };
  }

  const operacao: Operacao = pendentes.some((p) => p.operacao === 'create')
    ? 'create'
    : 'update';

  const payload: Record<string, unknown> = {};
  for (const pendencia of pendentes) Object.assign(payload, pendencia.payload);

  return { operacao, payload };
}
