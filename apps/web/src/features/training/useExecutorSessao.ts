import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { PlanItem } from '@/data/db/schema';
import { itensDoDia, ultimaSerie } from '@/data/db/trainingRepo';
import {
  concluirSessao,
  iniciarOuRetomarSessao,
  registrarSerie,
  seriesDaSessao,
} from '@/data/db/trainingSessionRepo';
import { toLocalDate } from '@/domain/time/day';
import { suggestProgression, type Suggestion } from '@/domain/training/progression';
import { keepScreenAwake } from '@/platform/wakeLock';

/**
 * Orquestra a execução de uma sessão: um exercício por vez, série por série.
 *
 * Nenhuma chamada aqui espera rede — tudo passa pelos repositórios do Dexie,
 * que já são otimistas. O hook só sequencia o que a tela mostra.
 */

interface ItemComPreenchimento {
  item: PlanItem;
  cargaSugeridaKg: number;
  repsSugeridas: number;
}

export function useExecutorSessao(planDayId: string, userId: string, timezone: string) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [indiceAtual, setIndiceAtual] = useState(0);
  const [itensPreenchidos, setItensPreenchidos] = useState<ItemComPreenchimento[] | null>(null);
  const [sugestao, setSugestao] = useState<Suggestion>(null);
  const liberarWakeLockRef = useRef<(() => void) | null>(null);

  const itensBrutos = useLiveQuery(() => itensDoDia(planDayId), [planDayId]);

  // Mantém a tela acesa do início ao fim da sessão — nunca no meio de uma série.
  useEffect(() => {
    let cancelado = false;
    void keepScreenAwake().then((liberar) => {
      if (cancelado) liberar();
      else liberarWakeLockRef.current = liberar;
    });
    return () => {
      cancelado = true;
      liberarWakeLockRef.current?.();
    };
  }, []);

  useEffect(() => {
    if (!itensBrutos) return;
    void (async () => {
      const comPreenchimento = await Promise.all(
        itensBrutos
          .filter((item) => item.exercise_id !== null)
          .map(async (item) => {
            const ultima = item.exercise_id ? await ultimaSerie(item.exercise_id) : null;
            return {
              item,
              cargaSugeridaKg: ultima?.carga_kg ?? 0,
              repsSugeridas: ultima?.reps ?? item.reps_min ?? item.reps_max ?? 0,
            };
          }),
      );
      setItensPreenchidos(comPreenchimento);
    })();
  }, [itensBrutos]);

  useEffect(() => {
    if (sessionId || !planDayId || !itensPreenchidos || itensPreenchidos.length === 0) return;
    const hoje = toLocalDate(new Date(), timezone);
    let cancelado = false;

    void iniciarOuRetomarSessao({ planDayId, data: hoje }, userId).then((sessao) => {
      // Reload no meio do treino, app fechado e reaberto: retoma a sessão de
      // hoje em vez de criar outra — senão as séries já feitas ficam órfãs
      // numa sessão "em_curso" que a tela nunca mais enxerga.
      if (!cancelado) setSessionId(sessao.id);
    });
    return () => {
      cancelado = true;
    };
  }, [itensPreenchidos, planDayId, sessionId, userId, timezone]);

  const itemAtual = itensPreenchidos?.[indiceAtual] ?? null;
  const ultimoItem = itensPreenchidos ? indiceAtual >= itensPreenchidos.length - 1 : false;

  const seriesFeitas = useLiveQuery(
    () =>
      sessionId && itemAtual
        ? seriesDaSessao(sessionId, itemAtual.item.exercise_id as string)
        : Promise.resolve([]),
    [sessionId, itemAtual?.item.id],
    [],
  );

  const registrarSerieAtual = useCallback(
    async (reps: number, cargaKg: number, rir: number | null) => {
      if (!sessionId || !itemAtual?.item.exercise_id) return;

      await registrarSerie(
        {
          sessionId,
          exerciseId: itemAtual.item.exercise_id,
          numeroSerie: seriesFeitas.length + 1,
          reps,
          cargaKg,
          rir,
        },
        userId,
      );

      const seriesAtualizadas = [...seriesFeitas, { numero_serie: seriesFeitas.length + 1, reps, rir }];
      const proxima = suggestProgression(seriesAtualizadas, {
        series_min: itemAtual.item.series_min,
        reps_max: itemAtual.item.reps_max,
        rir_min: itemAtual.item.rir_min,
      });
      setSugestao(proxima);
    },
    [sessionId, itemAtual, seriesFeitas, userId],
  );

  const avancarExercicio = useCallback(() => {
    setSugestao(null);
    setIndiceAtual((i) => i + 1);
  }, []);

  const finalizarSessao = useCallback(async () => {
    if (sessionId) await concluirSessao(sessionId);
  }, [sessionId]);

  return {
    carregando:
      itensPreenchidos === null || (itensPreenchidos.length > 0 && sessionId === null),
    itemAtual,
    indiceAtual,
    totalItens: itensPreenchidos?.length ?? 0,
    ultimoItem,
    seriesFeitas,
    sugestao,
    registrarSerieAtual,
    avancarExercicio,
    finalizarSessao,
  };
}
