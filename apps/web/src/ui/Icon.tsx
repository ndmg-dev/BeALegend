import type { SVGAttributes } from 'react';
import { cn } from './cn';

/**
 * Ícone do sprite único (`public/assets/icons.svg`).
 *
 * Grade 24, `currentColor`: herda a cor de quem usa — o domínio, o estado,
 * o texto ao redor. Nunca é o único portador de significado; sempre
 * acompanhado de rótulo ou valor visível (ver docs/brand.md).
 *
 * O traço afina à medida que o ícone cresce, para manter o peso ótico —
 * os quatro tamanhos em uso na interface (16/24/28/40) espelham exatamente
 * a especificação da marca.
 */

export type IconName =
  | 'tab-hoje'
  | 'tab-treino'
  | 'tab-comer'
  | 'tab-grana'
  | 'tab-metas'
  | 'plus'
  | 'minus'
  | 'check'
  | 'check-circle'
  | 'close'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-down'
  | 'more'
  | 'edit'
  | 'trash'
  | 'search'
  | 'filter'
  | 'undo'
  | 'timer'
  | 'streak'
  | 'trend-up'
  | 'trend-down'
  | 'budget'
  | 'scale'
  | 'chart'
  | 'note'
  | 'calendar'
  | 'user'
  | 'settings'
  | 'offline'
  | 'sync'
  | 'cloud-pending'
  | 'alert'
  | 'info'
  | 'mail'
  | 'lock'
  | 'eye'
  | 'eye-off'
  | 'trophy';

// 16/24/28/40 são os quatro tamanhos-âncora da especificação; 20 e 22 vêm
// do próprio mockup da tela de Entrar (ícone do campo e domínios no rodapé).
// O traço afina conforme o glifo cresce, para manter o peso ótico.
const SIZE_STROKE: Record<16 | 20 | 22 | 24 | 28 | 40, number> = {
  16: 1.9,
  20: 1.85,
  22: 1.8,
  24: 1.75,
  28: 1.6,
  40: 1.4,
};

interface Props extends Omit<SVGAttributes<SVGSVGElement>, 'children'> {
  name: IconName;
  /** 16 inline em texto · 24 padrão · 28 tab bar · 40 estado vazio. */
  size?: 16 | 20 | 22 | 24 | 28 | 40;
  /** Rótulo acessível — só quando o ícone é o único conteúdo do controle. */
  label?: string;
  className?: string;
}

export function Icon({ name, size = 24, label, className, ...rest }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={SIZE_STROKE[size]}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('shrink-0', className)}
      {...rest}
    >
      <use href={`/assets/icons.svg#${name}`} />
    </svg>
  );
}
