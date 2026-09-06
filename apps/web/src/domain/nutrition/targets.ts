/**
 * Metas diárias — o que a planilha calculava no Painel.
 *
 * A régua é derivada, não digitada: a planilha guarda *parâmetros* (g/kg,
 * fator de atividade, ajuste calórico) e o peso vem do registro corporal mais
 * recente. Assim a meta acompanha o peso sozinha, em vez de envelhecer numa
 * célula.
 *
 * O ponto delicado é o que fazer quando falta dado. Proteína e gordura só
 * precisam do peso. A meta calórica precisa do metabolismo basal, que pela
 * Mifflin-St Jeor exige também sexo, idade e altura — dados que o cadastro do
 * app não coleta. Quando faltam, o campo volta `null` e a tela mostra o
 * parâmetro ("1,8 g/kg") em vez de um número inventado: uma meta calórica
 * errada faz o usuário comer errado com confiança.
 */

/**
 * Só os campos de que o cálculo precisa. `domain/` não importa de `data/`,
 * então o contrato mora aqui e a linha do Dexie o satisfaz estruturalmente.
 */
export interface ParametrosDeMeta {
  proteina_g_kg: number;
  gordura_g_kg: number;
  fibra_g_por_1000kcal: number;
  fator_atividade: number;
  ajuste_calorico: number;
  manutencao_kcal_manual: number | null;
  sexo: 'M' | 'F' | null;
  idade: number | null;
  altura_cm: number | null;
}

export interface MetasDiarias {
  kcal: number | null;
  proteina_g: number | null;
  gordura_g: number | null;
  carboidrato_g: number | null;
  fibra_g: number | null;
  /** O que impede o cálculo completo — a tela usa para explicar a lacuna. */
  faltando: readonly ('peso' | 'sexo' | 'idade' | 'altura')[];
}

/**
 * Mifflin-St Jeor: a estimativa de metabolismo basal mais usada na prática
 * clínica. É estimativa — a manutenção real medida por histórico de peso
 * ganha dela, e é por isso que `manutencao_kcal_manual` tem prioridade.
 */
function metabolismoBasal(
  sexo: 'M' | 'F',
  pesoKg: number,
  alturaCm: number,
  idade: number,
): number {
  const base = 10 * pesoKg + 6.25 * alturaCm - 5 * idade;
  return sexo === 'M' ? base + 5 : base - 161;
}

export function calcularMetas(
  meta: ParametrosDeMeta | null,
  pesoKg: number | null,
): MetasDiarias {
  const vazio: MetasDiarias = {
    kcal: null, proteina_g: null, gordura_g: null,
    carboidrato_g: null, fibra_g: null, faltando: [],
  };
  if (!meta) return vazio;

  const faltando: ('peso' | 'sexo' | 'idade' | 'altura')[] = [];
  if (pesoKg === null) faltando.push('peso');

  // Proteína e gordura saem só do peso.
  const proteina_g = pesoKg === null ? null : Math.round(pesoKg * meta.proteina_g_kg);
  const gordura_g = pesoKg === null ? null : Math.round(pesoKg * meta.gordura_g_kg);

  // Calorias: manutenção real informada vence a estimativa por fórmula.
  let manutencao: number | null = meta.manutencao_kcal_manual;
  if (manutencao === null) {
    if (!meta.sexo) faltando.push('sexo');
    if (meta.idade === null) faltando.push('idade');
    if (meta.altura_cm === null) faltando.push('altura');
    if (pesoKg !== null && meta.sexo && meta.idade !== null && meta.altura_cm !== null) {
      manutencao = metabolismoBasal(meta.sexo, pesoKg, meta.altura_cm, meta.idade)
        * meta.fator_atividade;
    }
  }

  const kcal = manutencao === null ? null : Math.round(manutencao * (1 + meta.ajuste_calorico));
  const fibra_g = kcal === null ? null : Math.round((kcal / 1000) * meta.fibra_g_por_1000kcal);

  // Carboidrato é o resto: o que sobra das calorias depois de fechar proteína
  // e gordura, que são as metas com alvo próprio. 4 kcal/g em proteína e
  // carboidrato, 9 kcal/g em gordura.
  let carboidrato_g: number | null = null;
  if (kcal !== null && proteina_g !== null && gordura_g !== null) {
    const restante = kcal - proteina_g * 4 - gordura_g * 9;
    carboidrato_g = restante > 0 ? Math.round(restante / 4) : 0;
  }

  return { kcal, proteina_g, gordura_g, carboidrato_g, fibra_g, faltando };
}

export interface Macros {
  kcal: number;
  proteina_g: number;
  carboidrato_g: number;
  gordura_g: number;
  fibra_g: number;
}

const ZERO: Macros = { kcal: 0, proteina_g: 0, carboidrato_g: 0, gordura_g: 0, fibra_g: 0 };

/** Macros de uma porção. A base é por 100 g, então a regra de três é aqui. */
export function macrosDaPorcao(
  alimento: Pick<Macros, keyof Macros>,
  quantidadeG: number,
): Macros {
  const fator = quantidadeG / 100;
  return {
    kcal: alimento.kcal * fator,
    proteina_g: alimento.proteina_g * fator,
    carboidrato_g: alimento.carboidrato_g * fator,
    gordura_g: alimento.gordura_g * fator,
    fibra_g: alimento.fibra_g * fator,
  };
}

export function somarMacros(porcoes: readonly Macros[]): Macros {
  return porcoes.reduce(
    (total, item) => ({
      kcal: total.kcal + item.kcal,
      proteina_g: total.proteina_g + item.proteina_g,
      carboidrato_g: total.carboidrato_g + item.carboidrato_g,
      gordura_g: total.gordura_g + item.gordura_g,
      fibra_g: total.fibra_g + item.fibra_g,
    }),
    ZERO,
  );
}
