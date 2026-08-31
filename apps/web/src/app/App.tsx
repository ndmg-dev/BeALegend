import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthPage } from '@/features/auth/AuthPage';
import { useSession } from '@/features/auth/useSession';
import { AppShell } from './AppShell';
import { RequireAuth } from './RequireAuth';
import { Providers } from './providers';
import { ExecutorPage } from '@/features/training/ExecutorPage';
import { ExercisesPage } from '@/features/training/ExercisesPage';
import { PlanoSemanaPage } from '@/features/training/PlanoSemanaPage';
import { FinancePage } from '@/features/finance/FinancePage';
import { NutritionPage } from '@/features/nutrition/NutritionPage';
import { GoalsPage } from '@/features/routine/GoalsPage';
import { AchievementsPage } from '@/features/achievements/AchievementsPage';
import { TodayPage } from '@/features/dashboard/TodayPage';
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
            <Route path="/hoje" element={<TodayPage />} />
            <Route path="/treino" element={<PlanoSemanaPage />} />
            <Route path="/treino/exercicios" element={<ExercisesPage />} />
            <Route path="/treino/:planDayId" element={<ExecutorPage />} />
            <Route path="/comer" element={<NutritionPage />} />
            <Route path="/grana" element={<FinancePage />} />
            <Route path="/metas" element={<GoalsPage />} />
            <Route path="/conquistas" element={<AchievementsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/hoje" replace />} />
        </Routes>
      </BrowserRouter>
    </Providers>
  );
}
