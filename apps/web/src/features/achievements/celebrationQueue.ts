import { create } from 'zustand';

/**
 * Fila de comemoração de conquistas — um troféu por vez.
 *
 * A detecção (`detectarConquistas`) enfileira as chaves recém-desbloqueadas;
 * o `CelebrationToast` mostra a primeira e chama `descartar` para avançar.
 * Backfill do primeiro uso não passa por aqui: entra silencioso.
 */
interface CelebrationQueue {
  fila: readonly string[];
  /**
   * Quantas conquistas foram gravadas em silêncio no backfill do primeiro
   * uso. A tela `/conquistas` mostra um aviso enquanto for > 0. Efêmero: se o
   * usuário recarregar antes de ver, perde o aviso (os troféus ficam).
   */
  backfillCount: number;
  enfileirar: (keys: readonly string[]) => void;
  descartar: () => void;
  registrarBackfill: (n: number) => void;
  limparBackfill: () => void;
}

export const useCelebrationQueue = create<CelebrationQueue>((set) => ({
  fila: [],
  backfillCount: 0,
  enfileirar: (keys) =>
    set((estado) => {
      const jaNaFila = new Set(estado.fila);
      const novos = keys.filter((k) => !jaNaFila.has(k));
      return novos.length ? { fila: [...estado.fila, ...novos] } : estado;
    }),
  descartar: () => set((estado) => ({ fila: estado.fila.slice(1) })),
  registrarBackfill: (n) => set({ backfillCount: n }),
  limparBackfill: () => set({ backfillCount: 0 }),
}));
