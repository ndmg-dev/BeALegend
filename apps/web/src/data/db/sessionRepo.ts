import { z } from 'zod';
import type { User } from '@/data/api/auth';
import { userSchema } from '@/data/api/auth';
import { db } from './schema';

/**
 * Perfil do usuário guardado localmente.
 *
 * Só o suficiente para o app abrir sem rede: id, e-mail, nome e — o que mais
 * importa — o fuso horário, porque toda fronteira de "dia" (streak, orçamento
 * diário, aderência) é calculada nele. Nenhum segredo mora aqui: o access
 * token continua só em memória e o refresh no cookie httpOnly.
 */

const CHAVE = 'sessao_usuario';

export async function gravarUsuarioLocal(user: User): Promise<void> {
  await db.meta.put({ chave: CHAVE, valor: JSON.stringify(user) });
}

export async function lerUsuarioLocal(): Promise<User | null> {
  const entrada = await db.meta.get(CHAVE);
  if (typeof entrada?.valor !== 'string') return null;

  const parsed = z
    .string()
    .transform((texto) => JSON.parse(texto) as unknown)
    .pipe(userSchema)
    .safeParse(entrada.valor);

  return parsed.success ? parsed.data : null;
}

export async function limparUsuarioLocal(): Promise<void> {
  await db.meta.delete(CHAVE);
}
