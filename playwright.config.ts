import { defineConfig } from '@playwright/test'

const baseURL = process.env.PIXPASS_BASE_URL ?? 'https://pixpass.app'

export default defineConfig({
  testDir: './tests/privacy-harness',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL,
  },
})
