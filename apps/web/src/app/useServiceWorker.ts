import { useEffect } from 'react';
import { registerSW } from 'virtual:pwa-register';

/**
 * Registro do service worker. `registerType: 'autoUpdate'` (vite.config): ao
 * detectar versão nova, `registerSW` manda o SKIP_WAITING e recarrega. Sem
 * callback de prompt aqui é de propósito — a atualização é silenciosa.
 */
export function useServiceWorker(): void {
  useEffect(() => {
    registerSW({ immediate: true });
  }, []);
}
