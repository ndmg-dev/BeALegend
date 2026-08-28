import { describe, expect, it } from 'vitest';
import type { LinhaSincronizavel, PendenciaLocal } from './reconcile';
import { coalescerPendencias, reconciliarLinha } from './reconcile';

function linha(over: Partial<LinhaSincronizavel> = {}): LinhaSincronizavel {
  return { id: 'ex-1', row_version: 1, deleted_at: null, nome: 'Supino', ...over };
}

describe('reconciliarLinha', () => {
  it('grava a linha do servidor quando não há nada local', () => {
    const decisao = reconciliarLinha(linha(), undefined, []);
    expect(decisao).toEqual({ acao: 'gravar', linha: linha() });
  });

  it('ignora delta mais velho do que o que já está gravado', () => {
    const local = linha({ row_version: 9 });
    expect(reconciliarLinha(linha({ row_version: 5 }), local, [])).toEqual({ acao: 'ignorar' });
  });

  it('aceita delta mais novo', () => {
    const local = linha({ row_version: 5 });
    const remota = linha({ row_version: 6, nome: 'Supino inclinado' });
    expect(reconciliarLinha(remota, local, [])).toEqual({ acao: 'gravar', linha: remota });
  });

  it('remove a linha apagada no servidor', () => {
    // O delete bumpa row_version, então o delta sempre chega mais novo.
    const remota = linha({ row_version: 2, deleted_at: '2026-01-01T00:00:00Z' });
    expect(reconciliarLinha(remota, linha(), [])).toEqual({ acao: 'remover', id: 'ex-1' });
  });

  it('remove a linha apagada localmente, mesmo que o servidor ainda a mande', () => {
    const pendentes: PendenciaLocal[] = [{ operacao: 'delete', payload: {} }];
    expect(reconciliarLinha(linha({ row_version: 7 }), linha(), pendentes)).toEqual({
      acao: 'remover',
      id: 'ex-1',
    });
  });

  it('preserva a edição que ainda não subiu', () => {
    // O usuário renomeou offline; o servidor mandou a versão antiga.
    // Se o nome antigo voltasse à tela, o app pareceria ter perdido o registro.
    const pendentes: PendenciaLocal[] = [{ operacao: 'update', payload: { nome: 'Meu nome' } }];
    const decisao = reconciliarLinha(linha({ row_version: 4 }), linha(), pendentes);

    expect(decisao).toEqual({
      acao: 'gravar',
      linha: { ...linha({ row_version: 4 }), nome: 'Meu nome' },
    });
  });

  it('aplica as pendências na ordem em que foram enfileiradas', () => {
    const pendentes: PendenciaLocal[] = [
      { operacao: 'update', payload: { nome: 'Primeiro' } },
      { operacao: 'update', payload: { nome: 'Segundo' } },
    ];
    const decisao = reconciliarLinha(linha({ row_version: 2 }), linha(), pendentes);
    expect(decisao).toMatchObject({ linha: { nome: 'Segundo' } });
  });

  it('mantém campos do servidor que a pendência não tocou', () => {
    const remota = linha({ row_version: 3, nome: 'Do servidor', equipamento: 'barra' });
    const pendentes: PendenciaLocal[] = [{ operacao: 'update', payload: { nome: 'Local' } }];
    const decisao = reconciliarLinha(remota, linha(), pendentes);
    expect(decisao).toMatchObject({ linha: { nome: 'Local', equipamento: 'barra' } });
  });

  it('não ignora delta velho quando há pendência — ela precisa ser reaplicada', () => {
    const local = linha({ row_version: 9 });
    const pendentes: PendenciaLocal[] = [{ operacao: 'update', payload: { nome: 'Local' } }];
    const decisao = reconciliarLinha(linha({ row_version: 9 }), local, pendentes);
    expect(decisao).toMatchObject({ acao: 'gravar', linha: { nome: 'Local' } });
  });
});

describe('coalescerPendencias', () => {
  it('devolve null sem pendência', () => {
    expect(coalescerPendencias([])).toBeNull();
  });

  it('funde vários updates num patch só', () => {
    // Ajustar a carga de 80 para 82,5 e depois 85 é uma requisição, não três.
    expect(
      coalescerPendencias([
        { operacao: 'update', payload: { carga: 80 } },
        { operacao: 'update', payload: { carga: 82.5 } },
        { operacao: 'update', payload: { carga: 85 } },
      ]),
    ).toEqual({ operacao: 'update', payload: { carga: 85 } });
  });

  it('preserva campos distintos ao fundir', () => {
    expect(
      coalescerPendencias([
        { operacao: 'update', payload: { nome: 'A' } },
        { operacao: 'update', payload: { equipamento: 'halter' } },
      ]),
    ).toEqual({ operacao: 'update', payload: { nome: 'A', equipamento: 'halter' } });
  });

  it('create absorve os updates seguintes e sobe uma vez só', () => {
    expect(
      coalescerPendencias([
        { operacao: 'create', payload: { nome: 'Novo' } },
        { operacao: 'update', payload: { nome: 'Renomeado' } },
      ]),
    ).toEqual({ operacao: 'create', payload: { nome: 'Renomeado' } });
  });

  it('criar e apagar offline não gera requisição nenhuma', () => {
    expect(
      coalescerPendencias([
        { operacao: 'create', payload: { nome: 'Engano' } },
        { operacao: 'delete', payload: {} },
      ]),
    ).toBeNull();
  });

  it('apagar algo que já existe no servidor vira um delete', () => {
    expect(
      coalescerPendencias([
        { operacao: 'update', payload: { nome: 'A' } },
        { operacao: 'delete', payload: {} },
      ]),
    ).toEqual({ operacao: 'delete', payload: {} });
  });
});
