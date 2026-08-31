import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '@/data/db/schema';
import { useSession } from '@/features/auth/useSession';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { NumberStepper } from '@/ui/NumberStepper';
import { RestTimer } from '@/ui/RestTimer';
import { useExecutorSessao } from './useExecutorSessao';

/**
 * Um exercício por vez, ocupando a tela. Carga e reps pré-preenchidos com o
 * valor da última sessão. Botão grande de "série concluída" no terço
 * inferior — dispara o timer de descanso sozinho. Funciona 100% offline: cada
 * ação passa pelos repositórios do Dexie, nunca pela rede.
 */
export function ExecutorPage() {
  const { planDayId } = useParams<{ planDayId: string }>();
  const navigate = useNavigate();
  const user = useSession((s) => s.user);

  const executor = useExecutorSessao(planDayId ?? '', user?.id ?? '', user?.timezone ?? 'UTC');
  const [carga, setCarga] = useState(0);
  const [reps, setReps] = useState(0);
  const [rir, setRir] = useState<number | null>(null);
  const [descansando, setDescansando] = useState(false);

  const item = executor.itemAtual?.item;
  const exercicio = useLiveQuery(
    async () => (item?.exercise_id ? await db.exercise.get(item.exercise_id) : undefined),
    [item?.exercise_id],
  );

  // Sincroniza os steppers com o pré-preenchimento assim que o item muda.
  useEffect(() => {
    if (!executor.itemAtual) return;
    setCarga(executor.itemAtual.cargaSugeridaKg);
    setReps(executor.itemAtual.repsSugeridas);
    setRir(item?.rir_min ?? null);
  }, [executor.itemAtual, item?.rir_min]);

  if (!planDayId || !user) return null;

  if (executor.carregando) {
    return (
      <div role="status" aria-live="polite" className="grid min-h-[60vh] place-items-center text-text-muted">
        Preparando sessão…
      </div>
    );
  }

  if (!item) {
    return (
      <section className="mx-auto max-w-md text-center">
        <h1 className="mb-sp-4 text-title">Nenhum exercício para hoje</h1>
        <p className="text-body text-text-secondary">
          Este dia não tem exercícios de série cadastrados no plano.
        </p>
        <Button className="mt-sp-6" onClick={() => navigate('/treino')}>
          Voltar ao plano
        </Button>
      </section>
    );
  }

  const seriesAlvo = item.series_max ?? item.series_min ?? 1;
  const serieAtualNumero = executor.seriesFeitas.length + 1;
  const faltamSeries = executor.seriesFeitas.length < seriesAlvo;

  async function concluirSerie() {
    await executor.registrarSerieAtual(reps, carga, rir);
    if (item?.descanso_seg) setDescansando(true);
  }

  async function irParaProximo() {
    if (executor.ultimoItem) {
      await executor.finalizarSessao();
      navigate('/treino', { replace: true });
    } else {
      executor.avancarExercicio();
    }
    setDescansando(false);
  }

  return (
    <section className="mx-auto flex max-w-md flex-col gap-sp-5 pb-sp-16">
      <header className="flex items-center justify-between text-label text-text-muted">
        <span>
          Exercício {executor.indiceAtual + 1} de {executor.totalItens}
        </span>
        <span>
          Série {Math.min(serieAtualNumero, seriesAlvo)} de {seriesAlvo}
        </span>
      </header>

      <Card>
        <h1 className="mb-sp-2 text-title">{exercicio?.nome ?? 'Exercício'}</h1>
        <p className="text-body text-text-secondary">
          {item.reps_min}–{item.reps_max} {item.unidade === 'segundos' ? 's' : 'reps'}
          {item.unilateral ? ' / lado' : ''}
          {item.rir_min !== null ? ` · RIR ${item.rir_min}${item.rir_max ? `–${item.rir_max}` : ''}` : ''}
        </p>
      </Card>

      {descansando ? (
        <Card className="flex flex-col items-center gap-sp-4">
          <RestTimer duracaoSeg={item.descanso_seg ?? 60} onConcluido={() => setDescansando(false)} />
          <Button variant="ghost" onClick={() => setDescansando(false)}>
            Pular descanso
          </Button>
        </Card>
      ) : (
        <>
          <Card className="flex justify-around">
            <NumberStepper
              label="Carga (kg)"
              value={carga}
              step={1}
              onChange={setCarga}
              format={(v) => v.toLocaleString('pt-BR', { minimumFractionDigits: v % 1 !== 0 ? 1 : 0 })}
            />
            <NumberStepper
              label={item.unidade === 'segundos' ? 'Segundos' : 'Reps'}
              value={reps}
              onChange={setReps}
            />
          </Card>

          {item.rir_min !== null && (
            <Card>
              <NumberStepper
                label="RIR"
                value={rir ?? 0}
                min={0}
                max={10}
                onChange={setRir}
                className="mx-auto"
              />
            </Card>
          )}

          {executor.sugestao ? (
            <SugestaoProgressao suggestion={executor.sugestao} />
          ) : null}

          {executor.seriesFeitas.length > 0 && (
            <Card>
              <p className="mb-sp-2 text-label text-text-muted">Séries feitas</p>
              <div className="flex flex-col gap-sp-1 tabular-nums">
                {executor.seriesFeitas.map((s) => (
                  <div key={s.numero_serie} className="flex justify-between text-body">
                    <span>Série {s.numero_serie}</span>
                    <span>
                      {s.reps} {item.unidade === 'segundos' ? 's' : 'reps'}
                      {s.rir !== null ? ` · RIR ${s.rir}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {faltamSeries ? (
            <Button size="lg" full onClick={() => void concluirSerie()} className="mt-auto">
              Série concluída
            </Button>
          ) : (
            <Button size="lg" full onClick={() => void irParaProximo()} className="mt-auto">
              {executor.ultimoItem ? 'Concluir treino' : 'Próximo exercício'}
            </Button>
          )}
        </>
      )}
    </section>
  );
}

function SugestaoProgressao({ suggestion }: { suggestion: NonNullable<ReturnType<typeof useExecutorSessao>['sugestao']> }) {
  return (
    <Card className="border-info/40 bg-info-bg">
      <p className="text-label font-semibold text-info">
        Aumente {suggestion.incrementoKg} kg na próxima sessão
      </p>
      <p className="mt-sp-1 text-label text-text-secondary">
        Sem anilha menor? +1–2 reps, descida mais lenta (3s) ou +1 série.
      </p>
    </Card>
  );
}
