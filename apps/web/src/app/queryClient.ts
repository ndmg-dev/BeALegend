import { QueryClient } from '@tanstack/react-query';
import { NetworkError } from '@/data/api/problem';

// Offline-first: o cache serve stale sem hesitar, e um erro de rede não é
// motivo para o TanStack Query insistir — quem insiste é a outbox (fase 1).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60 * 1000,
      refetchOnWindowFocus: true,
      networkMode: 'offlineFirst',
      retry: (failureCount, error) => !(error instanceof NetworkError) && failureCount < 2,
    },
    mutations: { networkMode: 'offlineFirst', retry: 0 },
  },
});
