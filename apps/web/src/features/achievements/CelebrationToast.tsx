import { useEffect } from 'react';
import { findAchievement, type Tier } from '@/domain/achievements/catalog';
import { cn } from '@/ui/cn';
import { useCelebrationQueue } from './celebrationQueue';

const TIER_LABEL: Record<Tier, string> = {
  bronze: 'Bronze',
  prata: 'Prata',
  ouro: 'Ouro',
  platina: 'Platina',
};

const TIER_BORDER: Record<Tier, string> = {
  bronze: 'border-l-tier-bronze',
  prata: 'border-l-tier-prata',
  ouro: 'border-l-tier-ouro',
  platina: 'border-l-tier-platina',
};

const TIER_TEXT: Record<Tier, string> = {
  bronze: 'text-tier-bronze',
  prata: 'text-tier-prata',
  ouro: 'text-tier-ouro',
  platina: 'text-tier-platina',
};

const VISIVEL_MS = 5000;

/**
 * Comemoração de conquista — um troféu por vez, some sozinho ou ao toque.
 * Montado no AppShell. Ícones de tier vêm na fase 6; por ora é texto.
 */
export function CelebrationToast() {
  const fila = useCelebrationQueue((s) => s.fila);
  const descartar = useCelebrationQueue((s) => s.descartar);
  const atualKey = fila[0] ?? null;
  const conquista = atualKey ? findAchievement(atualKey) : undefined;

  useEffect(() => {
    if (!atualKey) return;
    // Chave que o catálogo não conhece mais (catálogo mudou): não trava a fila.
    if (!findAchievement(atualKey)) {
      descartar();
      return;
    }
    const t = window.setTimeout(descartar, VISIVEL_MS);
    return () => window.clearTimeout(t);
  }, [atualKey, descartar]);

  if (!conquista) return null;

  const restantes = fila.length - 1;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tap-min)+16px)] z-20 px-sp-4 md:bottom-sp-6">
      <button
        type="button"
        onClick={descartar}
        aria-live="polite"
        className={cn(
          'pointer-events-auto mx-auto flex w-full max-w-md flex-col gap-sp-1 rounded-lg border border-border border-l-4 bg-surface-raised p-sp-4 text-left shadow-lg',
          TIER_BORDER[conquista.tier],
        )}
      >
        <span className="text-caption uppercase tracking-wide text-text-muted">
          Conquista desbloqueada ·{' '}
          <span className={TIER_TEXT[conquista.tier]}>{TIER_LABEL[conquista.tier]}</span>
        </span>
        <span className="text-subhead">{conquista.titulo}</span>
        <span className="text-label text-text-secondary">{conquista.descricao}</span>
        <span className="mt-sp-1 text-caption text-text-muted">
          {restantes > 0 ? `Toque para ver a próxima (+${restantes})` : 'Toque para dispensar'}
        </span>
      </button>
    </div>
  );
}
