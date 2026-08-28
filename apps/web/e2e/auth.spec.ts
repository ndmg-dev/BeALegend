import { expect, test } from '@playwright/test';

/**
 * Fluxo mínimo da fase 0. Os três fluxos críticos do projeto — executar treino,
 * lançar gasto e sincronizar após período offline — entram nas fases 1–3.
 */
test('rota protegida redireciona para o login', async ({ page }) => {
  await page.goto('/hoje');
  await expect(page).toHaveURL(/\/entrar/);
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
});

test('credenciais inválidas mostram erro acessível, não só cor', async ({ page }) => {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('ninguem@exemplo.com');
  await page.getByLabel('Senha').fill('senha-errada-1');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
});

test('alvos de toque respeitam o mínimo de 48px', async ({ page }) => {
  await page.goto('/entrar');
  const box = await page.getByRole('button', { name: 'Entrar' }).boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
});
