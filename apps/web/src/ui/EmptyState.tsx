import type { ReactNode } from 'react';
import { Card } from './Card';

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return <Card className="text-center"><h2 className="text-heading">{title}</h2><div className="mt-sp-2 text-body text-text-muted">{children}</div></Card>;
}
