import { request } from './client';

/**
 * Todos os dados do usuário, num JSON só — a mesma forma do delta de sync,
 * sem cursor. O formato varia por usuário (só entidades com dado viram
 * chave), então não há um schema Zod fixo para validar; a tela só baixa o
 * que a API devolver.
 */
export async function exportarDados(): Promise<unknown> {
  return request('/auth/export');
}
