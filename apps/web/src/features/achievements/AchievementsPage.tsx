import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { CATALOG, findAchievement, type Tier } from '@/domain/achievements/catalog';
import { statusDasConquistas, type ConquistaComStatus } from '@/data/db/achievementsRepo';
import { useSession } from '@/features/auth/useSession';
import { Card } from '@/ui/Card';
import { Icon } from '@/ui/Icon';
import { cn } from '@/ui/cn';
import { useCelebrationQueue } from './celebrationQueue';

const TIERS: Tier[] = ['bronze', 'prata', 'ouro', 'platina'];
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

function formatarData(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
}

export function AchievementsPage() {
  const user = useSession((s) => s.user);
  const timezone = user?.timezone ?? 'UTC';
  const status = useLiveQuery(() => statusDasConquistas(timezone), [timezone]);
  const backfillCount = useCelebrationQueue((s) => s.backfillCount);
  const limparBackfill = useCelebrationQueue((s) => s.limparBackfill);

  if (!status) {
    return (
      <div role="status" className="text-text-muted">
        Carregando conquistas…
      </div>
    );
  }

  const porChave = new Map(status.map((s) => [s.key, s]));
  const desbloqueadas = status.filter((s) => s.unlocked).length;

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-sp-5">
      <header className="flex items-center gap-sp-3">
        <Link
          to="/metas"
          aria-label="Voltar para Metas"
          className="grid min-h-tap min-w-tap place-items-center rounded-md text-text-muted"
        >
          <Icon name="chevron-left" size={24} />
        </Link>
        <div>
          <h1 className="text-title">Conquistas</h1>
          <p className="text-label text-text-muted tabular-nums">
            {desbloqueadas} de {CATALOG.length} desbloqueadas
          </p>
        </div>
      </header>

      {backfillCount > 0 ? (
        <Card className="flex items-start justify-between gap-sp-3 border-l-4 border-l-tier-ouro">
          <p className="text-body text-text-secondary">
            Você começou com <strong className="text-text">{backfillCount}</strong>{' '}
            {backfillCount === 1 ? 'conquista' : 'conquistas'} pelo seu histórico.
          </p>
          <button
            type="button"
            onClick={limparBackfill}
            className="shrink-0 text-label text-text-muted"
          >
            Entendi
          </button>
        </Card>
      ) : null}

      {TIERS.map((tier) => {
        const doTier = CATALOG.filter((a) => a.tier === tier);
        const feitas = doTier.filter((a) => porChave.get(a.key)?.unlocked).length;
        return (
          <div key={tier}>
            <h2 className="mb-sp-3 flex items-baseline justify-between text-heading">
              <span className={TIER_TEXT[tier]}>{TIER_LABEL[tier]}</span>
              <span className="text-label text-text-muted tabular-nums">
                {feitas}/{doTier.length}
              </span>
            </h2>
            <div className="grid gap-sp-3 sm:grid-cols-2">
              {doTier.map((a) => (
                <TrophyCard key={a.key} achievementKey={a.key} status={porChave.get(a.key)} />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function TrophyCard({
  achievementKey,
  status,
}: {
  achievementKey: string;
  status: ConquistaComStatus | undefined;
}) {
  const a = findAchievement(achievementKey);
  if (!a) return null;

  const unlocked = status?.unlocked ?? false;
  const secretaOculta = a.secreta && !unlocked;
  const fracao = status?.progress.fracao ?? 0;
  const atual = status?.progress.atual ?? 0;

  return (
    <Card
      className={cn(
        'flex items-start gap-sp-3 border-l-4',
        unlocked ? TIER_BORDER[a.tier] : 'border-l-border opacity-60',
      )}
    >
      <Icon
        name="trophy"
        size={24}
        className={cn('mt-sp-1 shrink-0', unlocked ? TIER_TEXT[a.tier] : 'text-text-muted')}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-sp-1">
        <span className="text-caption uppercase tracking-wide text-text-muted">
          {unlocked ? 'Desbloqueada' : secretaOculta ? 'Secreta' : `${atual} / ${a.alvo}`}
        </span>
        <span className="text-body font-semibold">{secretaOculta ? '???' : a.titulo}</span>
        <span className="text-label text-text-secondary">
          {secretaOculta ? 'Continue usando o app para revelar.' : a.descricao}
        </span>

        {unlocked && status?.desbloqueado_em ? (
          <span className="mt-sp-1 text-caption text-text-muted">
            {formatarData(status.desbloqueado_em)}
          </span>
        ) : !unlocked && !secretaOculta ? (
          <div
            className="mt-sp-2 h-1.5 overflow-hidden rounded-full bg-surface-sunken"
            role="progressbar"
            aria-valuenow={Math.round(fracao * 100)}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-text-muted"
              style={{ width: `${Math.min(100, fracao * 100)}%` }}
            />
          </div>
        ) : null}
      </div>
    </Card>
  );
}
