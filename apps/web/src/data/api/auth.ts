import { z } from 'zod';
import { request, setAccessToken } from './client';

export const accessTokenSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number(),
});

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  nome: z.string(),
  timezone: z.string(),
  is_admin: z.boolean(),
  criado_em: z.string(),
});

export type User = z.infer<typeof userSchema>;

export async function login(email: string, password: string): Promise<void> {
  const data = await request('/auth/login', {
    method: 'POST',
    body: { email, password },
    schema: accessTokenSchema,
  });
  setAccessToken(data.access_token);
}

export async function register(input: {
  email: string;
  password: string;
  nome?: string;
  timezone?: string;
}): Promise<void> {
  const data = await request('/auth/register', {
    method: 'POST',
    body: {
      ...input,
      timezone: input.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    schema: accessTokenSchema,
  });
  setAccessToken(data.access_token);
}

export async function logout(): Promise<void> {
  await request('/auth/logout', { method: 'POST' });
  setAccessToken(null);
}

export function fetchMe(): Promise<User> {
  return request('/auth/me', { schema: userSchema });
}

/** Tenta ressuscitar a sessão no boot, usando só o cookie de refresh. */
export async function restoreSession(): Promise<User | null> {
  try {
    const data = await request('/auth/refresh', {
      method: 'POST',
      schema: accessTokenSchema,
      skipRefresh: true,
    });
    setAccessToken(data.access_token);
    return await fetchMe();
  } catch {
    setAccessToken(null);
    return null;
  }
}
