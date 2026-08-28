import { z } from 'zod';
import { ApiError, NetworkError, problemSchema } from './problem';

const BASE_URL: string = (import.meta.env['VITE_API_URL'] as string | undefined) ?? '/api';

/**
 * O access token vive só em memória: 15 minutos de vida e zero exposição a XSS
 * persistente. Quem sobrevive ao reload é o refresh token, no cookie httpOnly.
 */
let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface RequestOptions<T> {
  method?: Method;
  body?: unknown;
  schema?: z.ZodType<T>;
  /** Interno: evita laço quando o próprio /auth/refresh devolve 401. */
  skipRefresh?: boolean;
}

async function raw(path: string, method: Method, body: unknown): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  try {
    return await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? null : JSON.stringify(body),
    });
  } catch (cause) {
    throw new NetworkError(cause);
  }
}

/** Uma única renovação em voo, por mais requisições que esbarrem no 401 juntas. */
async function refreshAccessToken(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const response = await raw('/auth/refresh', 'POST', undefined);
      if (!response.ok) {
        accessToken = null;
        return false;
      }
      const data = (await response.json()) as { access_token: string };
      accessToken = data.access_token;
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function request<T = unknown>(
  path: string,
  { method = 'GET', body, schema, skipRefresh = false }: RequestOptions<T> = {},
): Promise<T> {
  let response = await raw(path, method, body);

  if (response.status === 401 && !skipRefresh) {
    if (await refreshAccessToken()) {
      response = await raw(path, method, body);
    }
  }

  if (!response.ok) {
    const parsed = problemSchema.safeParse(await response.json().catch(() => null));
    throw new ApiError(
      parsed.success
        ? parsed.data
        : { type: 'about:blank', title: 'Erro inesperado', status: response.status },
    );
  }

  if (response.status === 204) return undefined as T;

  const data: unknown = await response.json();
  // Zod valida toda resposta: o tipo gerado do OpenAPI é uma promessa,
  // o schema é a verificação.
  return schema ? schema.parse(data) : (data as T);
}
