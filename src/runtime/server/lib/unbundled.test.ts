import { describe, expect, it } from 'vitest';

describe('the stub for esbuild and javascript-obfuscator', () => {
  it('loads without throwing, because Rollup may evaluate it in any chunk', async () => {
    await expect(import('./unbundled.mjs')).resolves.toBeDefined();
  });

  it('throws when capjs-core calls esbuild', async () => {
    const esbuild = await import('./unbundled.mjs');
    expect(() => esbuild.transform()).toThrow('Not bundled');
  });

  it('throws when capjs-core calls javascript-obfuscator', async () => {
    const mod = await import('./unbundled.mjs');
    const obfuscator = mod.default ?? mod;
    expect(() => obfuscator.obfuscate()).toThrow('Not bundled');
  });
});
