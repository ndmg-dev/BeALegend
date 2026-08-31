import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';
import { Icon, type IconName } from './Icon';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  /** Ícone-âncora à esquerda do campo — ver tela de Entrar em docs/brand.md. */
  icon?: IconName | undefined;
  /** Controle à direita do campo (ex.: alternar visibilidade da senha). */
  trailing?: ReactNode;
}

export function TextField({ label, hint, error, icon, trailing, className, id, ...rest }: Props) {
  const generated = useId();
  const inputId = id ?? generated;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className="flex flex-col gap-sp-2">
      <label htmlFor={inputId} className="text-label text-text-secondary">
        {label}
      </label>
      <div className="relative">
        {icon ? (
          <Icon
            name={icon}
            size={20}
            className="pointer-events-none absolute left-sp-4 top-1/2 -translate-y-1/2 text-text-muted"
          />
        ) : null}
        <input
          {...rest}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'min-h-tap w-full rounded-md border bg-surface-sunken px-sp-4 text-body text-text',
            icon && 'pl-[52px]',
            trailing ? 'pr-[52px]' : false,
            'placeholder:text-text-muted',
            'transition-colors duration-micro',
            error ? 'border-danger' : 'border-border focus:border-accent',
            className,
          )}
        />
        {trailing ? (
          <div className="absolute right-sp-2 top-1/2 -translate-y-1/2">{trailing}</div>
        ) : null}
      </div>
      {/* Estado nunca só por cor: o erro tem texto e ícone. */}
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="flex items-center gap-sp-2 text-label text-danger">
          <Icon name="alert" size={16} />
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-label text-text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
