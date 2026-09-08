import { useEffect } from 'react';
import { registerSW } from 'virtual:pwa-register';

/**
 * Registro do service worker. `registerType: 'autoUpdate'` (vite.config): ao
 * detectar versão nova, `registerSW` manda o SKIP_WAITING e recarrega. Sem
 * callback de prompt aqui é de propósito — a atualização é silenciosa.
 *
 * O ponto fraco do autoUpdate: ele só *detecta* a versão nova quando o
 * navegador decide checar `sw.js` de novo — o que, num PWA aberto direto da
 * tela de início, pode nunca acontecer numa sessão só. Guardamos a
 * `ServiceWorkerRegistration` para poder forçar essa checagem: de tempos em
 * tempos sozinho, e sob demanda pelo botão "Verificar atualizações".
 */

let registration: ServiceWorkerRegistration | null = null;

const INTERVALO_CHECAGEM_MS = 60 * 60 * 1000;

export function useServiceWorker(): void {
  useEffect(() => {
    registerSW({
      immediate: true,
      onRegisteredSW(_url, reg) {
        registration = reg ?? null;
      },
    });

    const id = window.setInterval(() => void registration?.update(), INTERVALO_CHECAGEM_MS);
    return () => window.clearInterval(id);
  }, []);
}

/**
 * Força uma checagem agora. Se houver versão nova, o fluxo de
 * `registerType: 'autoUpdate'` já configurado no registro cuida sozinho de
 * ativar e recarregar — esta função só dispara o `update()`; não recarrega
 * nada diretamente.
 *
 * Devolve `false` quando não há registro ainda (SW desabilitado, navegador
 * sem suporte, ou chamado cedo demais no boot) — a UI trata como "nada a
 * verificar" em vez de travar esperando.
 */
export async function verificarAtualizacoes(): Promise<boolean> {
  if (!registration) return false;
  await registration.update();
  return true;
}

/** Há uma versão nova baixada, instalando ou esperando para assumir. */
export function haAtualizacaoEmAndamento(): boolean {
  return Boolean(registration?.installing || registration?.waiting);
}
