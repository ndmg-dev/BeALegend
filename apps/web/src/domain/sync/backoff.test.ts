import { describe, expect, it } from 'vitest';
import {
  BASE_DELAY_MS,
  MAX_DELAY_MS,
  MAX_TENTATIVAS,
  ehErroPermanente,
  msAteProximaTentativa,
  nextRetryDelay,
  podeTentar,
  precisaDeAtencao,
} from './backoff';

describe('nextRetryDelay', () => {
  it('não espera antes da primeira tentativa', () => {
    expect(nextRetryDelay(0)).toBe(0);
  });

  it('dobra a cada tentativa', () => {
    expect(nextRetryDelay(1)).toBe(BASE_DELAY_MS);
    expect(nextRetryDelay(2)).toBe(BASE_DELAY_MS * 2);
    expect(nextRetryDelay(3)).toBe(BASE_DELAY_MS * 4);
  });

  it('para de crescer no teto', () => {
    expect(nextRetryDelay(50)).toBeLessThanOrEqual(MAX_DELAY_MS);
    expect(nextRetryDelay(50)).toBe(MAX_DELAY_MS);
  });

  it('espalha as tentativas com jitter de até ±20%', () => {
    const base = nextRetryDelay(5);
    const comJitter = [1, 250, 500, 750, 999].map((seed) => nextRetryDelay(5, seed));

    for (const valor of comJitter) {
      expect(valor).toBeGreaterThanOrEqual(base * 0.8);
      expect(valor).toBeLessThanOrEqual(base * 1.2);
    }
    // Seeds diferentes não podem cair todos no mesmo milissegundo.
    expect(new Set(comJitter).size).toBeGreaterThan(1);
  });

  it('é determinístico: mesmo seed, mesma espera', () => {
    expect(nextRetryDelay(4, 123)).toBe(nextRetryDelay(4, 123));
  });

  it('nunca devolve espera negativa', () => {
    for (let t = 0; t <= 12; t += 1) {
      expect(nextRetryDelay(t)).toBeGreaterThanOrEqual(0);
      expect(nextRetryDelay(t, 0)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('podeTentar', () => {
  it('libera a primeira tentativa na hora', () => {
    expect(podeTentar(0, null, 1_000)).toBe(true);
  });

  it('segura enquanto a espera não venceu', () => {
    expect(podeTentar(1, 1_000, 1_000 + BASE_DELAY_MS - 1)).toBe(false);
  });

  it('libera quando a espera venceu', () => {
    expect(podeTentar(1, 1_000, 1_000 + BASE_DELAY_MS)).toBe(true);
  });

  it('desiste depois do limite de tentativas', () => {
    expect(podeTentar(MAX_TENTATIVAS, 0, Number.MAX_SAFE_INTEGER)).toBe(false);
  });
});

describe('precisaDeAtencao', () => {
  it('só marca o item que esgotou as tentativas', () => {
    expect(precisaDeAtencao(MAX_TENTATIVAS - 1)).toBe(false);
    expect(precisaDeAtencao(MAX_TENTATIVAS)).toBe(true);
  });
});

describe('ehErroPermanente', () => {
  it('não retenta erro do cliente', () => {
    expect(ehErroPermanente(400)).toBe(true);
    expect(ehErroPermanente(404)).toBe(true);
    expect(ehErroPermanente(422)).toBe(true);
  });

  it('retenta timeout e rate limit — são "tente de novo", não "você errou"', () => {
    expect(ehErroPermanente(408)).toBe(false);
    expect(ehErroPermanente(429)).toBe(false);
  });

  it('retenta erro do servidor', () => {
    expect(ehErroPermanente(500)).toBe(false);
    expect(ehErroPermanente(503)).toBe(false);
  });
});

describe('msAteProximaTentativa', () => {
  const item = (over: Partial<Parameters<typeof msAteProximaTentativa>[0][number]> = {}) => ({
    tentativas: 0,
    ultima_tentativa_em: null,
    criado_em: 0,
    ...over,
  });

  it('devolve null com a fila vazia', () => {
    expect(msAteProximaTentativa([], 1_000)).toBeNull();
  });

  it('devolve 0 quando algum item já pode ir', () => {
    expect(msAteProximaTentativa([item()], 1_000)).toBe(0);
  });

  it('devolve o que falta do item mais próximo', () => {
    const agora = 10_000;
    const espera = nextRetryDelay(1, 0);
    const itens = [
      item({ tentativas: 1, ultima_tentativa_em: agora - 100 }),
      item({ tentativas: 3, ultima_tentativa_em: agora - 100 }),
    ];
    expect(msAteProximaTentativa(itens, agora)).toBe(espera - 100);
  });

  it('ignora item que já esgotou as tentativas', () => {
    const itens = [item({ tentativas: MAX_TENTATIVAS, ultima_tentativa_em: 0 })];
    expect(msAteProximaTentativa(itens, 1_000)).toBeNull();
  });

  it('item cuja janela venceu há muito tempo vai imediatamente', () => {
    const itens = [item({ tentativas: 2, ultima_tentativa_em: 0 })];
    expect(msAteProximaTentativa(itens, Number.MAX_SAFE_INTEGER)).toBe(0);
  });
});
