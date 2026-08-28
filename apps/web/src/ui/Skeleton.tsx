import { cn } from './cn';

export function Skeleton({ className }: { className?: string }) {
  return <div role="status" aria-label="Carregando" className={cn('h-20 animate-pulse rounded-lg bg-surface-raised motion-reduce:animate-none', className)} />;
}
