import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { estadoAtual, observarSync, type EstadoSync } from '@/data/sync/engine';
import { quantidadePendente } from '@/data/sync/outbox';

/**
 * Estado do sync para a UI.
 *
 * A contagem de pendentes vem direto do Dexie, e não do motor: offline o
 * motor nem roda, e é justamente offline que o usuário precisa ver que o
 * registro está salvo e na fila.
 */
export function useSyncStatus(): EstadoSync {
  const [estado, setEstado] = useState<EstadoSync>(estadoAtual);
  const pendentes = useLiveQuery(() => quantidadePendente(), [], 0);

  useEffect(() => observarSync(setEstado), []);

  return { ...estado, pendentes };
}
