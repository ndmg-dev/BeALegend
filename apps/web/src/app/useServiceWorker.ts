import { useEffect } from 'react';
import { registerSW } from 'virtual:pwa-register';

/**
 * Registro do service worker com atualização em `prompt`.
 *
 * Recarregar sozinho no meio de uma sessão de treino perderia o estado da
 * série em curso. Na fase 2 isso vira um aviso discreto; por ora só registra.
 */
export function useServiceWorker(): void {
  useEffect(() => {
    const update = registerSW({ immediate: true });
    return () => {
      void update;
    };
  }, []);
}
