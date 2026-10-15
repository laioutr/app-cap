import { defineConfig } from '@playwright/test';

export const E2E_SECRET = 'e2e-project-secret';
export const OPEN_URL = 'http://127.0.0.1:3100';
export const BLOCKING_URL = 'http://127.0.0.1:3101';

// The playground bakes this URL into its build, so the suite starts Redis on the same port.
const redisPort = new URL(process.env.REDIS_URL ?? 'redis://127.0.0.1:6390').port || '6379';
const serverEnv = { NUXT_LAIOUTR_PROJECT_SECRET_KEY: E2E_SECRET, HOST: '127.0.0.1' };

export default defineConfig({
  testDir: 'test/e2e',
  timeout: 60_000,
  use: { browserName: 'chromium' },
  webServer: [
    {
      command: `redis-server --port ${redisPort} --save '' --appendonly no`,
      port: Number(redisPort),
      reuseExistingServer: true,
    },
    {
      // Built with CAP_BLOCK_AUTOMATED_BROWSERS=false, so headless Chromium can solve.
      command: 'node playground/.output-open/server/index.mjs',
      url: `${OPEN_URL}/check`,
      env: { ...serverEnv, PORT: '3100' },
    },
    {
      command: 'node playground/.output/server/index.mjs',
      url: `${BLOCKING_URL}/check`,
      env: { ...serverEnv, PORT: '3101' },
    },
  ],
});
