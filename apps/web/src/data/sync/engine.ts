import { z } from 'zod';
import { request } from '@/data/api/client';
import { ApiError, NetworkError } from '@/data/api/problem';
import {
  META_CURSOR,
  META_ULTIMO_SYNC,
  achievementUnlockSchema,
  accountSchema,
  budgetSchema,
  categorySchema,
  cardioProtocolSchema,
  db,
  exerciseSchema,
  planDaySchema,
  planItemSchema,
  financeTransactionSchema,
  goalSchema,
  habitCheckinSchema,
  habitSchema,
  mealLogSchema,
  mealPlanSchema,
  mealSlotSchema,
  recurringSchema,
  sessionSchema,
  setLogSchema,
  trainingPlanSchema,
  waterLogSchema,
} from '@/data/db/schema';
import { ehErroPermanente, msAteProximaTentativa, podeTentar } from '@/domain/sync/backoff';
import { reconciliarLinha, type LinhaSincronizavel } from '@/domain/sync/reconcile';
import { isOnline } from '@/platform/network';
import * as outbox from './outbox';

/**
 * Motor de sincronização.
 *
 * Empurra a outbox quando há rede e puxa o delta no foco do app e a cada 5
 * min. Nunca bloqueia a UI: se falhar, o dado continua no Dexie e a fila
 * espera a próxima janela.
 */

const syncResultSchema = z.object({
  idempotency_key: z.string(),
  status: z.enum(['applied', 'duplicate', 'rejected']),
  entidade: z.string(),
  id: z.string().uuid(),
  entity: z.record(z.unknown()).nullable(),
  problem: z.object({ title: z.string(), detail: z.string().nullable() }).nullable(),
});

const batchResponseSchema = z.object({
  results: z.array(syncResultSchema),
  cursor: z.number(),
});

const deltaSchema = z.object({
  cursor: z.number(),
  changes: z.record(z.array(z.record(z.unknown()))),
  has_more: z.boolean(),
  server_time: z.string(),
});

/** Schemas por entidade — o dado do servidor é validado antes de tocar o Dexie. */
const SCHEMAS = {
  exercise: exerciseSchema,
  training_plan: trainingPlanSchema,
  plan_day: planDaySchema,
  plan_item: planItemSchema,
  cardio_protocol: cardioProtocolSchema,
  session: sessionSchema,
  set_log: setLogSchema,
  account: accountSchema,
  category: categorySchema,
  recurring: recurringSchema,
  transaction: financeTransactionSchema,
  budget: budgetSchema,
  meal_plan: mealPlanSchema,
  meal_slot: mealSlotSchema,
  meal_log: mealLogSchema,
  water_log: waterLogSchema,
  habit: habitSchema,
  habit_checkin: habitCheckinSchema,
  goal: goalSchema,
  achievement_unlock: achievementUnlockSchema,
} as const;
type EntidadeConhecida = keyof typeof SCHEMAS;

const TABELAS = {
  exercise: db.exercise,
  training_plan: db.training_plan,
  plan_day: db.plan_day,
  plan_item: db.plan_item,
  cardio_protocol: db.cardio_protocol,
  session: db.session,
  set_log: db.set_log,
  account: db.account,
  category: db.category,
  recurring: db.recurring,
  transaction: db.finance_transaction,
  budget: db.budget,
  meal_plan: db.meal_plan,
  meal_slot: db.meal_slot,
  meal_log: db.meal_log,
  water_log: db.water_log,
  habit: db.habit,
  habit_checkin: db.habit_checkin,
  goal: db.goal,
  achievement_unlock: db.achievement_unlock,
} as const;

function ehEntidadeConhecida(nome: string): nome is EntidadeConhecida {
  return nome in SCHEMAS;
}

export const INTERVALO_PULL_MS = 5 * 60 * 1000;

export interface EstadoSync {
  emAndamento: boolean;
  pendentes: number;
  ultimoSyncEm: number | null;
  ultimoErro: string | null;
}

type Ouvinte = (estado: EstadoSync) => void;

let estado: EstadoSync = {
  emAndamento: false,
  pendentes: 0,
  ultimoSyncEm: null,
  ultimoErro: null,
};
const ouvintes = new Set<Ouvinte>();

function publicar(parcial: Partial<EstadoSync>): void {
  estado = { ...estado, ...parcial };
  for (const ouvinte of ouvintes) ouvinte(estado);
}

export function observarSync(ouvinte: Ouvinte): () => void {
  ouvintes.add(ouvinte);
  ouvinte(estado);
  return () => ouvintes.delete(ouvinte);
}

export function estadoAtual(): EstadoSync {
  return estado;
}

async function lerCursor(): Promise<number> {
  const entrada = await db.meta.get(META_CURSOR);
  return typeof entrada?.valor === 'number' ? entrada.valor : 0;
}

