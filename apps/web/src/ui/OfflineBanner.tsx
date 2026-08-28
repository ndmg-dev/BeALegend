import { useOnline } from '@/platform/network';

/** Offline não é erro, é um estado do app. Informa sem interromper o registro. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;

  return (
    <div
      role="status"
      className="flex items-center gap-sp-2 bg-info-bg px-sp-4 py-sp-2 text-label text-info"
    >
      <span aria-hidden="true">⭘</span>
      Sem conexão — seus registros ficam salvos e sobem quando a rede voltar.
    </div>
  );
}
