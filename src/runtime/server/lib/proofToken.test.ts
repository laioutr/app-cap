import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { newProofId, readProofToken, signProofToken } from './proofToken';

const key = randomBytes(32);
const token = { id: newProofId(), expires: 1_900_000_000_000, flag: 'c' as const };

describe('proof token', () => {
  it('reads back what it signed', () => {
    expect(readProofToken(key, signProofToken(key, token))).toEqual({ ok: true, token });
  });

  it('keeps the flag that marks a redeem without a claim', () => {
    const unclaimed = { ...token, flag: 'u' as const };
    expect(readProofToken(key, signProofToken(key, unclaimed))).toEqual({ ok: true, token: unclaimed });
  });

  it.each([
    ['the id', (raw: string) => raw.replace(/^v1\.(.)/, (_, first) => `v1.${first === 'A' ? 'B' : 'A'}`)],
    ['the expiry', (raw: string) => raw.replace('.1900000000000.', '.1900000000001.')],
    ['the flag', (raw: string) => raw.replace('.c.', '.u.')],
  ])('rejects a token whose %s changed', (_, change) => {
    expect(readProofToken(key, change(signProofToken(key, token)))).toEqual({ ok: false, reason: 'bad-signature' });
  });

  it('rejects a token signed with another key', () => {
    expect(readProofToken(randomBytes(32), signProofToken(key, token))).toEqual({ ok: false, reason: 'bad-signature' });
  });

  it.each([
    ['nothing', () => ''],
    ['another version', (raw: string) => raw.replace(/^v1/, 'v2')],
    ['an extra part', (raw: string) => `${raw}.x`],
    ['a leading space', (raw: string) => ` ${raw}`],
    ['two tokens', (raw: string) => `${raw},${raw}`],
    ['an unknown flag', (raw: string) => raw.replace('.c.', '.x.')],
  ])('calls a header with %s malformed', (_, shape) => {
    expect(readProofToken(key, shape(signProofToken(key, token)))).toEqual({ ok: false, reason: 'malformed-proof' });
  });

  it('gives every proof its own id', () => {
    expect(new Set(Array.from({ length: 100 }, newProofId)).size).toBe(100);
  });
});
