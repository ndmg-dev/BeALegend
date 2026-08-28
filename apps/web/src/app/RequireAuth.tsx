import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '@/features/auth/useSession';

export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useSession((s) => s.status);
  const location = useLocation();

  if (status === 'carregando') {
    return (
      <div role="status" aria-live="polite" className="grid min-h-dvh place-items-center text-text-muted">
        Carregando…
      </div>
    );
  }

  if (status === 'anonimo') {
    return <Navigate to="/entrar" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
