import { describe, expect, it } from 'vitest';
import { formatMoney, parseMoney } from './money';

describe('money', () => {
  it('converte entrada brasileira diretamente em centavos', () => {
    expect(parseMoney('12,50')).toBe(1250);
    expect(parseMoney('1.234,56')).toBe(123456);
    expect(parseMoney('R$ 8')).toBe(800);
  });

  it('recusa zero, negativos e mais de duas casas', () => {
    expect(parseMoney('0')).toBeNull();
    expect(parseMoney('-2')).toBeNull();
    expect(parseMoney('1,999')).toBeNull();
  });

  it('formata centavos em reais', () => {
    expect(formatMoney(8740)).toContain('87,40');
  });
});
