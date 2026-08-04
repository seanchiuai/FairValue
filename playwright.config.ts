import { defineConfig, devices } from '@playwright/test';

const frontendPort = process.env.E2E_FRONTEND_PORT || '3001';
const backendPort = process.env.E2E_BACKEND_PORT || '8000';
const reuseExistingServer = !process.env.CI && process.env.E2E_REUSE_EXISTING !== 'false';
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;

export default defineConfig({
  testDir: './e2e',
  testIgnore: [/restart-recovery\.spec\.ts/, /load-soak\.spec\.ts/, /browser-load\.spec\.ts/, /mixed-traffic\.spec\.ts/],
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
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
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
      command: `VITE_BACKEND_PORT=${backendPort} npm start -- --host 127.0.0.1 --port ${frontendPort}`,
      url: `http://127.0.0.1:${frontendPort}`,
      reuseExistingServer,
      timeout: 180_000,
    },
  ],
});
