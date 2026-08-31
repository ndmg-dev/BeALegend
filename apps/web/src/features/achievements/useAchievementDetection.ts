import { useEffect } from 'react';
import { detectarConquistas } from '@/data/db/achievementsRepo';
import { estadoAtual, observarSync } from '@/data/sync/engine';
import { useSession } from '@/features/auth/useSession';
import { useCelebrationQueue } from './celebrationQueue';

const DEBOUNCE_MS = 800;

/**
 * Roda a detecção de conquistas depois de cada ciclo de sync (que já cobre
 * tanto "empurrei meus registros" quanto "puxei dado de outro aparelho") e
 * uma vez no mount — para pegar o que foi registrado offline desde a última
 * sessão. Com debounce: vários ciclos em sequência = uma detecção.
 */
export function useAchievementDetection(): void {
  const user = useSession((s) => s.user);
  const enfileirar = useCelebrationQueue((s) => s.enfileirar);
  const registrarBackfill = useCelebrationQueue((s) => s.registrarBackfill);

  useEffect(() => {
    if (!user) return;
    const { id: userId, timezone } = user;
    let timer: number | undefined;
    let syncAtivoAntes = estadoAtual().emAndamento;

    const rodar = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void detectarConquistas(userId, timezone)
          .then((r) => {
            if (r.novos.length) enfileirar(r.novos);
            if (r.backfill.length) registrarBackfill(r.backfill.length);
          })
          .catch(() => undefined);
      }, DEBOUNCE_MS);
    };

    rodar();

    const parar = observarSync((estado) => {
      if (syncAtivoAntes && !estado.emAndamento) rodar();
      syncAtivoAntes = estado.emAndamento;
    });

    return () => {
      parar();
      window.clearTimeout(timer);
    };
  }, [user, enfileirar, registrarBackfill]);
}
