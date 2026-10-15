import { describe, expect, it } from 'vitest';
import { deriveKeys, resolveKeys } from './secret';

const strict = { blockAutomatedBrowsers: true, difficulty: 1_000_000 };

describe('key derivation', () => {
  it('derives one key per purpose, so a signature for one cannot pass the check of the other', () => {
    const keys = deriveKeys('project-secret', strict);
    expect(keys.challenge.equals(keys.token)).toBe(false);
  });

  it('derives the same keys from the same secret and options, so every instance agrees', () => {
    expect(deriveKeys('project-secret', strict)).toEqual(deriveKeys('project-secret', strict));
  });

  // Every environment of a project shares one secret. Without this, a proof from an environment with the
  // automation check off, or a lower difficulty, would pass production.
  it.each([
    ['the automation check', { ...strict, blockAutomatedBrowsers: false }],
    ['the difficulty', { ...strict, difficulty: 50_000 }],
  ])('derives other keys when %s differs', (_, weaker) => {
    const production = deriveKeys('project-secret', strict);
    const other = deriveKeys('project-secret', weaker);
    expect(other.challenge.equals(production.challenge)).toBe(false);
    expect(other.token.equals(production.token)).toBe(false);
  });

  it.each([[''], [false], [undefined]])('refuses to sign on a built server without a secret (%j)', (secret) => {
    expect(resolveKeys(secret, false, strict)).toEqual({ error: expect.stringMatching(/no project secret key/i) });
  });

  it('uses a random secret on the dev server, and says so', () => {
    const first = resolveKeys('', true, strict);
    const second = resolveKeys('', true, strict);
    expect(first.keys && second.keys && first.keys.token.equals(second.keys.token)).toBe(false);
    expect(first).toMatchObject({ warning: expect.stringMatching(/random key/i) });
  });
});
