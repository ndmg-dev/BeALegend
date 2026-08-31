/// <reference lib="webworker" />
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// SPA: qualquer rota (/treino, /grana…) é servida pelo shell precacheado.
// Sem isto, recarregar offline em qualquer rota que não a raiz falha.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    // /api é do servidor: nunca vem do cache.
    denylist: [/^\/api\//],
  }),
);

// Assume o controle já na primeira visita. Um app offline-first não pode
// depender de o usuário recarregar duas vezes para ficar protegido.
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | undefined)?.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});

/**
 * O agendamento dos lembretes mora no servidor (iOS não tem background sync).
 * Aqui o service worker só recebe e exibe. Fase 6 preenche o payload real.
 */
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const payload = event.data.json() as {
    title?: string;
    body?: string;
    url?: string;
    tag?: string;
  };
  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'BeALegend', {
      body: payload.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      ...(payload.tag ? { tag: payload.tag } : {}),
      data: { url: payload.url ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client): client is WindowClient => 'navigate' in client);
      if (existing) return existing.navigate(url).then((client) => client?.focus());
      return self.clients.openWindow(url);
    }),
  );
});
