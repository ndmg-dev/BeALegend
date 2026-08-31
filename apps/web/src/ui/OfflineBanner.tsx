import { useOnline } from '@/platform/network';
import { Icon } from './Icon';

/** Offline não é erro, é um estado do app. Informa sem interromper o registro. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;

  return (
    <div
      role="status"
      className="flex items-center gap-sp-2 bg-info-bg px-sp-4 py-sp-2 text-label text-info"
    >
      <Icon name="offline" size={16} />
      Sem conexão — seus registros ficam salvos e sobem quando a rede voltar.
    </div>
  );
}
