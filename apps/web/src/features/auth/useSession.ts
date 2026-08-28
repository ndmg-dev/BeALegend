import { create } from 'zustand';
import type { User } from '@/data/api/auth';
import * as api from '@/data/api/auth';

type Status = 'carregando' | 'autenticado' | 'anonimo';

interface SessionState {
  status: Status;
  user: User | null;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; password: string; nome?: string }) => Promise<void>;
  logout: () => Promise<void>;
}

export const useSession = create<SessionState>((set) => ({
  status: 'carregando',
  user: null,

  bootstrap: async () => {
    const user = await api.restoreSession();
    set((estado) => {
      // O usuário pode ter entrado ou criado conta enquanto esta chamada
      // estava no ar — ela é disparada no boot e leva um round trip. Sem esta
      // guarda, a resposta atrasada derruba a sessão recém-criada.
      if (estado.status === 'autenticado') return estado;
      return user ? { status: 'autenticado', user } : { status: 'anonimo', user: null };
    });
  },

  login: async (email, password) => {
    await api.login(email, password);
    set({ status: 'autenticado', user: await api.fetchMe() });
  },

  register: async (input) => {
    await api.register(input);
    set({ status: 'autenticado', user: await api.fetchMe() });
  },

  logout: async () => {
    await api.logout().catch(() => undefined);
    set({ status: 'anonimo', user: null });
  },
}));
