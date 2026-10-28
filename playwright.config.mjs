import { defineConfig } from '@playwright/test';

const criticalJourneys = ["auth-memory-session","account-entry","member-session-lifecycle","account-deadline","member-completion","history-reading","public-planner-stability","registration-live-continuity","appearance"].map(name => '**/' + name + '.spec.mjs');
const port = 4173;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['line'], ['html', { open: 'never' }]],
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', testMatch: [...criticalJourneys,'**/feedback-member.spec.mjs','**/member-club-profiles.spec.mjs','**/member-new-member.spec.mjs','**/preliminary-reservations.spec.mjs','**/admin-safety.spec.mjs','**/admin-members.spec.mjs','**/admin-dashboard.spec.mjs','**/admin-command.spec.mjs','**/admin-confirmed-render.spec.mjs','**/admin-responsive-member.spec.mjs','**/admin-member-hero.spec.mjs','**/admin-compact.spec.mjs'], use: { browserName: 'webkit' } },
    { name: 'firefox', testMatch: criticalJourneys, use: { browserName: 'firefox' } },
  ],
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
