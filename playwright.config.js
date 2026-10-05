// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  timeout: 60000,
  expect: { timeout: 10000 },
  workers: 4,
  reporter: [['list']],
  // Each test gets a pristine context, so sessionStorage never leaks between tests.
  use: {
    ...devices['Desktop Chrome'],
    channel: undefined,
    viewport: { width: 1280, height: 900 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
