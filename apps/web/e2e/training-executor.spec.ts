import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Fluxo real do executor de treino, contra um plano de verdade gerado pelo
 * seed da planilha — a mesma ferramenta que roda em produção.
 */

const SENHA = 'senha-de-teste-e2e';
const API_ROOT = path.resolve(__dirname, '..', '..', 'api');

function novoEmail(): string {
  return `treino-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@exemplo.com`;
}

/**
 * Localiza o Python que roda o seed. Em desenvolvimento local isso é o
 * venv do projeto; no CI (Linux, sem venv) as dependências estão instaladas
 * no Python global do runner. `E2E_PYTHON` sempre vence, para o CI não
 * depender de adivinhação de caminho.
 */
function pythonDoSeed(): string {
  if (process.env['E2E_PYTHON']) return process.env['E2E_PYTHON'];

  const venvWindows = path.join(API_ROOT, '.venv', 'Scripts', 'python.exe');
  const venvPosix = path.join(API_ROOT, '.venv', 'bin', 'python');
  if (existsSync(venvWindows)) return venvWindows;
  if (existsSync(venvPosix)) return venvPosix;
  return 'python3';
}

function rodarSeed(email: string): void {
  execFileSync(
    pythonDoSeed(),
    ['scripts/seed_training_plan.py', '--email', email, '--force'],
    {
      cwd: API_ROOT,
      env: {
        ...process.env,
        DATABASE_OWNER_URL:
          process.env['E2E_DATABASE_OWNER_URL'] ??
          'postgresql+asyncpg://bealegend:changeme@localhost:5432/bealegend',
      },
      stdio: 'pipe',
    },
  );
}

async function criarConta(page: Page, email: string): Promise<void> {
  await page.goto('/criar-conta');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(SENHA);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page).toHaveURL(/\/hoje/);
}

test('executa uma sessão de força completa a partir do plano semeado', async ({ page }) => {
  const email = novoEmail();
  await criarConta(page, email);
  rodarSeed(email);

  await page.getByRole('link', { name: 'Treino' }).click();
  await expect(page.getByText('Segunda')).toBeVisible({ timeout: 15_000 });

  // Segunda = Força A, 5 exercícios (planilha: supino, desenvolvimento,
  // elevação lateral, flexões, extensão de tríceps).
  await page
    .getByTestId('plan-day-segunda')
    .getByRole('button', { name: 'Iniciar' })
    .click();

  await expect(page.getByText('Exercício 1 de 5')).toBeVisible();

  // Primeiro exercício: 4 séries de 8–12 reps. Sobe os reps ao topo da faixa
  // para acionar a sugestão de progressão na última série.
  for (let serie = 1; serie <= 4; serie += 1) {
    await expect(page.getByText(`Série ${serie} de 4`)).toBeVisible();
    for (let i = 0; i < 4; i += 1) {
      // force: os botões redondos centralizados por place-items-center caem
      // numa fração de sub-pixel em viewports de alto DPI (mobile-chrome
      // emulado), e o teste de estabilidade do Playwright falsamente relata
      // interceptação do próprio contêiner. Confirmado visualmente e via
      // elementFromPoint que o botão é o elemento do topo.
      await page.getByRole('button', { name: 'Aumentar Reps' }).click({ force: true });
    }
    await page.getByRole('button', { name: 'Série concluída' }).click();
    await page.getByRole('button', { name: 'Pular descanso' }).click();
  }

  // Todas as séries no topo da faixa com RIR alvo: a regra da planilha sugere
  // aumentar a carga na próxima sessão.
  await expect(page.getByText(/Aumente .* kg na próxima sessão/)).toBeVisible();
  await expect(page.getByText('Sem anilha menor?')).toBeVisible();

  await page.getByRole('button', { name: 'Próximo exercício' }).click();
  await expect(page.getByText('Exercício 2 de 5')).toBeVisible();
});

test('a sessão sobrevive a um reload no meio do treino', async ({ page }) => {
  const email = novoEmail();
  await criarConta(page, email);
  rodarSeed(email);

  await page.getByRole('link', { name: 'Treino' }).click();
  await expect(page.getByText('Segunda')).toBeVisible({ timeout: 15_000 });
  await page
    .getByTestId('plan-day-segunda')
    .getByRole('button', { name: 'Iniciar' })
    .click();

  await expect(page.getByText('Exercício 1 de 5')).toBeVisible();
  await page.getByRole('button', { name: 'Série concluída' }).click();
  await page.getByRole('button', { name: 'Pular descanso' }).click();
  await expect(page.getByText('Série 2 de 4')).toBeVisible();

  // Um único reload: reload() + goto() em sequência abortaria o
  // /auth/refresh em voo e disparar-se-ia a detecção de reuso do token —
  // recurso de segurança de verdade, não bug deste teste.
  await page.reload();

  // A série já registrada continua contando — o Dexie é a fonte durante a
  // sessão, e a série é append-only: reload não perde nem duplica.
  await expect(page.getByText('Série 2 de 4')).toBeVisible();
  await expect(page.getByText('Série 1')).toBeVisible();
});
