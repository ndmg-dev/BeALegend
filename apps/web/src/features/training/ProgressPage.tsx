import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { listar } from '@/data/db/exerciseRepo';
import { exerciciosComHistorico, historicoDoExercicio } from '@/data/db/trainingSessionRepo';
import { progressoPorSessao, variacaoDeCarga, variacaoDeVolume } from '@/domain/training/progressChart';
import { useSession } from '@/features/auth/useSession';
import { Card } from '@/ui/Card';
import { CategoryPill } from '@/ui/CategoryPill';
import { EmptyState } from '@/ui/EmptyState';
import { Icon } from '@/ui/Icon';

type Metrica = 'carga' | 'volume';

const METRICA: Record<Metrica, {
  titulo: string;
  campo: 'cargaMaxima' | 'volumeTotal';
  unidade: string;
  rotuloTooltip: string;
  rotuloCartao: string;
}> = {
  carga: {
    titulo: 'Carga máxima',
    campo: 'cargaMaxima',
    unidade: 'kg',
    rotuloTooltip: 'Carga máxima',
    rotuloCartao: 'Carga atual',
  },
  volume: {
    titulo: 'Volume total',
    campo: 'volumeTotal',
    unidade: 'kg',
    rotuloTooltip: 'Volume (carga × reps)',
    rotuloCartao: 'Volume da última sessão',
  },
};

/**
 * Progresso de carga por exercício — carga máxima do dia ao longo do tempo.
 *
 * Tudo vem do Dexie: `set_log` é append-only e sincroniza inteiro pelo
 * delta, então o histórico já está no aparelho antes de abrir esta tela,
 * mesmo offline e mesmo que a série tenha sido registrada noutro dispositivo.
 */
export function ProgressPage() {
  const user = useSession((s) => s.user);
  const timezone = user?.timezone ?? 'UTC';
  const [exercicioId, setExercicioId] = useState<string | null>(null);
  const [metrica, setMetrica] = useState<Metrica>('carga');

  const dados = useLiveQuery(async () => {
    const [exercicios, comHistorico] = await Promise.all([listar(), exerciciosComHistorico()]);
    return {
      exercicios: exercicios.filter((ex) => comHistorico.has(ex.id)),
    };
  }, []);

  const selecionado = exercicioId ?? dados?.exercicios[0]?.id ?? null;

  const pontos = useLiveQuery(async () => {
    if (!selecionado) return [];
    const logs = await historicoDoExercicio(selecionado);
    return progressoPorSessao(logs, timezone);
  }, [selecionado, timezone], []);

  const variacao = useMemo(
    () => (metrica === 'carga' ? variacaoDeCarga(pontos ?? []) : variacaoDeVolume(pontos ?? [])),
    [pontos, metrica],
  );
  const exercicioAtual = dados?.exercicios.find((ex) => ex.id === selecionado);
  const config = METRICA[metrica];

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-sp-5">
      <header className="flex items-center gap-sp-3">
        <Link
          to="/treino"
          aria-label="Voltar para Treino"
          className="grid min-h-tap min-w-tap place-items-center rounded-md text-text-muted"
        >
          <Icon name="chevron-left" size={24} />
        </Link>
        <div>
          <h1 className="text-title">Progresso</h1>
          <p className="text-label text-text-muted">Carga e volume por sessão, exercício a exercício</p>
        </div>
      </header>

      {dados === undefined ? (
        <div role="status" className="text-text-muted">
          Carregando…
        </div>
      ) : dados.exercicios.length === 0 ? (
        <EmptyState title="Sem histórico ainda" illustration="treino">
          Registre séries no executor de treino para ver a evolução de carga aqui.
        </EmptyState>
      ) : (
        <>
          <label className="flex flex-col gap-sp-2">
            <span className="text-label text-text-secondary">Exercício</span>
            <select
              value={selecionado ?? ''}
              onChange={(event) => setExercicioId(event.target.value)}
              className="min-h-tap rounded-md border border-border bg-surface px-sp-3 text-body"
            >
              {dados.exercicios.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.nome}
                </option>
              ))}
            </select>
          </label>

          {!pontos || pontos.length === 0 ? (
            <EmptyState title="Sem séries registradas">
              Ainda não há séries de {exercicioAtual?.nome ?? 'este exercício'}.
            </EmptyState>
          ) : (
            <>
              <div role="tablist" aria-label="Métrica" className="flex gap-sp-2">
                {(Object.keys(METRICA) as Metrica[]).map((chave) => (
                  <CategoryPill
                    key={chave}
                    role="tab"
                    aria-selected={metrica === chave}
                    selected={metrica === chave}
                    onClick={() => setMetrica(chave)}
                  >
                    {METRICA[chave].titulo}
                  </CategoryPill>
                ))}
              </div>

              <Card className="flex items-center justify-between gap-sp-4">
                <div>
                  <p className="text-label text-text-muted">{config.rotuloCartao}</p>
                  <p className="text-title tabular-nums">
                    {pontos[pontos.length - 1]?.[config.campo]} {config.unidade}
                  </p>
                </div>
                {variacao !== null ? (
                  <div className="text-right">
                    <p className="text-label text-text-muted">Desde o início</p>
                    <p
                      className={`text-subhead tabular-nums ${
                        variacao > 0
                          ? 'text-treino-300'
                          : variacao < 0
                            ? 'text-danger'
                            : 'text-text-muted'
                      }`}
                    >
                      {variacao > 0 ? '+' : ''}
                      {variacao} {config.unidade}
                    </p>
                  </div>
                ) : null}
              </Card>

              <Card>
                <h2 className="mb-sp-3 text-heading">{config.titulo}</h2>
                <div
                  className="h-56 w-full"
                  role="img"
                  aria-label={`Gráfico de ${config.titulo.toLowerCase()} de ${exercicioAtual?.nome ?? ''} ao longo do tempo`}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={pontos.map((p) => ({ ...p }))}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border-subtle" />
                      <XAxis
                        dataKey="data"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(data: string) => data.slice(5).replace('-', '/')}
                      />
                      <YAxis tick={{ fontSize: 11 }} width={36} unit={config.unidade} />
                      <Tooltip
                        formatter={(value: number) => [`${value} ${config.unidade}`, config.rotuloTooltip]}
                        labelFormatter={(data: string) => data.split('-').reverse().join('/')}
                      />
                      <Line
                        type="monotone"
                        dataKey={config.campo}
                        stroke="var(--tr-400)"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <p className="text-label text-text-muted">
                {pontos.length} {pontos.length === 1 ? 'sessão registrada' : 'sessões registradas'}
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}
