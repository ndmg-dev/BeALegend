import { expect, test } from '@playwright/test';

const PASSWORD = 'senha-de-teste-1';

test('registra gasto e acompanha orçamento mesmo após reload', async ({ page }) => {
  const email = `finance-${Date.now()}-${Math.random().toString(16).slice(2)}@exemplo.com`;
  await page.goto('/criar-conta');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page).toHaveURL(/\/hoje/);

  await page.getByRole('link', { name: 'Grana' }).click();
  await expect(page.getByRole('heading', { name: 'Novo gasto' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Mercado/ })).toBeVisible({ timeout: 15_000 });

  await page.getByLabel('Valor').fill('12,50');
  await page.getByRole('button', { name: /Mercado/ }).click();
  await page.getByRole('button', { name: 'Registrar gasto' }).click();
  await expect(page.getByText(/R\$\s*12,50 hoje/)).toBeVisible();

  await page.getByRole('combobox', { name: 'Categoria' }).selectOption({ label: 'Mercado' });
  await page.getByLabel('Limite').fill('100,00');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText(/R\$\s*12,50 de R\$\s*100,00/)).toBeVisible();

  await page.reload();
  await expect(page.getByText(/R\$\s*12,50 hoje/)).toBeVisible();
  await expect(page.getByText(/R\$\s*12,50 de R\$\s*100,00/)).toBeVisible();
});
