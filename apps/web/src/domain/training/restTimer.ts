/**
 * Contagem regressiva do descanso — lógica pura, sem `setInterval` nem DOM.
 *
 * O componente React só chama `tick` a cada segundo e lê o resultado; testar
 * "quando o timer termina" não deveria exigir montar um timer de verdade.
 */

export interface EstadoRestTimer {
  restanteSeg: number;
  concluido: boolean;
}

export function iniciarRestTimer(duracaoSeg: number): EstadoRestTimer {
  return { restanteSeg: Math.max(0, duracaoSeg), concluido: duracaoSeg <= 0 };
}

export function tick(estado: EstadoRestTimer): EstadoRestTimer {
  if (estado.concluido) return estado;
  const restante = estado.restanteSeg - 1;
  return restante <= 0 ? { restanteSeg: 0, concluido: true } : { restanteSeg: restante, concluido: false };
}

/** "1:05" — o formato do relógio do descanso. */
export function formatarTempo(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
