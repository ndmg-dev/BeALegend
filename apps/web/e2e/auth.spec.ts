import { expect, test } from '@playwright/test';

/**
 * Fluxo de auth da fase 0, contra o stack real (Vite + API + Postgres).
 * Os três fluxos críticos do projeto — executar treino, lançar gasto e
 * sincronizar após período offline — entram nas fases 1–3.
 */

function novoEmail(): string {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@exemplo.com`;
}

const SENHA = 'senha-de-teste-e2e';

test('rota protegida redireciona para o login', async ({ page }) => {
  await page.goto('/hoje');
  await expect(page).toHaveURL(/\/entrar/);
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
});

test('cria conta, entra e a sessão sobrevive ao reload', async ({ page }) => {
  await page.goto('/criar-conta');
  await page.getByLabel('E-mail').fill(novoEmail());
  await page.getByLabel('Senha').fill(SENHA);
  await page.getByRole('button', { name: 'Criar conta' }).click();

  await expect(page).toHaveURL(/\/hoje/);
  await expect(page.getByRole('heading', { name: 'Hoje' })).toBeVisible();

  // O access token vive só em memória: quem ressuscita a sessão depois do
  // reload é o cookie httpOnly de refresh. Se isso quebrar, o usuário é
  // deslogado a cada vez que fecha o app — e o app morre.
  await page.reload();
  await expect(page).toHaveURL(/\/hoje/);
  await expect(page.getByRole('heading', { name: 'Hoje' })).toBeVisible();
});

test('credenciais inválidas mostram o erro da API, não um erro de rede', async ({ page }) => {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(novoEmail());
  await page.getByLabel('Senha').fill('senha-errada-mesmo');
  await page.getByRole('button', { name: 'Entrar' }).click();

  // Texto exato: garante que a mensagem veio do backend (RFC 7807) e não do
  // fallback de NetworkError, que apareceria igual se a API estivesse fora.
  await expect(page.getByRole('alert')).toHaveText(/E-mail ou senha incorretos/);
});

test('navegação entre os cinco destinos funciona depois do login', async ({ page }) => {
  await page.goto('/criar-conta');
  await page.getByLabel('E-mail').fill(novoEmail());
  await page.getByLabel('Senha').fill(SENHA);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page).toHaveURL(/\/hoje/);

  for (const destino of ['Treino', 'Comer', 'Grana', 'Metas']) {
    await page.getByRole('link', { name: destino }).click();
    await expect(page.getByRole('heading', { name: destino })).toBeVisible();
  }
});

test('alvos de toque respeitam o mínimo de 48px', async ({ page }) => {
  await page.goto('/entrar');
  const box = await page.getByRole('button', { name: 'Entrar' }).boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
});
