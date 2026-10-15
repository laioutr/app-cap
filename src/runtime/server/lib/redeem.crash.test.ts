import { describe, expect, it, vi } from 'vitest';
import { createMemoryClaimStore } from './claim';
import { redeem } from './redeem';
import { deriveKeys } from './secret';

// capjs-core throws on some crafted instrumentation payloads, which needs a valid instrumentation id to
// reproduce. The library stands in here, and only its throw is faked.
vi.mock('capjs-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('capjs-core')>()),
  validateChallenge: async () => {
    throw new TypeError('Cannot convert object to primitive value');
  },
}));

describe('redeem with a body that crashes the validator', () => {
  it('answers 403 instead of a server error', async () => {
    const keys = deriveKeys('test-secret', { blockAutomatedBrowsers: true, difficulty: 1_000_000 });
    expect(await redeem('{"token":"t","solutions":[]}', keys, createMemoryClaimStore())).toEqual({
      status: 403,
      body: { success: false },
      result: 'malformed',
    });
  });
});
