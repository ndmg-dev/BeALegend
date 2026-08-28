/**
 * Permissão de notificação.
 *
 * O pedido acontece **depois do primeiro registro concluído**, nunca no
 * primeiro carregamento: pedir cedo demais é o caminho mais curto para uma
 * negação permanente. O agendamento em si mora no servidor (iOS não tem
 * background sync) — aqui só existe permissão e subscription.
 */

export function notificationsSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

export function permissionState(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

export async function requestPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.requestPermission();
}

/** Fase 6 conecta isto ao endpoint de subscription do servidor. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!notificationsSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}
