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

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!notificationsSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  return new Uint8Array(bytes.buffer);
}

export async function subscribeToNotifications(publicKey: string): Promise<PushSubscription> {
  if (!notificationsSupported()) throw new Error('Notificações não são suportadas neste aparelho.');
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey(publicKey),
  });
}

export async function unsubscribeFromNotifications(): Promise<string | null> {
  const subscription = await currentSubscription();
  if (!subscription) return null;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  return endpoint;
}
