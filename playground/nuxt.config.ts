import { existsSync, readFileSync } from 'node:fs';
import placeholderRc from './fixtures/laioutrrc.json';
import srcModule from '../src/module';

const rcPath = new URL('../laioutrrc.json', import.meta.url);

// Until `pnpm rc:fetch` has written your project's configuration, the playground runs on a
// placeholder project, so a fresh clone and CI start without one.
const laioutrrc = existsSync(rcPath) ? JSON.parse(readFileSync(rcPath, 'utf8')) : placeholderRc;

// No secret in the build. A built playground needs `NUXT_LAIOUTR_PROJECT_SECRET_KEY` to sign proofs.
laioutrrc.laioutr.projectSecretKey = false;

// Read at build time: the end-to-end suite builds the playground once per value.
const redisUrl = process.env.REDIS_URL;

export default defineNuxtConfig({
  modules: [
    srcModule,
    '@pinia/nuxt', // Added to show in devtools
    '@laioutr-core/frontend-core',
    '@laioutr-core/devtools',
  ],
  laioutr: {
    laioutrrc,
  },
  '@laioutr/app-cap': {
    blockAutomatedBrowsers: process.env.CAP_BLOCK_AUTOMATED_BROWSERS !== 'false',
  },
  nitro: {
    // The same mount shape as Laioutr Cloud: orchestr's cache on Redis, with a key base.
    storage: redisUrl ? { cache: { driver: 'redis', url: redisUrl, base: 'playground' } } : {},
    ...(process.env.PLAYGROUND_OUTPUT_DIR ? { output: { dir: process.env.PLAYGROUND_OUTPUT_DIR } } : {}),
  },
  devtools: { enabled: true },
  compatibilityDate: '2025-09-11',
});
