import { describe, expect, it } from 'vitest';
import { calcularMetas, macrosDaPorcao, somarMacros, type ParametrosDeMeta } from './targets';

/** Os parâmetros que a planilha de dieta traz preenchidos. */
const META: ParametrosDeMeta = {
  proteina_g_kg: 1.8,
  gordura_g_kg: 0.8,
  fibra_g_por_1000kcal: 14,
  fator_atividade: 1.55,
  ajuste_calorico: 0.03,
  manutencao_kcal_manual: null,
  sexo: null,
  idade: null,
  altura_cm: null,
};

describe('calcularMetas', () => {
  it('deriva proteína e gordura do peso, mesmo sem os dados de metabolismo', () => {
    const metas = calcularMetas(META, 80);
    expect(metas.proteina_g).toBe(144); // 80 × 1,8
    expect(metas.gordura_g).toBe(64); //  80 × 0,8
  });

  it('não inventa meta calórica quando falta sexo, idade ou altura', () => {
    const metas = calcularMetas(META, 80);
    expect(metas.kcal).toBeNull();
    expect(metas.carboidrato_g).toBeNull();
    expect(metas.fibra_g).toBeNull();
    expect(metas.faltando).toEqual(['sexo', 'idade', 'altura']);
  });

  it('fecha a meta calórica quando o perfil está completo', () => {
    // Mifflin-St Jeor: 10×80 + 6,25×178 − 5×30 + 5 = 1767,5 kcal de basal.
    // × 1,55 de atividade = 2739,63 de manutenção; +3% = 2821,81 → 2822.
    const metas = calcularMetas({ ...META, sexo: 'M', idade: 30, altura_cm: 178 }, 80);
    expect(metas.kcal).toBe(2822);
    expect(metas.fibra_g).toBe(40); // 2,822 × 14 = 39,5 → 40
    expect(metas.faltando).toEqual([]);
  });

  it('manutenção informada tem prioridade sobre a estimativa da fórmula', () => {
    const metas = calcularMetas({ ...META, manutencao_kcal_manual: 2500 }, 80);
    expect(metas.kcal).toBe(2575); // 2500 + 3%
    // Com a manutenção real na mão, sexo/idade/altura deixam de fazer falta.
    expect(metas.faltando).toEqual([]);
  });

  it('carboidrato é o resto das calorias depois de proteína e gordura', () => {
    const metas = calcularMetas({ ...META, manutencao_kcal_manual: 2500 }, 80);
    // 2575 − (144 × 4) − (64 × 9) = 1423 kcal → 356 g
    expect(metas.carboidrato_g).toBe(356);
  });

  it('sem peso não há meta nenhuma, e diz que falta o peso', () => {
    const metas = calcularMetas(META, null);
    expect(metas.proteina_g).toBeNull();
    expect(metas.gordura_g).toBeNull();
    expect(metas.faltando).toContain('peso');
  });

  it('sem plano com meta cadastrada devolve tudo vazio', () => {
    expect(calcularMetas(null, 80).proteina_g).toBeNull();
  });
});

describe('macrosDaPorcao', () => {
  const frango = { kcal: 159, proteina_g: 32, carboidrato_g: 0, gordura_g: 2.5, fibra_g: 0 };

  it('escala a base de 100 g para a porção', () => {
    const porcao = macrosDaPorcao(frango, 150);
    expect(porcao.kcal).toBeCloseTo(238.5);
    expect(porcao.proteina_g).toBeCloseTo(48);
  });

  it('porção zero não vira caloria', () => {
    expect(macrosDaPorcao(frango, 0).kcal).toBe(0);
  });
});

describe('somarMacros', () => {
  it('soma as porções do dia', () => {
    const total = somarMacros([
      { kcal: 100, proteina_g: 10, carboidrato_g: 5, gordura_g: 2, fibra_g: 1 },
      { kcal: 200, proteina_g: 20, carboidrato_g: 10, gordura_g: 4, fibra_g: 2 },
    ]);
    expect(total).toEqual({
      kcal: 300, proteina_g: 30, carboidrato_g: 15, gordura_g: 6, fibra_g: 3,
    });
  });

  it('dia sem nada registrado é zero, não NaN', () => {
    expect(somarMacros([]).kcal).toBe(0);
  });
});
