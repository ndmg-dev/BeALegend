import { describe, expect, it } from 'vitest';
import { summarizeAdherence, totalWater } from './adherence';

describe('summarizeAdherence', () => {
  it('conta estados e dá meio ponto para parcial', () => {
    expect(summarizeAdherence(['dentro', 'parcial', 'fora', 'dentro'])).toEqual({
      total: 4, dentro: 2, parcial: 1, fora: 1, percentual: 63,
    });
  });

  it('sem refeições não inventa aderência', () => {
    expect(summarizeAdherence([]).percentual).toBe(0);
  });
});

describe('totalWater', () => {
  it('soma os registros e ignora valor negativo corrompido', () => {
    expect(totalWater([{ ml: 250 }, { ml: 500 }, { ml: -10 }])).toBe(750);
  });
});
