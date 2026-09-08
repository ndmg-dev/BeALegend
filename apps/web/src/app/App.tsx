import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthPage } from '@/features/auth/AuthPage';
import { useSession } from '@/features/auth/useSession';
import { AppShell } from './AppShell';
import { RequireAuth } from './RequireAuth';
import { Providers } from './providers';
import { PlanoSemanaPage } from '@/features/training/PlanoSemanaPage';
import { ExecutorPage } from '@/features/training/ExecutorPage';
import { ExercisesPage } from '@/features/training/ExercisesPage';
import { FinancePage } from '@/features/finance/FinancePage';
import { NutritionPage } from '@/features/nutrition/NutritionPage';
import { GoalsPage } from '@/features/routine/GoalsPage';
import { TodayPage } from '@/features/dashboard/TodayPage';
import { useServiceWorker } from './useServiceWorker';
import { iniciarSync } from '@/data/sync/engine';

// Fora dos quatro destinos principais da tab bar: só baixa quem realmente
// visita. ProgressPage carrega o recharts (a maior dependência do bundle) e
// só é usada dentro de /treino/progresso.
//
// ExecutorPage e ExercisesPage ficam de fora do lazy de propósito: são as
// rotas que a promessa offline-first do app mais precisa cumprir (registrar
// treino sem sinal na academia). Lazy nelas significa que perder a conexão
// bem no instante da navegação — exatamente o cenário que a arquitetura
// offline existe para cobrir — pode travar a tela pra sempre no fallback do
// Suspense, com o import() nunca resolvendo. O byte a mais no chunk inicial
// (ambas somam poucos kB) vale muito menos que essa garantia.
const ProgressPage = lazy(() =>
  import('@/features/training/ProgressPage').then((m) => ({ default: m.ProgressPage })),
);
const AchievementsPage = lazy(() =>
  import('@/features/achievements/AchievementsPage').then((m) => ({ default: m.AchievementsPage })),
);
const PartnersPage = lazy(() =>
  import('@/features/partners/PartnersPage').then((m) => ({ default: m.PartnersPage })),
);

function CarregandoRota() {
  return (
    <div role="status" className="mx-auto max-w-2xl text-text-muted">
      Carregando…
    </div>
  );
}

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
        <Suspense fallback={<CarregandoRota />}>
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
              <Route path="/treino/progresso" element={<ProgressPage />} />
              <Route path="/treino/:planDayId" element={<ExecutorPage />} />
              <Route path="/comer" element={<NutritionPage />} />
              <Route path="/grana" element={<FinancePage />} />
              <Route path="/metas" element={<GoalsPage />} />
              <Route path="/conquistas" element={<AchievementsPage />} />
              <Route path="/parceiro" element={<PartnersPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/hoje" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </Providers>
  );
}
