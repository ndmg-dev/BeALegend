/**
 * Histórico de peso/medidas ao longo do tempo — o que a tela de peso mostra.
 * Pura: recebe os registros já filtrados por tipo, devolve pontos ordenados
 * e a variação entre o primeiro e o último.
 */

export interface RegistroCorporal {
  data: string;
  valor: number;
}

export function ordenarPorData(registros: readonly RegistroCorporal[]): RegistroCorporal[] {
  return [...registros].sort((a, b) => a.data.localeCompare(b.data));
}

/**
 * Variação entre o primeiro e o último ponto. `null` com menos de 2 pontos:
 * não há variação para mostrar, e diferença de zero pontos não é o mesmo
 * que "sem mudança".
 */
export function variacao(registros: readonly RegistroCorporal[]): number | null {
  const pontos = ordenarPorData(registros);
  if (pontos.length < 2) return null;
  const primeiro = pontos[0]?.valor ?? 0;
  const ultimo = pontos[pontos.length - 1]?.valor ?? 0;
  return Math.round((ultimo - primeiro) * 10) / 10;
}
