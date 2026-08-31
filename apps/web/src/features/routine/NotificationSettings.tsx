import { useEffect, useState } from 'react';
import {
  notificationConfig,
  registerSubscription,
  unregisterSubscription,
  updateNotificationPreferences,
  type NotificationConfig,
  type NotificationPreferences,
} from '@/data/api/notifications';
import {
  currentSubscription,
  notificationsSupported,
  permissionState,
  requestPermission,
  subscribeToNotifications,
} from '@/platform/notifications';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';

export function NotificationSettings({ eligible }: { eligible: boolean }) {
  const [config, setConfig] = useState<NotificationConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!eligible && permissionState() !== 'granted') return;
    const load = () => void notificationConfig().then(setConfig).catch(() => undefined);
    load();
    window.addEventListener('online', load);
    return () => window.removeEventListener('online', load);
  }, [eligible]);

  if (!eligible && !config?.subscribed) return null;

  async function enable() {
    if (!config?.configured) return;
    setBusy(true);
    setError(undefined);
    try {
      const permission = await requestPermission();
      if (permission !== 'granted') {
        setError(permission === 'denied' ? 'Notificações bloqueadas pelo navegador.' : 'Permissão não concedida.');
        return;
      }
      const subscription = await subscribeToNotifications(config.public_key);
      await registerSubscription(subscription);
      setConfig({ ...config, subscribed: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível ativar os lembretes.');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(undefined);
    try {
      const subscription = await currentSubscription();
      if (subscription) {
        await unregisterSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      if (config) setConfig({ ...config, subscribed: false });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível desativar os lembretes.');
    } finally {
      setBusy(false);
    }
  }

  async function patchPreferences(patch: Partial<NotificationPreferences>) {
    if (!config) return;
    const previous = config.preferences;
    setConfig({ ...config, preferences: { ...previous, ...patch } });
    try {
      const preferences = await updateNotificationPreferences(patch);
      setConfig((current) => current ? { ...current, preferences } : current);
    } catch {
      setConfig((current) => current ? { ...current, preferences: previous } : current);
      setError('Não foi possível salvar a preferência.');
    }
  }

  const supported = notificationsSupported();
  return (
    <Card>
      <div className="flex items-start justify-between gap-sp-4">
        <div><h2 className="text-heading">Lembretes</h2><p className="text-label text-text-muted">Treino, refeições e fechamento da semana</p></div>
        {config?.subscribed
          ? <Button variant="ghost" disabled={busy} onClick={() => void disable()}>Desativar</Button>
          : <Button disabled={busy || !supported || !config?.configured} onClick={() => void enable()}>{busy ? 'Ativando…' : 'Ativar'}</Button>}
      </div>
      {!supported ? <p className="mt-sp-3 text-label text-warning">Este navegador não oferece Web Push.</p> : null}
      {config && !config.configured ? <p className="mt-sp-3 text-label text-warning">O servidor ainda não possui chaves VAPID.</p> : null}
      {error ? <p role="alert" className="mt-sp-3 text-label text-danger">⚠ {error}</p> : null}
      {config?.subscribed ? (
        <div className="mt-sp-4 flex flex-col gap-sp-3 border-t border-border-subtle pt-sp-4">
          <PreferenceToggle label="Lembrete de treino" checked={config.preferences.treino_enabled} onChange={(value) => void patchPreferences({ treino_enabled: value })} />
          {config.preferences.treino_enabled ? <TimePreference label="Horário do treino" value={config.preferences.treino_horario} onChange={(value) => void patchPreferences({ treino_horario: value })} /> : null}
          <PreferenceToggle label="Lembretes das refeições" checked={config.preferences.refeicao_enabled} onChange={(value) => void patchPreferences({ refeicao_enabled: value })} />
          <PreferenceToggle label="Resumo no domingo" checked={config.preferences.resumo_semanal_enabled} onChange={(value) => void patchPreferences({ resumo_semanal_enabled: value })} />
          {config.preferences.resumo_semanal_enabled ? <TimePreference label="Horário do resumo" value={config.preferences.resumo_horario} onChange={(value) => void patchPreferences({ resumo_horario: value })} /> : null}
        </div>
      ) : null}
    </Card>
  );
}

function PreferenceToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex min-h-tap items-center justify-between gap-sp-3 text-body"><span>{label}</span><input type="checkbox" className="h-6 w-6 accent-rotina-500" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}

function TimePreference({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="flex min-h-tap items-center justify-between gap-sp-3 text-label text-text-secondary"><span>{label}</span><input aria-label={label} type="time" className="min-h-tap rounded-md border border-border bg-surface-sunken px-sp-3 text-body text-text" value={value.slice(0, 5)} onChange={(event) => onChange(event.target.value)} /></label>;
}
