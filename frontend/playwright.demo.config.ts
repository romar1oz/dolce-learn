import { defineConfig } from '@playwright/test'

// Запись демо-видео (scripts/demo-video.sh). Файлы выполняются по порядку: сначала методист, затем сотрудник.
export default defineConfig({
  testDir: './e2e/demo',
  timeout: 600_000,
  expect: { timeout: 20_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  outputDir: './test-results/demo',
  use: {
    baseURL: process.env.E2E_BASE || 'http://localhost:4175',
    serviceWorkers: 'allow',
    locale: 'ru-RU',
    launchOptions: { slowMo: 120 },
  },
})
