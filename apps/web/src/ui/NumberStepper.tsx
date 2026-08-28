import { cn } from './cn';

/**
 * Ajuste de valor em ±, sem abrir teclado.
 *
 * O usuário está com a mão suada segurando um halter — alvos de 48px mínimo,
 * e nada que exija digitar.
 */
interface Props {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  /** Como exibir o valor — "82,5 kg", "12 reps". */
  format?: (value: number) => string;
  className?: string;
}

export function NumberStepper({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  max = Infinity,
  format,
  className,
}: Props) {
  const diminuir = (): void => onChange(Math.max(min, round(value - step)));
  const aumentar = (): void => onChange(Math.min(max, round(value + step)));

  return (
    <div className={cn('flex flex-col items-center gap-sp-2', className)}>
      <span className="text-label text-text-muted">{label}</span>
      <div className="flex items-center gap-sp-3">
        <button
          type="button"
          onClick={diminuir}
          disabled={value <= min}
          aria-label={`Diminuir ${label}`}
          className="grid min-h-tap min-w-tap place-items-center rounded-full border border-border bg-surface-raised text-title text-text transition-colors duration-micro hover:border-neutro-500 disabled:opacity-40"
        >
          −
        </button>

        <span
          className="min-w-[4.5ch] text-center text-title font-semibold tabular-nums"
          aria-live="polite"
        >
          {format ? format(value) : value}
        </span>

        <button
          type="button"
          onClick={aumentar}
          disabled={value >= max}
          aria-label={`Aumentar ${label}`}
          className="grid min-h-tap min-w-tap place-items-center rounded-full border border-border bg-surface-raised text-title text-text transition-colors duration-micro hover:border-neutro-500 disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}

function round(n: number): number {
  // Evita 82.50000000000001 de ponto flutuante em incrementos de 0.5 / 2.5.
  return Math.round(n * 100) / 100;
}
