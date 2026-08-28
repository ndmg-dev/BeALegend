import { describe, expect, it } from 'vitest';
import { formatarTempo, iniciarRestTimer, tick } from './restTimer';

describe('iniciarRestTimer', () => {
  it('começa com o tempo pedido', () => {
    expect(iniciarRestTimer(90)).toEqual({ restanteSeg: 90, concluido: false });
  });

  it('duração zero já nasce concluída', () => {
    expect(iniciarRestTimer(0)).toEqual({ restanteSeg: 0, concluido: true });
  });

  it('duração negativa é tratada como zero', () => {
    expect(iniciarRestTimer(-5)).toEqual({ restanteSeg: 0, concluido: true });
  });
});

describe('tick', () => {
  it('decrementa um segundo por vez', () => {
    let estado = iniciarRestTimer(3);
    estado = tick(estado);
    expect(estado).toEqual({ restanteSeg: 2, concluido: false });
  });

  it('marca concluído ao chegar em zero', () => {
    let estado = iniciarRestTimer(1);
    estado = tick(estado);
    expect(estado).toEqual({ restanteSeg: 0, concluido: true });
  });

  it('não decrementa além de concluído', () => {
    const concluido = { restanteSeg: 0, concluido: true };
    expect(tick(concluido)).toEqual(concluido);
  });

  it('uma sequência completa de 3 segundos termina exatamente em concluído', () => {
    let estado = iniciarRestTimer(3);
    const historico = [estado];
    for (let i = 0; i < 3; i += 1) {
      estado = tick(estado);
      historico.push(estado);
    }
    expect(historico.map((e) => e.restanteSeg)).toEqual([3, 2, 1, 0]);
    expect(historico.at(-1)?.concluido).toBe(true);
  });
});

describe('formatarTempo', () => {
  it('formata minutos e segundos com zero à esquerda', () => {
    expect(formatarTempo(65)).toBe('1:05');
    expect(formatarTempo(90)).toBe('1:30');
  });

  it('formata menos de um minuto', () => {
    expect(formatarTempo(45)).toBe('0:45');
    expect(formatarTempo(5)).toBe('0:05');
  });

  it('formata zero', () => {
    expect(formatarTempo(0)).toBe('0:00');
  });

  it('formata múltiplos minutos', () => {
    expect(formatarTempo(125)).toBe('2:05');
  });
});
