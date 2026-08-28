import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthPage } from '@/features/auth/AuthPage';
import { useSession } from '@/features/auth/useSession';
import { AppShell } from './AppShell';
import { RequireAuth } from './RequireAuth';
import { Providers } from './providers';
import { ExercisesPage } from '@/features/training/ExercisesPage';
import { ComerPage, GranaPage, HojePage, MetasPage } from './routes/placeholders';
import { useServiceWorker } from './useServiceWorker';
import { iniciarSync } from '@/data/sync/engine';

export function App() {
  const bootstrap = useSession((s) => s.bootstrap);
  const autenticado = useSession((s) => s.status === 'autenticado');
  useServiceWorker();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // O sync só liga com sessão: sem token, todo push volta 401 e a fila só
  // acumula tentativa à toa.
  useEffect(() => {
    if (!autenticado) return;
    return iniciarSync();
  }, [autenticado]);

  return (
    <Providers>
      <BrowserRouter>
        <Routes>
          <Route path="/entrar" element={<AuthPage modo="entrar" />} />
          <Route path="/criar-conta" element={<AuthPage modo="criar" />} />
          <Route
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route path="/hoje" element={<HojePage />} />
            <Route path="/treino" element={<ExercisesPage />} />
            <Route path="/comer" element={<ComerPage />} />
            <Route path="/grana" element={<GranaPage />} />
            <Route path="/metas" element={<MetasPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/hoje" replace />} />
        </Routes>
      </BrowserRouter>
    </Providers>
  );
}
