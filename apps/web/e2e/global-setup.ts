import { request } from '@playwright/test';

const API_URL = process.env['E2E_API_URL'] ?? 'http://localhost:8000';

/**
 * Estes testes exercitam auth de verdade — cookie de refresh, rotação, sessão
 * que sobrevive ao reload. Sem a API no ar eles passariam pelo motivo errado:
 * o front trataria a falha de rede como "sem conexão" e o `role="alert"`
 * apareceria do mesmo jeito. Melhor falhar aqui, com uma mensagem que diz o
 * que fazer.
 */
export default async function globalSetup(): Promise<void> {
  const context = await request.newContext();
  try {
    const response = await context.get(`${API_URL}/readyz`, { timeout: 5000 });
    if (!response.ok()) throw new Error(`readyz devolveu ${response.status()}`);
  } catch (cause) {
    throw new Error(
      `A API não respondeu em ${API_URL}.\n\n` +
        'Os testes E2E precisam do stack completo:\n' +
        '  docker compose -f infra/docker-compose.yml up -d db\n' +
        '  cd apps/api && alembic upgrade head && uvicorn app.main:app\n\n' +
        `Causa: ${String(cause)}`,
    );
  } finally {
    await context.dispose();
  }
}
