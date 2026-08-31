import { defineConfig } from '@playwright/test';

const port = 4173;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['line'], ['html', { open: 'never' }]],
  expect: { timeout: 7_000 },
  use: {
    baseURL,
    browserName: 'chromium',
    headless: true,
    actionTimeout: 7_000,
    navigationTimeout: 12_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node tests/e2e/server.mjs',
    url: `${baseURL}/__e2e_health`,
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
});
