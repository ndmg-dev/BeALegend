import { useSyncStatus } from '@/features/sync/useSyncStatus';
import { cn } from './cn';
import { Icon } from './Icon';

/**
 * Estado da fila de escrita.
 *
 * Nunca só por cor: cada estado tem ícone e texto. O usuário precisa saber
 * que o registro está salvo mesmo sem rede — é o que sustenta a confiança de
 * registrar na academia com o celular sem sinal.
 */
export function SyncIndicator({ className }: { className?: string }) {
  const { emAndamento, pendentes } = useSyncStatus();

  if (!emAndamento && pendentes === 0) return null;

  const texto = emAndamento
    ? 'Sincronizando…'
    : `${pendentes} ${pendentes === 1 ? 'registro' : 'registros'} para enviar`;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex items-center gap-sp-2 text-caption text-text-muted', className)}
    >
      <Icon name={emAndamento ? 'sync' : 'cloud-pending'} size={16} />
      {texto}
    </div>
  );
}