async function gravarCursor(cursor: number): Promise<void> {
  await db.meta.put({ chave: META_CURSOR, valor: cursor });
}

// ---------------------------------------------------------------------------
// push
// ---------------------------------------------------------------------------

/**
 * Drena a fila. Devolve quantas operações o servidor confirmou.
 *
 * Um item só sai da fila quando o servidor diz o que aconteceu com ele —
 * `duplicate` conta como sucesso, porque significa que já estava lá.
 * `rejected` com erro permanente também sai: reenviar produziria o mesmo 4xx
 * para sempre e a fila entupiria atrás dele.
 */
export async function empurrar(): Promise<number> {
  const agora = Date.now();
  const fila = await outbox.pendentes();
  const prontos = fila.filter((item) =>
    podeTentar(item.tentativas, item.ultima_tentativa_em, agora, item.criado_em),
  );
  if (prontos.length === 0) return 0;

  const { envios, descartar } = outbox.agrupar(prontos);
  if (descartar.length > 0) await outbox.remover(descartar);
  if (envios.length === 0) return 0;

  const operations = envios.map((envio) => ({
    idempotency_key: envio.idempotencyKey,
    entidade: envio.entidade,
    operacao: envio.operacao,
    id: envio.registroId,
    payload: envio.payload,
  }));

  let resposta;
  try {
    resposta = await request('/sync/batch', {
      method: 'POST',
      body: { operations },
      schema: batchResponseSchema,
    });
  } catch (erro) {
    const permanente = erro instanceof ApiError && ehErroPermanente(erro.status);
    const mensagem = erro instanceof Error ? erro.message : String(erro);

    // Erro permanente no lote inteiro (401, 422 de forma) não é culpa de um
    // item específico: conta tentativa e deixa o backoff segurar.
    await outbox.registrarFalha(
      envios.flatMap((e) => e.idsLocais),
      mensagem,
    );
    publicar({ ultimoErro: mensagem, pendentes: await outbox.quantidadePendente() });
    if (permanente || erro instanceof NetworkError) return 0;
    throw erro;
  }

  const porChave = new Map(resposta.results.map((r) => [r.idempotency_key, r]));
  const resolvidos: string[] = [];
  const falhos: string[] = [];
  const confirmadas: typeof resposta.results = [];

  for (const envio of envios) {
    const resultado = porChave.get(envio.idempotencyKey);
    if (!resultado) {
      falhos.push(...envio.idsLocais);
      continue;
    }

    if (resultado.status === 'rejected') {
      // O servidor recusou o conteúdo. Retentar não muda nada — o item sai da
      // fila para não travar o resto, e o erro fica registrado.
      console.warn('[sync] operação rejeitada', envio.entidade, resultado.problem);
      resolvidos.push(...envio.idsLocais);
      continue;
    }

    resolvidos.push(...envio.idsLocais);
    confirmadas.push(resultado);
  }

  await outbox.remover(resolvidos);
  if (falhos.length > 0) {
    await outbox.registrarFalha(falhos, 'Servidor não devolveu resultado para esta operação.');
  }

  // A resposta já traz a linha como o servidor a enxerga — inclusive o
  // row_version. Gravá-la aqui é o que tira o registro do estado "não
  // enviado" sem esperar o próximo delta. O cursor NÃO avança por conta
  // disto: quem avança o cursor é o pull, senão o cliente pularia as
  // escritas dos outros dispositivos feitas no mesmo intervalo.
  await aplicarEntidades(confirmadas);

  publicar({ pendentes: await outbox.quantidadePendente(), ultimoErro: null });
  return confirmadas.length;
}

/** Grava no Dexie as linhas que o servidor devolveu ao confirmar o push. */
async function aplicarEntidades(
  resultados: readonly z.infer<typeof syncResultSchema>[],
): Promise<void> {
  const pendencias = await outbox.pendenciasPorRegistro();

  for (const resultado of resultados) {
    if (!resultado.entity || !ehEntidadeConhecida(resultado.entidade)) continue;

    const validada = SCHEMAS[resultado.entidade].safeParse(resultado.entity);
    if (!validada.success) {
      console.warn('[sync] resposta inválida descartada', validada.error.issues);
      continue;
    }

    const tabela = TABELAS[resultado.entidade];
    const remota = validada.data as unknown as LinhaSincronizavel;
    const local = (await tabela.get(remota.id)) as unknown as LinhaSincronizavel | undefined;
    const decisao = reconciliarLinha(remota, local, pendencias.get(remota.id) ?? []);

    if (decisao.acao === 'gravar') await tabela.put(decisao.linha as never);
    else if (decisao.acao === 'remover') await tabela.delete(remota.id);
  }
}

