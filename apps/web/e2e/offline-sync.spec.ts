import { expect, test, type Page } from '@playwright/test';

/**
 * O terceiro fluxo crítico: registro feito sem rede que chega íntegro ao
 * servidor quando ela volta.
 *
 * Este teste é a razão de a fase 1 vir antes de qualquer feature. Se ele
 * quebrar, nenhum dado registrado na academia é confiável.
 */

// Mesmo caminho que o app usa: o cookie de refresh é httpOnly e escopado em
// /api/auth, então falar direto com :8000 seria cross-origin e não o levaria.
const API_PATH = '/api';
const SENHA = 'senha-de-teste-e2e';

function novoEmail(): string {
  return `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@exemplo.com`;
}

async function criarConta(page: Page): Promise<void> {
  await page.goto('/criar-conta');
  await page.getByLabel('E-mail').fill(novoEmail());
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page).toHaveURL(/\/hoje/);
}

async function adicionar(page: Page, nome: string): Promise<void> {
  await page.getByLabel('Novo exercício').fill(nome);
  await page.getByRole('button', { name: 'Adicionar' }).click();
  // O seed de treino pode ter um exercício global com o mesmo nome. O item
  // criado offline é inequivocamente o que ainda anuncia "não enviado".
  await expect(
    page.getByRole('listitem').filter({ hasText: nome }).filter({ hasText: 'não enviado' }),
  ).toBeVisible();
}

/** O que o servidor realmente guardou, lido fora do app. */
async function exerciciosNoServidor(page: Page): Promise<string[]> {
  return page.evaluate(async (base) => {
    const refresh = await fetch(`${base}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!refresh.ok) throw new Error(`refresh falhou: ${refresh.status}`);
    const { access_token } = (await refresh.json()) as { access_token: string };

    const lista = await fetch(`${base}/training/exercises`, {
      headers: { Authorization: `Bearer ${access_token}` },
      credentials: 'include',
    });
    if (!lista.ok) throw new Error(`lista falhou: ${lista.status}`);
    return ((await lista.json()) as { nome: string }[]).map((e) => e.nome);
  }, API_PATH);
}

test('registro feito offline chega íntegro ao servidor quando a rede volta', async ({
  page,
  context,
}) => {
  await criarConta(page);
  await page.goto('/treino/exercicios');

  await context.setOffline(true);

  await adicionar(page, 'Agachamento livre');
  await adicionar(page, 'Levantamento terra');

  // Sem rede, o registro aparece na hora e se anuncia como não enviado.
  await expect(page.getByText('não enviado')).toHaveCount(2);
  await expect(page.getByRole('status').filter({ hasText: 'para enviar' })).toBeVisible();

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));

  await expect(page.getByText('não enviado')).toHaveCount(0, { timeout: 20_000 });

  const noServidor = await exerciciosNoServidor(page);
  expect(noServidor).toContain('Agachamento livre');
  expect(noServidor).toContain('Levantamento terra');
});

test('o registro sobrevive ao reload feito ainda offline', async ({ page, context }) => {
  await criarConta(page);
  await page.goto('/treino/exercicios');

  await context.setOffline(true);
  await adicionar(page, 'Remada curvada');

  // O Dexie é persistente: fechar o app no meio do treino não pode perder a
  // série que acabou de ser registrada.
  await page.reload();
  await page.goto('/treino/exercicios');
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Remada curvada' }).filter({ hasText: 'não enviado' }),
  ).toBeVisible();

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByText('não enviado')).toHaveCount(0, { timeout: 20_000 });

  expect(await exerciciosNoServidor(page)).toContain('Remada curvada');
});

test('um mesmo registro não duplica quando o sync roda várias vezes', async ({
  page,
  context,
}) => {
  await criarConta(page);
  await page.goto('/treino/exercicios');

  await context.setOffline(true);
  await adicionar(page, 'Desenvolvimento militar');
  await context.setOffline(false);

  // Três gatilhos de sync seguidos — reconexão, foco, intervalo. A chave de
  // idempotência é o que impede isso de virar três registros.
  for (let i = 0; i < 3; i += 1) {
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
  }

  await expect(page.getByText('não enviado')).toHaveCount(0, { timeout: 20_000 });

  const noServidor = await exerciciosNoServidor(page);
  expect(noServidor.filter((n) => n === 'Desenvolvimento militar')).toHaveLength(1);
});
