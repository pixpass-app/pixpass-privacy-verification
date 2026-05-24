import { defineConfig } from '@playwright/test'

import { PIXPASS_BASE_URL } from './tests/privacy-harness/env'

const baseURL = PIXPASS_BASE_URL

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
