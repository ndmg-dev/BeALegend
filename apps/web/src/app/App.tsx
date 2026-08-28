import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthPage } from '@/features/auth/AuthPage';
import { useSession } from '@/features/auth/useSession';
import { AppShell } from './AppShell';
import { RequireAuth } from './RequireAuth';
import { Providers } from './providers';
import { ComerPage, GranaPage, HojePage, MetasPage, TreinoPage } from './routes/placeholders';
import { useServiceWorker } from './useServiceWorker';

export function App() {
  const bootstrap = useSession((s) => s.bootstrap);
  useServiceWorker();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

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
            <Route path="/treino" element={<TreinoPage />} />
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
