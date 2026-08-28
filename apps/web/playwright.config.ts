import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  // Criar conta passa por Argon2 (deliberadamente caro) mais dois round
  // trips. O padrão de 5s do Playwright não cobre isso sob carga paralela.
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  // Os três fluxos críticos rodam em mobile: é onde o app vive.
  projects: [
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
  ],
  // Roda contra o build de produção, não contra o dev server: o service
  // worker só precacheia o shell no build, e sem ele um reload offline não
  // carrega o app — que é metade do que a fase 1 promete.
  webServer: {
    command: 'npm run build && npm run preview -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
