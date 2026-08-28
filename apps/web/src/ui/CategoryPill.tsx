import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  icon?: string | null;
}

export function CategoryPill({ selected = false, icon, className, children, ...props }: Props) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      {...props}
      className={cn(
        'min-h-tap rounded-full border px-sp-4 text-label transition-colors duration-micro',
        selected
          ? 'border-financas-400 bg-financas-900/30 font-semibold text-financas-300'
          : 'border-border bg-surface text-text-secondary',
        className,
      )}
    >
      {icon ? <span aria-hidden="true" className="mr-sp-2">{icon}</span> : null}
      {children}
    </button>
  );
}
