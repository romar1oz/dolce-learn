import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testIgnore: '**/demo/**',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE || 'http://localhost:4175',
    serviceWorkers: 'allow',
    viewport: { width: 390, height: 844 }, // смартфон
    locale: 'ru-RU',
    trace: 'retain-on-failure',
  },
})
