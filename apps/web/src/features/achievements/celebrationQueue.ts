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
  enfileirar: (keys: readonly string[]) => void;
  descartar: () => void;
}

export const useCelebrationQueue = create<CelebrationQueue>((set) => ({
  fila: [],
  enfileirar: (keys) =>
    set((estado) => {
      const jaNaFila = new Set(estado.fila);
      const novos = keys.filter((k) => !jaNaFila.has(k));
      return novos.length ? { fila: [...estado.fila, ...novos] } : estado;
    }),
  descartar: () => set((estado) => ({ fila: estado.fila.slice(1) })),
}));
