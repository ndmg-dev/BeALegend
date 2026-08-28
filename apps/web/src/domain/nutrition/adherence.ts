export type Adherence = 'dentro' | 'parcial' | 'fora';

export interface AdherenceSummary {
  total: number;
  dentro: number;
  parcial: number;
  fora: number;
  percentual: number;
}

/** Parcial vale meio ponto; sem registros a aderência é zero, não 100%. */
export function summarizeAdherence(values: readonly Adherence[]): AdherenceSummary {
  const dentro = values.filter((value) => value === 'dentro').length;
  const parcial = values.filter((value) => value === 'parcial').length;
  const fora = values.filter((value) => value === 'fora').length;
  const total = values.length;
  const percentual = total === 0 ? 0 : Math.round(((dentro + parcial * 0.5) / total) * 100);
  return { total, dentro, parcial, fora, percentual };
}

export function totalWater(logs: readonly { ml: number }[]): number {
  return logs.reduce((total, log) => total + Math.max(0, log.ml), 0);
}
