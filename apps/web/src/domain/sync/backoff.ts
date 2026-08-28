/**
 * Backoff exponencial da drenagem da outbox.
 *
 * Puro de propósito: a regra de "quando tentar de novo" é o que decide se um
 * servidor fora do ar recebe uma tentativa por minuto ou mil por segundo, e
 * isso precisa ser testável sem relógio, sem rede e sem Dexie.
 */

/** Primeira espera, em ms. Curta: a maioria das falhas é rede momentânea. */
export const BASE_DELAY_MS = 1_000;

/** Teto da espera. Além disso o app já está esperando o usuário voltar. */
export const MAX_DELAY_MS = 5 * 60 * 1_000;

/**
 * Depois disto, o item para de ser retentado sozinho e é marcado para
 * inspeção. Uma operação que falhou 10 vezes não vai passar na 11ª — é
 * payload inválido ou bug, e ficar tentando só esconde o problema.
 */
export const MAX_TENTATIVAS = 10;

/**
 * Espera antes da próxima tentativa, com jitter determinístico.
 *
 * O jitter evita que todos os itens da fila voltem no mesmo milissegundo
 * quando a rede retorna. Ele vem de `seed` em vez de `Math.random()` para a
 * função continuar pura — quem chama passa algo estável por item, como um
 * hash do id local. Sem `seed`, não há jitter: o valor é a espera nominal.
 */
export function nextRetryDelay(tentativas: number, seed?: number): number {
  if (tentativas <= 0) return 0;

  const exponencial = BASE_DELAY_MS * 2 ** (tentativas - 1);
  const teto = Math.min(exponencial, MAX_DELAY_MS);
  if (seed === undefined) return teto;

  // Jitter de até ±20%, derivado do seed.
  const fracao = ((Math.abs(seed) % 1000) / 1000) * 0.4 - 0.2;
  return Math.max(0, Math.round(teto * (1 + fracao)));
}

/** `true` quando o item já pode ser tentado de novo. */
export function podeTentar(
  tentativas: number,
  ultimaTentativaEm: number | null,
  agora: number,
  seed?: number,
): boolean {
  if (tentativas >= MAX_TENTATIVAS) return false;
  if (tentativas === 0 || ultimaTentativaEm === null) return true;
  return agora - ultimaTentativaEm >= nextRetryDelay(tentativas, seed);
}

/** Um item que estourou o limite de tentativas precisa de olho humano. */
export function precisaDeAtencao(tentativas: number): boolean {
  return tentativas >= MAX_TENTATIVAS;
}

export interface ItemComTentativas {
  tentativas: number;
  ultima_tentativa_em: number | null;
  /** Semente estável do jitter — o instante em que o item entrou na fila. */
  criado_em: number;
}

/**
 * Quantos ms faltam até o próximo item da fila poder ser tentado.
 *
 * `null` quando não há nada esperando. Sem isto o backoff seria decorativo: a
 * drenagem só roda em gatilho externo (rede, foco, intervalo de 5 min), então
 * um item que falhou com espera de 1s ficaria parado até o próximo gatilho.
 */
export function msAteProximaTentativa(
  itens: readonly ItemComTentativas[],
  agora: number,
): number | null {
  let menor: number | null = null;

  for (const item of itens) {
    if (precisaDeAtencao(item.tentativas)) continue;

    const ultima = item.ultima_tentativa_em;
    if (ultima === null || podeTentar(item.tentativas, ultima, agora, item.criado_em)) return 0;

    // podeTentar acabou de dizer que a janela não venceu, então isto é > 0.
    const falta = ultima + nextRetryDelay(item.tentativas, item.criado_em) - agora;
    if (menor === null || falta < menor) menor = falta;
  }

  return menor;
}

/**
 * Erro do servidor que não adianta retentar.
 *
 * 4xx é o cliente que está errado — payload inválido, entidade desconhecida,
 * linha que não existe. Reenviar produz o mesmo 4xx para sempre e entope a
 * fila. 408 e 429 são as exceções: são "tente de novo", não "você errou".
 */
export function ehErroPermanente(status: number): boolean {
  if (status === 408 || status === 429) return false;
  return status >= 400 && status < 500;
}
