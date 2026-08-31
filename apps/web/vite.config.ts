/// <reference types="vitest" />
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const API_PROXY = {
  '/api': {
    target: process.env['VITE_API_TARGET'] ?? 'http://localhost:8000',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/api/, ''),
  },
};

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // autoUpdate: o SW novo assume e recarrega sozinho (o handler de
      // SKIP_WAITING em sw.ts faz a troca). Sem isso o usuário ficava preso
      // numa versão antiga até limpar o SW na mão. Um reload no meio de uma
      // série perde só os valores não confirmados do stepper — cada série
      // concluída já está no Dexie.
      registerType: 'autoUpdate',
      // O service worker é escrito à mão porque ele precisa receber Web Push
      // além do precache do Workbox.
      strategies: 'injectManifest',
      srcDir: 'src/app',
      filename: 'sw.ts',
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] },
      devOptions: { enabled: true, type: 'module' },
      manifest: {
        name: 'BeALegend',
        short_name: 'BeALegend',
        description: 'Treino, refeições, gastos e hábitos — um app calmo.',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0e1116',
        theme_color: '#0e1116',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: API_PROXY,
  },
  // O preview serve o build; os E2E rodam contra ele para exercitar o
  // service worker de verdade.
  preview: {
    port: 5173,
    proxy: API_PROXY,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**'],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
