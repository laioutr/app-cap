import { createHash } from 'node:crypto';
import { type Format2ChallengeResult, generateChallenge } from 'capjs-core';
import { describe, expect, it } from 'vitest';
import { type ClaimStore, createMemoryClaimStore } from './claim';
import { readProofToken } from './proofToken';
import { redeem, REDEEM_BODY_LIMIT } from './redeem';
import { deriveKeys } from './secret';

const keys = deriveKeys('test-secret');

/** A real challenge, solved here: at difficulty 1 a SHA-256 proof needs one leading hex zero. */
const solved = async () => {
  const challenge = (await generateChallenge(keys.challenge, {
    format: 2,
    protocols: ['sha256-pow'],
    challengeCount: 1,
    challengeSize: 8,
    challengeDifficulty: 1,
  })) as Format2ChallengeResult;
  const solutions = challenge.challenges.map(({ payload }) => {
    const { salt, target } = payload as { salt: string; target: string };
    for (let nonce = 0; ; nonce++) {
      if (createHash('sha256').update(`${salt}${nonce}`).digest('hex').startsWith(target)) return { nonce };
    }
  });
  return JSON.stringify({ token: challenge.token, solutions });
};

const tokenOf = (outcome: { body: unknown }) => (outcome.body as { token: string }).token;

describe('redeem', () => {
  it('issues a proof token flagged as claimed', async () => {
    const outcome = await redeem(await solved(), keys, createMemoryClaimStore());
    expect(outcome).toMatchObject({ status: 200, result: 'ok', body: { success: true } });
    expect(readProofToken(keys.token, tokenOf(outcome))).toMatchObject({ ok: true, token: { flag: 'c' } });
  });

  it('redeems a challenge once', async () => {
    const store = createMemoryClaimStore();
    const body = await solved();
    await redeem(body, keys, store);
    expect(await redeem(body, keys, store)).toEqual({ status: 403, body: { success: false }, result: 'already-redeemed' });
  });

  it('still issues a proof when the store is down, flagged so the verifier hands it to the policy', async () => {
    const down: ClaimStore = { claim: async () => 'down' };
    const outcome = await redeem(await solved(), keys, down);
    expect(outcome).toMatchObject({ status: 200, result: 'ok-unclaimed' });
    expect(readProofToken(keys.token, tokenOf(outcome))).toMatchObject({ token: { flag: 'u' } });
  });

  it('rejects a wrong solution without saying why', async () => {
    const body = JSON.parse(await solved());
    // No nonce at all: a guessed nonce would pass one time in sixteen at this difficulty.
    body.solutions = [{}];
    expect(await redeem(JSON.stringify(body), keys, createMemoryClaimStore())).toEqual({
      status: 403,
      body: { success: false },
      result: 'bad-solution',
    });
  });

  it.each([
    ['not json', '{'],
    ['no token', '{"solutions":[]}'],
    ['no solutions', '{"token":"t"}'],
    ['nothing', undefined],
  ])('answers 400 for a body with %s', async (_, raw) => {
    expect(await redeem(raw, keys, createMemoryClaimStore())).toEqual({ status: 400, body: { success: false }, result: 'malformed' });
  });

  it('reads a body of exactly the limit, and refuses one byte more', async () => {
    const atLimit = `{"token":"t","solutions":[],"pad":"${'x'.repeat(REDEEM_BODY_LIMIT - 37)}"}`;
    expect(Buffer.byteLength(atLimit)).toBe(REDEEM_BODY_LIMIT);
    expect((await redeem(atLimit, keys, createMemoryClaimStore())).status).toBe(403);
    expect((await redeem(`${atLimit} `, keys, createMemoryClaimStore())).status).toBe(413);
  });
});
