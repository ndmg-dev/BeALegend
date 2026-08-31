import type { ReactNode } from 'react';
import { Card } from './Card';

/**
 * Estado vazio — geometria do próprio app, nunca foto de estoque.
 *
 * As três ilustrações (`treino`, `gastos`, `vazio`) vêm de
 * `public/assets/empty-*.svg`. Sem `illustration`, o card funciona só com
 * texto — o que importa é a mensagem, a ilustração é reforço visual.
 */
type Illustration = 'treino' | 'gastos' | 'vazio';

const SRC: Record<Illustration, string> = {
  treino: '/assets/empty-treino.svg',
  gastos: '/assets/empty-gastos.svg',
  vazio: '/assets/empty-vazio.svg',
};

interface Props {
  title: string;
  children: ReactNode;
  illustration?: Illustration;
}

export function EmptyState({ title, children, illustration }: Props) {
  return (
    <Card className="flex flex-col items-center text-center">
      {illustration ? (
        <img src={SRC[illustration]} alt="" width={72} height={72} className="mb-sp-3" />
      ) : null}
      <h2 className="text-heading">{title}</h2>
      <div className="mt-sp-2 text-body text-text-muted">{children}</div>
    </Card>
  );
}
