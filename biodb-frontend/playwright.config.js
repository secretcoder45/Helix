// Browser tests: the built frontend against the real backend, with the
// source databases replaced by recordings (e2e/backend/server.py).
//
//   npm run test:e2e            headless, both servers started for you
//   npm run test:e2e -- --ui    watch it happen
//
// Built to dist-e2e, not dist: that build points at the local test API and
// must never be what gets deployed.
import { defineConfig, devices } from '@playwright/test'

const API_PORT = 8765
const WEB_PORT = 4174
const WEB = `http://localhost:${WEB_PORT}`
const PYTHON = process.env.E2E_PYTHON || '../biodb-backend/venv/bin/python'
const CI = Boolean(process.env.CI)

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // Phone layout: only the tests tagged @phone.
    { name: 'phone', use: { ...devices['Pixel 7'] }, grep: /@phone/ },
  ],
  webServer: [
    {
      command: `${PYTHON} e2e/backend/server.py`,
      url: `http://127.0.0.1:${API_PORT}/health`,
      env: { E2E_API_PORT: String(API_PORT), E2E_ORIGIN: WEB },
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
    {
      command: `npx vite build --outDir dist-e2e --emptyOutDir && npx vite preview --outDir dist-e2e --port ${WEB_PORT} --strictPort`,
      url: WEB,
      env: { VITE_API_URL: `http://127.0.0.1:${API_PORT}` },
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
  ],
})
