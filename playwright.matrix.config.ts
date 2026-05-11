import { defineConfig, devices } from '@playwright/test';

const frontendPort = process.env.E2E_FRONTEND_PORT || '3030';
const backendPort = process.env.E2E_BACKEND_PORT || '8030';
const reuseExistingServer = !process.env.CI && process.env.E2E_REUSE_EXISTING !== 'false';

export default defineConfig({
  testDir: './e2e',
  testMatch: /host-player-flow\.spec\.ts/,
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  outputDir: 'test-results/e2e-artifacts',
  use: {
    baseURL: `http://127.0.0.1:${frontendPort}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: [
    {
      command: `PORT=${backendPort} npm run server`,
      url: `http://127.0.0.1:${backendPort}/api/markets/charts`,
      reuseExistingServer,
      timeout: 120_000,
    },
    {
      command: `BROWSER=none PORT=${frontendPort} REACT_APP_BACKEND_PORT=${backendPort} npm start`,
      url: `http://127.0.0.1:${frontendPort}`,
      reuseExistingServer,
      timeout: 180_000,
    },
  ],
});
