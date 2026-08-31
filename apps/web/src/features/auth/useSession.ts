import { create } from 'zustand';
import type { User } from '@/data/api/auth';
import * as api from '@/data/api/auth';
import { lerUsuarioLocal, gravarUsuarioLocal, limparUsuarioLocal } from '@/data/db/sessionRepo';
import { unregisterSubscription } from '@/data/api/notifications';
import { currentSubscription } from '@/platform/notifications';

type Status = 'carregando' | 'autenticado' | 'anonimo';

interface SessionState {
  status: Status;
  user: User | null;
  /** `true` quando a sessão veio do cache local e ainda não foi confirmada. */
  offline: boolean;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; password: string; nome?: string }) => Promise<void>;
  logout: () => Promise<void>;
}

export const useSession = create<SessionState>((set) => ({
  status: 'carregando',
  user: null,
  offline: false,

  bootstrap: async () => {
    const resultado = await api.restoreSession();

    if (resultado.tipo === 'autenticado') {
      await gravarUsuarioLocal(resultado.user);
      set((estado) => {
        // O usuário pode ter entrado ou criado conta enquanto esta chamada
        // estava no ar — ela é disparada no boot e leva um round trip. Sem
        // esta guarda, a resposta atrasada derruba a sessão recém-criada.
        if (estado.status === 'autenticado') return estado;
        return { status: 'autenticado', user: resultado.user, offline: false };
      });
      return;
    }

    if (resultado.tipo === 'offline') {
      // Sessão do cache: o app abre e registra normalmente. O access token
      // chega quando a rede voltar, e o sync sobe a fila.
      const local = await lerUsuarioLocal();
      set((estado) => {
        if (estado.status === 'autenticado') return estado;
        return local
          ? { status: 'autenticado', user: local, offline: true }
          : { status: 'anonimo', user: null, offline: false };
      });
      return;
    }

    await limparUsuarioLocal();
    set((estado) =>
      estado.status === 'autenticado'
        ? estado
        : { status: 'anonimo', user: null, offline: false },
    );
  },

  login: async (email, password) => {
    await api.login(email, password);
    const user = await api.fetchMe();
    await gravarUsuarioLocal(user);
    set({ status: 'autenticado', user, offline: false });
  },

  register: async (input) => {
    await api.register(input);
    const user = await api.fetchMe();
    await gravarUsuarioLocal(user);
    set({ status: 'autenticado', user, offline: false });
  },

  logout: async () => {
    const subscription = await currentSubscription().catch(() => null);
    if (subscription) {
      await unregisterSubscription(subscription.endpoint).catch(() => undefined);
      await subscription.unsubscribe().catch(() => false);
    }
    await api.logout().catch(() => undefined);
    await limparUsuarioLocal();
    set({ status: 'anonimo', user: null, offline: false });
  },
}));
