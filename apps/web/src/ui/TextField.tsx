import { useId } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from './cn';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
}

export function TextField({ label, hint, error, className, id, ...rest }: Props) {
  const generated = useId();
  const inputId = id ?? generated;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className="flex flex-col gap-sp-2">
      <label htmlFor={inputId} className="text-label text-text-secondary">
        {label}
      </label>
      <input
        {...rest}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'min-h-tap rounded-md border bg-surface-sunken px-sp-4 text-body text-text',
          'placeholder:text-text-muted',
          'transition-colors duration-micro',
          error ? 'border-danger' : 'border-border focus:border-accent',
          className,
        )}
      />
      {/* Estado nunca só por cor: o erro tem texto e ícone. */}
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="flex items-center gap-sp-2 text-label text-danger">
          <span aria-hidden="true">⚠</span>
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
