import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Plain `defineConfig`: every suite covers plain TypeScript, and `defineVitestConfig` would boot
    // Nuxt and regenerate the root `.nuxt` without the playground. DOM suites opt into happy-dom per file.
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
