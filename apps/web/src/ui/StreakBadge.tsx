export function StreakBadge({ days, atRisk = false }: { days: number; atRisk?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-sp-2 rounded-full px-sp-4 py-sp-2 text-label font-semibold ${atRisk ? 'bg-warning-bg text-warning' : 'bg-rotina-900/40 text-rotina-300'}`}>
      <span aria-hidden="true">{atRisk ? '⚠' : '●'}</span>
      {days} {days === 1 ? 'dia' : 'dias'}{atRisk ? ' · em risco' : ''}
    </span>
  );
}
