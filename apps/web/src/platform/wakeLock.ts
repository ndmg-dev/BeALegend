/**
 * Wake lock — a tela não pode apagar no meio de uma série.
 * Safari só concede a partir de um gesto do usuário, e solta o lock sozinho
 * quando a aba perde visibilidade: por isso o re-request no `visibilitychange`.
 */

let sentinel: WakeLockSentinel | null = null;

export function isWakeLockSupported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

async function acquire(): Promise<void> {
  if (!isWakeLockSupported() || sentinel) return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => {
      sentinel = null;
    });
  } catch {
    // Bateria baixa ou permissão negada: seguimos sem o lock, sem quebrar nada.
    sentinel = null;
  }
}

function onVisibility(): void {
  if (document.visibilityState === 'visible') void acquire();
}

/** Mantém a tela acesa até a função devolvida ser chamada. */
export async function keepScreenAwake(): Promise<() => void> {
  await acquire();
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    void sentinel?.release();
    sentinel = null;
  };
}
