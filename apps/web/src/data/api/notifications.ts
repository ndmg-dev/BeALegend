import { z } from 'zod';
import { request } from './client';

const preferencesSchema = z.object({
  treino_enabled: z.boolean(),
  treino_horario: z.string(),
  refeicao_enabled: z.boolean(),
  resumo_semanal_enabled: z.boolean(),
  resumo_dia_semana: z.number().int().min(0).max(6),
  resumo_horario: z.string(),
});
export type NotificationPreferences = z.infer<typeof preferencesSchema>;

const configSchema = z.object({
  public_key: z.string(),
  configured: z.boolean(),
  subscribed: z.boolean(),
  preferences: preferencesSchema,
});
export type NotificationConfig = z.infer<typeof configSchema>;

export async function notificationConfig(): Promise<NotificationConfig> {
  return request('/notifications/config', { schema: configSchema });
}

export async function registerSubscription(subscription: PushSubscription): Promise<void> {
  const serialized = subscription.toJSON();
  if (!serialized.endpoint || !serialized.keys?.['p256dh'] || !serialized.keys['auth']) {
    throw new Error('O navegador devolveu uma assinatura incompleta.');
  }
  await request('/notifications/subscriptions', {
    method: 'POST',
    body: {
      endpoint: serialized.endpoint,
      keys: { p256dh: serialized.keys['p256dh'], auth: serialized.keys['auth'] },
    },
  });
}

export async function unregisterSubscription(endpoint: string): Promise<void> {
  await request('/notifications/unsubscribe', { method: 'POST', body: { endpoint } });
}

export async function updateNotificationPreferences(
  patch: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  return request('/notifications/preferences', {
    method: 'PATCH', body: patch, schema: preferencesSchema,
  });
}
