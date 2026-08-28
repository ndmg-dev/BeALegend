import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-contrast hover:brightness-110',
  secondary: 'bg-surface-raised text-text border border-border hover:border-neutro-500',
  ghost: 'bg-transparent text-text-secondary hover:text-text',
  danger: 'bg-danger-bg text-danger border border-danger/40 hover:brightness-110',
};

// Nunca abaixo de 48px: o usuário está com a mão suada segurando um halter.
const SIZES: Record<Size, string> = {
  md: 'min-h-tap px-sp-5 text-label',
  lg: 'min-h-[64px] px-sp-6 text-subhead',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  full?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  full = false,
  className,
  children,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      className={cn(
        'inline-flex items-center justify-center gap-sp-2 rounded-md font-semibold',
        'transition-colors duration-micro ease-in',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        full && 'w-full',
        className,
      )}
    >
      {children}
    </button>
  );
}
