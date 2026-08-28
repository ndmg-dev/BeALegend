import { NavLink, Outlet } from 'react-router-dom';
import { OfflineBanner } from '@/ui/OfflineBanner';
import { cn } from '@/ui/cn';

// Cinco destinos, cada domínio com sua cor — a tela "Hoje" mistura os quatro,
// então a identidade cromática é o que dá para ler um card de relance.
const DESTINOS = [
  { to: '/hoje', label: 'Hoje', icone: '◎', cor: 'text-rotina-300' },
  { to: '/treino', label: 'Treino', icone: '⬛', cor: 'text-treino-300' },
  { to: '/comer', label: 'Comer', icone: '◍', cor: 'text-nutricao-300' },
  { to: '/grana', label: 'Grana', icone: '◈', cor: 'text-financas-300' },
  { to: '/metas', label: 'Metas', icone: '◇', cor: 'text-rotina-300' },
] as const;

export function AppShell() {
  return (
    <div className="min-h-dvh bg-bg text-text md:flex">
      {/* desktop: sidebar */}
      <nav aria-label="Seções" className="hidden md:flex md:w-56 md:flex-col md:gap-sp-1 md:border-r md:border-border md:p-sp-4">
        <span className="mb-sp-4 px-sp-3 text-subhead">BeALegend</span>
        {DESTINOS.map((d) => (
          <NavLink key={d.to} to={d.to} className={({ isActive }) => navClass(isActive, false)}>
            <span aria-hidden="true" className={d.cor}>{d.icone}</span>
            {d.label}
          </NavLink>
        ))}
      </nav>

      <div className="flex min-h-dvh flex-1 flex-col">
        <OfflineBanner />
        <main className="flex-1 px-sp-4 pb-[calc(var(--tap-min)+24px)] pt-sp-4 md:pb-sp-6">
          <Outlet />
        </main>

        {/* mobile: bottom tab bar */}
        <nav
          aria-label="Seções"
          className="safe-bottom fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t border-border bg-surface md:hidden"
        >
          {DESTINOS.map((d) => (
            <NavLink key={d.to} to={d.to} className={({ isActive }) => navClass(isActive, true)}>
              <span aria-hidden="true" className={d.cor}>{d.icone}</span>
              {d.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}

function navClass(isActive: boolean, mobile: boolean): string {
  return cn(
    'flex min-h-tap items-center justify-center gap-sp-2 rounded-md text-label transition-colors duration-micro',
    mobile ? 'flex-col gap-sp-1 text-caption' : 'justify-start px-sp-3',
    // estado nunca só por cor: o item ativo também fica em peso semibold
    isActive ? 'font-semibold text-text' : 'text-text-muted',
    !mobile && isActive && 'bg-surface-raised',
  );
}
