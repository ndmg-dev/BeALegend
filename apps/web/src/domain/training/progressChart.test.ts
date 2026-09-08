import { describe, expect, it } from 'vitest';
import { progressoPorSessao, variacaoDeCarga, variacaoDeVolume } from './progressChart';

const TZ = 'America/Sao_Paulo';

describe('progressoPorSessao', () => {
  it('agrupa séries do mesmo dia num único ponto', () => {
    const pontos = progressoPorSessao(
      [
        { concluido_em: '2026-01-05T14:00:00Z', reps: 10, carga_kg: 80 },
        { concluido_em: '2026-01-05T14:05:00Z', reps: 8, carga_kg: 85 },
      ],
      TZ,
    );
    expect(pontos).toHaveLength(1);
    expect(pontos[0]?.cargaMaxima).toBe(85);
    expect(pontos[0]?.volumeTotal).toBe(10 * 80 + 8 * 85);
  });

  it('ordena os pontos cronologicamente', () => {
    const pontos = progressoPorSessao(
      [
        { concluido_em: '2026-01-12T14:00:00Z', reps: 10, carga_kg: 90 },
        { concluido_em: '2026-01-05T14:00:00Z', reps: 10, carga_kg: 80 },
      ],
      TZ,
    );
    expect(pontos.map((p) => p.data)).toEqual(['2026-01-05', '2026-01-12']);
  });

  it('lista vazia devolve lista vazia', () => {
    expect(progressoPorSessao([], TZ)).toEqual([]);
  });

  it('respeita o fuso ao decidir o dia civil', () => {
    // 23h de 5/jan em Brasília (UTC-3) ainda é 5/jan, não 6/jan.
    const pontos = progressoPorSessao(
      [{ concluido_em: '2026-01-06T01:30:00Z', reps: 5, carga_kg: 50 }],
      TZ,
    );
    expect(pontos[0]?.data).toBe('2026-01-05');
  });
});

describe('variacaoDeCarga', () => {
  it('null com menos de dois pontos', () => {
    expect(variacaoDeCarga([])).toBeNull();
    expect(variacaoDeCarga([{ data: '2026-01-01', cargaMaxima: 80, volumeTotal: 800 }])).toBeNull();
  });

  it('diferença entre o primeiro e o último ponto', () => {
    const pontos = [
      { data: '2026-01-01', cargaMaxima: 80, volumeTotal: 800 },
      { data: '2026-01-08', cargaMaxima: 85, volumeTotal: 850 },
      { data: '2026-01-15', cargaMaxima: 92.5, volumeTotal: 900 },
    ];
    expect(variacaoDeCarga(pontos)).toBeCloseTo(12.5);
  });

  it('pode ser negativa (carga caiu)', () => {
    const pontos = [
      { data: '2026-01-01', cargaMaxima: 90, volumeTotal: 900 },
      { data: '2026-01-08', cargaMaxima: 80, volumeTotal: 800 },
    ];
    expect(variacaoDeCarga(pontos)).toBe(-10);
  });
});

describe('variacaoDeVolume', () => {
  it('null com menos de dois pontos', () => {
    expect(variacaoDeVolume([])).toBeNull();
    expect(variacaoDeVolume([{ data: '2026-01-01', cargaMaxima: 80, volumeTotal: 800 }])).toBeNull();
  });

  it('diferença de volume entre o primeiro e o último ponto', () => {
    const pontos = [
      { data: '2026-01-01', cargaMaxima: 80, volumeTotal: 800 },
      { data: '2026-01-08', cargaMaxima: 85, volumeTotal: 1200 },
    ];
    expect(variacaoDeVolume(pontos)).toBe(400);
  });

  it('carga e volume variam de forma independente', () => {
    // Menos carga, mais reps: volume sobe mesmo com a carga caindo.
    const pontos = [
      { data: '2026-01-01', cargaMaxima: 100, volumeTotal: 1000 },
      { data: '2026-01-08', cargaMaxima: 90, volumeTotal: 1080 },
    ];
    expect(variacaoDeCarga(pontos)).toBe(-10);
    expect(variacaoDeVolume(pontos)).toBe(80);
  });
});
