import type { Page } from '@playwright/test';

/**
 * O service worker registra dentro de um `useEffect` (`useServiceWorker`) —
 * assíncrono em relação ao evento `load` que `page.goto` espera. Um teste
 * que corta a rede e recarrega a página *antes* de `activate()` +
 * `clients.claim()` terminarem cai na rede (já cortada) em vez do precache
 * do Workbox, e falha com `ERR_INTERNET_DISCONNECTED` por uma corrida do
 * teste — não por bug do app. Só quem faz reload **enquanto offline**
 * precisa desta espera; testes que ficam offline sem recarregar (ou que
 * recarregam com a rede de volta) não correm esse risco.
 */
export async function aguardarServiceWorkerAtivo(page: Page): Promise<void> {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}
