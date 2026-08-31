import { expect, test } from '@playwright/test';

const PASSWORD = 'senha-de-teste-1';

test('registra refeição e água offline e preserva após reload', async ({ page, context }) => {
  const email = `nutrition-${Date.now()}-${Math.random().toString(16).slice(2)}@exemplo.com`;
  await page.goto('/criar-conta');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page).toHaveURL(/\/hoje/);

  await page.getByRole('link', { name: 'Comer' }).click();
  const lunch = page.getByText('Almoço', { exact: true }).locator('..').locator('..');
  await expect(lunch.getByRole('button', { name: 'Registrar' })).toBeVisible({ timeout: 15_000 });

  await context.setOffline(true);
  await lunch.getByRole('button', { name: 'Registrar' }).click();
  await page.getByLabel('O que você comeu?').fill('Arroz, feijão e frango');
  await page.getByRole('button', { name: 'Parcial' }).click();
  await page.getByRole('button', { name: 'caseiro' }).click();
  await page.getByRole('button', { name: 'Registrar refeição' }).click();

  await expect(page.getByText('50% de aderência hoje')).toBeVisible();
  await page.getByRole('button', { name: '+ 250 ml' }).click();
  await expect(page.getByText('250 ml', { exact: true })).toBeVisible();
  const pending = page.getByRole('status').filter({ hasText: 'para enviar' });
  await expect(pending).toBeVisible();

  await page.reload();
  await expect(page.getByText('50% de aderência hoje')).toBeVisible();
  await expect(page.getByText('250 ml', { exact: true })).toBeVisible();
  await expect(page.getByText('caseiro', { exact: true })).toBeVisible();

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(pending).toHaveCount(0, { timeout: 20_000 });
});
