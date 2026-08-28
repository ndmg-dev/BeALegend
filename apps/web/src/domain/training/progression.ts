/**
 * Regra de progressão de carga — vem direto da planilha.
 *
 * "Quando alcançar o topo da faixa de repetições em todas as séries com
 * técnica boa e ainda 1–2 RIR, aumente a carga na próxima sessão. Se não
 * tiver anilha menor, aumente 1–2 repetições, desacelere a descida (3 s) ou
 * acrescente 1 série."
 *
 * Pura de propósito: chamada na tela de execução, testável sem montar
 * componente. É sugestão, nunca imposição — o executor mostra isto como um
 * chip descartável com um toque.
 */

export interface SetLogInput {
  numero_serie: number;
  reps: number;
  /** `null` em exercícios sem RIR aplicável (ex.: prancha). */
  rir: number | null;
}

export interface PlanItemInput {
  /** Quantas séries o plano pede — sem todas elas, não há dado suficiente. */
  series_min: number | null;
  /** Topo da faixa de reps (ou de segundos, para isométricos). */
  reps_max: number | null;
  /** RIR mínimo aceitável do plano. `null` = exercício sem RIR (isométrico). */
  rir_min: number | null;
}

export type Alternativa =
  | { tipo: 'mais_reps'; quantidade: 1 | 2 }
  | { tipo: 'descida_lenta'; segundos: 3 }
  | { tipo: 'mais_serie' };

export interface SuggestionAumentarCarga {
  tipo: 'aumentar_carga';
  /** kg a somar na próxima sessão. */
  incrementoKg: number;
  /** Para quando não há anilha menor disponível. */
  alternativas: readonly Alternativa[];
}

export type Suggestion = SuggestionAumentarCarga | null;

const ALTERNATIVAS_PADRAO: readonly Alternativa[] = [
  { tipo: 'mais_reps', quantidade: 1 },
  { tipo: 'mais_reps', quantidade: 2 },
  { tipo: 'descida_lenta', segundos: 3 },
  { tipo: 'mais_serie' },
];

/**
 * Sugere aumento de carga para a próxima sessão, ou não sugere nada.
 *
 * @param sets Séries desta sessão para o exercício, uma entrada por série.
 * @param item Faixas do plano para este exercício.
 * @param incrementoKg Quanto sugerir de aumento. O menor salto de anilha
 *   varia por casa/academia — por isso é parâmetro, não constante.
 */
export function suggestProgression(
  sets: readonly SetLogInput[],
  item: PlanItemInput,
  incrementoKg = 2,
): Suggestion {
  if (item.reps_max === null) return null;

  const seriesEsperadas = item.series_min ?? 1;
  if (sets.length < seriesEsperadas) return null;

  const todasNoTopo = sets.every((s) => s.reps >= (item.reps_max as number));
  if (!todasNoTopo) return null;

  // Exercício sem RIR alvo (isométrico como prancha): a regra de reps já basta.
  if (item.rir_min !== null) {
    const todasComRirSuficiente = sets.every((s) => s.rir !== null && s.rir >= item.rir_min!);
    if (!todasComRirSuficiente) return null;
  }

  return {
    tipo: 'aumentar_carga',
    incrementoKg,
    alternativas: ALTERNATIVAS_PADRAO,
  };
}
