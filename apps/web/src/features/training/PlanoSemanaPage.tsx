import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { sincronizar } from '@/data/sync/engine';
import type { PlanDay } from '@/data/db/schema';
import { diasDoPlano, planoAtivo } from '@/data/db/trainingRepo';
import { toLocalDate } from '@/domain/time/day';
import { useSession } from '@/features/auth/useSession';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { cn } from '@/ui/cn';
import { EmptyState } from '@/ui/EmptyState';

const NOME_DIA: Record<PlanDay['dia_semana'], string> = {
  segunda: 'Segunda',
  terca: 'Terça',
  quarta: 'Quarta',
  quinta: 'Quinta',
  sexta: 'Sexta',
  sabado: 'Sábado',
  domingo: 'Domingo',
};

const ROTULO_TIPO: Record<PlanDay['tipo'], string> = {
  forca: 'Força',
  cardio: 'Cardio',
  hiit: 'HIIT',
  descanso: 'Descanso',
};

const SLUG_POR_WEEKDAY: PlanDay['dia_semana'][] = [
  'domingo',
  'segunda',
  'terca',
  'quarta',
  'quinta',
  'sexta',
  'sabado',
];

export function PlanoSemanaPage() {
  const user = useSession((s) => s.user);
  const navigate = useNavigate();

  // useLiveQuery re-executa sozinho quando o sync grava o plano no Dexie —
  // um efeito de montagem único perderia essa chegada tardia.
  const dias = useLiveQuery(async () => {
    const plano = await planoAtivo();
    return plano ? diasDoPlano(plano.id) : null;
  }, [], undefined);

  // O plano é semeado fora do app (script do dono/admin), então a chegada
  // dele nunca coincide com um dos gatilhos de sync (rede, foco, intervalo).
  // Entrar nesta tela é o próprio sinal de "quero o plano atualizado".
  useEffect(() => {
    void sincronizar();
  }, []);

  const hojeSlug = user
    ? SLUG_POR_WEEKDAY[new Date(toLocalDate(new Date(), user.timezone)).getUTCDay()]
    : null;

  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="mb-sp-4 text-title">Treino</h1>

      {dias === undefined ? (
        <div role="status" aria-live="polite" className="text-text-muted">
          Carregando…
        </div>
      ) : dias === null ? (
        <EmptyState title="Nenhum plano ativo" illustration="treino">
          Rode o seed da planilha para começar.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-sp-3">
          {dias.map((dia) => (
            <Card
              key={dia.id}
              data-testid={`plan-day-${dia.dia_semana}`}
              className={cn(
                'flex items-center justify-between gap-sp-4',
                dia.dia_semana === hojeSlug && 'border-treino-400',
              )}
            >
              <div>
                <p className="text-label text-text-muted">{NOME_DIA[dia.dia_semana]}</p>
                <p className="text-subhead">{ROTULO_TIPO[dia.tipo]}</p>
                {dia.foco ? <p className="text-label text-text-secondary">{dia.foco}</p> : null}
              </div>

              {dia.tipo !== 'descanso' ? (
                <Button onClick={() => navigate(`/treino/${dia.id}`)}>Iniciar</Button>
              ) : (
                <span className="text-label text-text-muted">Descanso</span>
              )}
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
