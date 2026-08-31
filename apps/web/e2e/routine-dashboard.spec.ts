import { expect, test } from '@playwright/test';

const PASSWORD = 'senha-de-teste-1';

test('painel e metas mantêm check-in offline após reload', async ({ page, context }) => {
  const email = `routine-${Date.now()}-${Math.random().toString(16).slice(2)}@exemplo.com`;
  await page.goto('/criar-conta');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page).toHaveURL(/\/hoje/);

  const reading = page.getByRole('checkbox', { name: /Ler 20 min/ });
  await expect(reading).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Hábitos pendentes' })).toBeVisible();

  await context.setOffline(true);
  await reading.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await reading.click();
  await expect(reading).toBeChecked();
  await expect(page.getByText('1 de 2 concluídos')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('checkbox', { name: /Ler 20 min/ })).toBeChecked();

  await page.getByRole('link', { name: 'Metas' }).click();
  await expect(page.getByRole('heading', { name: 'Metas' })).toBeVisible();
  await expect(page.getByText('3 treinos na semana')).toBeVisible();
  await expect(page.getByText('Beber 2 L de água')).toBeVisible();
  await expect(page.getByText('1 de 2 hábitos')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Resumo da semana' })).toBeVisible();
  await expect(page.getByText('1/12')).toBeVisible();

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByRole('heading', { name: 'Lembretes' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'para enviar' })).toHaveCount(0, {
    timeout: 20_000,
  });
});
