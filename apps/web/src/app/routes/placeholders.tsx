import { Card } from '@/ui/Card';

/**
 * Destinos das fases 2–5. Existem desde a fase 0 para que a navegação, o
 * roteamento e o shell já estejam testados quando as features chegarem.
 */
function Placeholder({ titulo, fase }: { titulo: string; fase: string }) {
  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="mb-sp-4 text-title">{titulo}</h1>
      <Card>
        <p className="text-body text-text-secondary">Chega na {fase}.</p>
      </Card>
    </section>
  );
}

export const HojePage = () => <Placeholder titulo="Hoje" fase="fase 5" />;
export const TreinoPage = () => <Placeholder titulo="Treino" fase="fase 2" />;
export const ComerPage = () => <Placeholder titulo="Comer" fase="fase 4" />;
export const GranaPage = () => <Placeholder titulo="Grana" fase="fase 3" />;
export const MetasPage = () => <Placeholder titulo="Metas" fase="fase 5" />;
