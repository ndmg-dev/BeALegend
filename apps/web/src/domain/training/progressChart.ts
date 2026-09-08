/**
 * Progresso de um exercício ao longo do tempo — o que a tela de gráfico
 * mostra. Pura: recebe as séries já filtradas por exercício, devolve um
 * ponto por sessão (dia civil, no fuso do usuário).
 *
 * "Sessão" aqui é o dia, não o `session_id`: duas sessões no mesmo dia civil
 * (raro, mas possível — refazer um treino) somam no mesmo ponto em vez de
 * duplicar o eixo X.
 */

import { toLocalDate, type LocalDate } from '@/domain/time/day';

export interface SetLogParaProgresso {
  concluido_em: string;
  reps: number;
  carga_kg: number;
}

export interface PontoDeProgresso {
  data: LocalDate;
  /** Maior carga levantada neste dia, para este exercício. */
  cargaMaxima: number;
  /** Soma de carga × reps de todas as séries do dia — o trabalho total feito. */
  volumeTotal: number;
}

export function progressoPorSessao(
  logs: readonly SetLogParaProgresso[],
  timezone: string,
): PontoDeProgresso[] {
  const porDia = new Map<LocalDate, { cargaMaxima: number; volumeTotal: number }>();

  for (const log of logs) {
    const dia = toLocalDate(new Date(log.concluido_em), timezone);
    const atual = porDia.get(dia) ?? { cargaMaxima: 0, volumeTotal: 0 };
    atual.cargaMaxima = Math.max(atual.cargaMaxima, log.carga_kg);
    atual.volumeTotal += log.carga_kg * log.reps;
    porDia.set(dia, atual);
  }

  return [...porDia.entries()]
    .map(([data, valores]) => ({ data, ...valores }))
    .sort((a, b) => a.data.localeCompare(b.data));
}

/**
 * Variação entre o primeiro e o último ponto — o número que a tela destaca
 * ("+12,5 kg desde o início"). `null` com menos de 2 pontos: não há variação
 * para mostrar, e diferença de zero pontos não é o mesmo que "sem progresso".
 */
export function variacaoDeCarga(pontos: readonly PontoDeProgresso[]): number | null {
  if (pontos.length < 2) return null;
  const primeiro = pontos[0]?.cargaMaxima ?? 0;
  const ultimo = pontos[pontos.length - 1]?.cargaMaxima ?? 0;
  return ultimo - primeiro;
}
