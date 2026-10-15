import { describe, expect, it } from 'vitest';
import { deriveKeys, resolveKeys } from './secret';

describe('key derivation', () => {
  it('derives one key per purpose, so a signature for one cannot pass the check of the other', () => {
    const keys = deriveKeys('project-secret');
    expect(keys.challenge.equals(keys.token)).toBe(false);
  });

  it('derives the same keys from the same secret, so every instance agrees', () => {
    expect(deriveKeys('project-secret')).toEqual(deriveKeys('project-secret'));
  });

  it.each([[''], [false], [undefined]])('refuses to sign on a built server without a secret (%j)', (secret) => {
    expect(resolveKeys(secret, false)).toEqual({ error: expect.stringMatching(/no project secret key/i) });
  });

  it('uses a random secret on the dev server, and says so', () => {
    const first = resolveKeys('', true);
    const second = resolveKeys('', true);
    expect(first.keys && second.keys && first.keys.token.equals(second.keys.token)).toBe(false);
    expect(first).toMatchObject({ warning: expect.stringMatching(/random key/i) });
  });
});
