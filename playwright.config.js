const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  testMatch: '*.spec.js',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4188', viewport: { width: 1440, height: 1000 }, headless: true, channel: 'chromium' },
  webServer: { command: 'python3 viewer.py --no-browser --port 4188', url: 'http://127.0.0.1:4188', reuseExistingServer: false },
});
