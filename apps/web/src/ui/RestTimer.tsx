import { useEffect, useRef, useState } from 'react';
import { formatarTempo, iniciarRestTimer, tick } from '@/domain/training/restTimer';
import { PATTERN_REST_DONE, vibrate } from '@/platform/haptics';
import { cn } from './cn';

interface Props {
  duracaoSeg: number;
  onConcluido?: () => void;
  className?: string;
}

/**
 * Timer de descanso circular. Dispara sozinho quando o executor marca uma
 * série concluída; vibra ao terminar. Nunca é o único sinal — o número e o
 * anel visual comunicam o mesmo estado.
 */
export function RestTimer({ duracaoSeg, onConcluido, className }: Props) {
  const [estado, setEstado] = useState(() => iniciarRestTimer(duracaoSeg));
  const avisouRef = useRef(false);

  useEffect(() => {
    setEstado(iniciarRestTimer(duracaoSeg));
    avisouRef.current = false;
  }, [duracaoSeg]);

  useEffect(() => {
    if (estado.concluido) return;
    const id = window.setInterval(() => setEstado((e) => tick(e)), 1000);
    return () => window.clearInterval(id);
  }, [estado.concluido]);

  useEffect(() => {
    if (estado.concluido && !avisouRef.current) {
      avisouRef.current = true;
      vibrate(PATTERN_REST_DONE);
      onConcluido?.();
    }
  }, [estado.concluido, onConcluido]);

  const progresso = duracaoSeg > 0 ? 1 - estado.restanteSeg / duracaoSeg : 1;
  const circunferencia = 2 * Math.PI * 54;

  return (
    <div
      role="timer"
      aria-live="polite"
      className={cn('relative grid place-items-center', className)}
      style={{ width: 140, height: 140 }}
    >
      <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90">
        <circle cx="60" cy="60" r="54" fill="none" stroke="var(--border)" strokeWidth="8" />
        <circle
          cx="60"
          cy="60"
          r="54"
          fill="none"
          stroke={estado.concluido ? 'var(--success)' : 'var(--tr-400)'}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circunferencia}
          strokeDashoffset={circunferencia * (1 - progresso)}
          className="transition-[stroke-dashoffset] duration-1000 ease-in motion-reduce:transition-none"
        />
      </svg>
      <span className="text-title font-semibold tabular-nums">
        {estado.concluido ? 'Pronto' : formatarTempo(estado.restanteSeg)}
      </span>
    </div>
  );
}
