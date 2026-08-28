import type { ReactNode } from 'react';
import { Card } from './Card';

export function StatCard({ label, value, detail, className }: {
  label: string; value: ReactNode; detail?: ReactNode; className?: string;
}) {
  return (
    <Card className={className}>
      <p className="text-caption uppercase tracking-wider text-text-muted">{label}</p>
      <div className="mt-sp-2 text-title font-bold tabular-nums">{value}</div>
      {detail ? <div className="mt-sp-2 text-label text-text-secondary">{detail}</div> : null}
    </Card>
  );
}