// ---------------------------------------------------------------------------
// pull
// ---------------------------------------------------------------------------

/** Puxa o delta e o grava no Dexie, preservando o que ainda não subiu. */
export async function puxar(): Promise<number> {
  let cursor = await lerCursor();
  let aplicadas = 0;
  let continuar = true;

  while (continuar) {
    const delta = await request(`/sync?since=${cursor}`, { schema: deltaSchema });
    const pendencias = await outbox.pendenciasPorRegistro();

    for (const [entidade, linhas] of Object.entries(delta.changes)) {
      if (!ehEntidadeConhecida(entidade)) {
        // Uma versão nova do servidor pode mandar entidade que este cliente
        // ainda não conhece. Ignorar é melhor do que quebrar o sync inteiro.
        console.warn('[sync] entidade desconhecida no delta:', entidade);
        continue;
      }

      const tabela = TABELAS[entidade];
      const schema = SCHEMAS[entidade];

      await db.transaction('rw', tabela, async () => {
        for (const bruta of linhas) {
          const validada = schema.safeParse(bruta);
          if (!validada.success) {
            console.warn('[sync] linha inválida descartada', entidade, validada.error.issues);
            continue;
          }

          const remota = validada.data as unknown as LinhaSincronizavel;
          const local = (await tabela.get(remota.id)) as unknown as LinhaSincronizavel | undefined;
          const decisao = reconciliarLinha(remota, local, pendencias.get(remota.id) ?? []);

          if (decisao.acao === 'gravar') {
            await tabela.put(decisao.linha as never);
            aplicadas += 1;
          } else if (decisao.acao === 'remover') {
            await tabela.delete(remota.id);
            aplicadas += 1;
          }
        }
      });
    }

    cursor = delta.cursor;
    await gravarCursor(cursor);
    continuar = delta.has_more;
  }

  await db.meta.put({ chave: META_ULTIMO_SYNC, valor: Date.now() });
  publicar({ ultimoSyncEm: Date.now() });
  return aplicadas;
}

// ---------------------------------------------------------------------------
// ciclo
// ---------------------------------------------------------------------------

let emAndamento: Promise<void> | null = null;
let timerRetentativa: number | null = null;

/**
 * Marca o relógio para a próxima janela de retentativa.
 *
 * Os gatilhos externos (rede, foco, intervalo) são esparsos demais para o
 * backoff — sem este agendamento, um item que falhou com espera de 1s ficaria
 * parado até o próximo foco do app.
 */
async function agendarRetentativa(): Promise<void> {
  if (timerRetentativa !== null) {
    window.clearTimeout(timerRetentativa);
    timerRetentativa = null;
  }

  const fila = await outbox.pendentes();
  const falta = msAteProximaTentativa(fila, Date.now());
  if (falta === null) return;

  timerRetentativa = window.setTimeout(
    () => {
      timerRetentativa = null;
      void sincronizar();
    },
    Math.max(falta, 250),
  );
}

/**
 * Um ciclo completo: empurra e depois puxa.
 *
 * Push antes de pull: assim o delta já volta com o que este dispositivo
 * acabou de mandar, e a reconciliação acontece uma vez só.
 */
export async function sincronizar(): Promise<void> {
  if (!isOnline()) return;

  // Uma sincronização por vez. Foco e reconexão podem disparar juntos.
  emAndamento ??= (async () => {
    publicar({ emAndamento: true });
    try {
      await empurrar();
      await puxar();
      publicar({ ultimoErro: null });
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      if (!(erro instanceof NetworkError)) console.warn('[sync] ciclo falhou', erro);
      publicar({ ultimoErro: mensagem });
    } finally {
      publicar({ emAndamento: false, pendentes: await outbox.quantidadePendente() });
      emAndamento = null;
      await agendarRetentativa();
    }
  })();

  return emAndamento;
}

/**
 * Liga os gatilhos de sync. Devolve a função que os desliga.
 *
 * iOS não tem background sync, então não há worker de fundo: o app sincroniza
 * quando está na frente do usuário — ao voltar a rede, ao focar, e num
 * intervalo enquanto aberto.
 */
export function iniciarSync(): () => void {
  const disparar = (): void => {
    void sincronizar();
  };

  const aoFocar = (): void => {
    if (document.visibilityState === 'visible') disparar();
  };

  window.addEventListener('online', disparar);
  document.addEventListener('visibilitychange', aoFocar);
  const intervalo = window.setInterval(disparar, INTERVALO_PULL_MS);

  disparar();

  return () => {
    window.removeEventListener('online', disparar);
    document.removeEventListener('visibilitychange', aoFocar);
    window.clearInterval(intervalo);
    if (timerRetentativa !== null) window.clearTimeout(timerRetentativa);
  };
}
