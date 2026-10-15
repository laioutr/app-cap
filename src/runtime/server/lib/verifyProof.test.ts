import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ClaimResult, type ClaimStore, createMemoryClaimStore } from './claim';
import { challengeRef, newProofId, type ProofFlag, signProofToken } from './proofToken';
import { verifyProof } from './verifyProof';

const key = randomBytes(32);
const storeAnswering = (result: ClaimResult): ClaimStore => ({ claim: async () => result });
const tokenFor = (flag: ProofFlag, { expires = Date.now() + 60_000, challenge = challengeRef(randomBytes(32).toString('hex')) } = {}) =>
  signProofToken(key, { id: newProofId(), expires, flag, challenge });

afterEach(() => vi.useRealTimers());

describe('verifyProof', () => {
  it('rejects every proof when no store exists, as for a missing provider', async () => {
    expect(await verifyProof(tokenFor('c'), key, undefined)).toEqual({ status: 'invalid', reason: 'no-store' });
  });

  it('rejects a request without a proof', async () => {
    expect(await verifyProof(undefined, key, createMemoryClaimStore())).toEqual({ status: 'invalid', reason: 'missing-proof' });
  });

  it('rejects a malformed proof', async () => {
    expect(await verifyProof('v1.nope', key, createMemoryClaimStore())).toEqual({ status: 'invalid', reason: 'malformed-proof' });
  });

  it('rejects a proof signed with another key, without touching the store', async () => {
    const store = { claim: vi.fn() };
    const foreign = signProofToken(randomBytes(32), {
      id: newProofId(),
      expires: Date.now() + 60_000,
      flag: 'c',
      challenge: challengeRef('ab'),
    });
    expect(await verifyProof(foreign, key, store)).toEqual({ status: 'invalid', reason: 'bad-signature' });
    expect(store.claim).not.toHaveBeenCalled();
  });

  it('rejects a proof that expires at this very moment', async () => {
    vi.useFakeTimers({ now: 1_900_000_000_000 });
    expect(await verifyProof(tokenFor('c', { expires: Date.now() }), key, createMemoryClaimStore())).toEqual({
      status: 'invalid',
      reason: 'expired',
    });
  });

  it('accepts a claimed proof once, and calls the second use a replay', async () => {
    const store = createMemoryClaimStore();
    const token = tokenFor('c');
    expect(await verifyProof(token, key, store)).toEqual({ status: 'valid' });
    expect(await verifyProof(token, key, store)).toEqual({ status: 'invalid', reason: 'replayed' });
  });

  it('hands a store outage to the project policy', async () => {
    expect(await verifyProof(tokenFor('c'), key, storeAnswering('down'))).toEqual({ status: 'unavailable', reason: 'store-down' });
  });

  // A refused command is a configuration fault. As an outage it would switch replay protection off under `open`.
  it('rejects when the store refuses the claim', async () => {
    expect(await verifyProof(tokenFor('c'), key, storeAnswering('error'))).toEqual({ status: 'invalid', reason: 'store-refused' });
  });

  describe('a proof redeemed while the store was down', () => {
    it('claims its challenge now, so one solution passes once after the outage', async () => {
      const store = createMemoryClaimStore();
      const challenge = challengeRef('ab'.repeat(32));
      expect(await verifyProof(tokenFor('u', { challenge }), key, store)).toEqual({ status: 'valid' });
      expect(await verifyProof(tokenFor('u', { challenge }), key, store)).toEqual({ status: 'invalid', reason: 'replayed' });
    });

    it('hands the decision to the project policy while the store is still down', async () => {
      const store: ClaimStore = { claim: async (claimKey) => (claimKey.startsWith('c:') ? 'down' : 'claimed') };
      expect(await verifyProof(tokenFor('u'), key, store)).toEqual({ status: 'unavailable', reason: 'unclaimed-challenge' });
    });

    it('is a replay when the same proof comes again', async () => {
      const store = createMemoryClaimStore();
      const token = tokenFor('u');
      await verifyProof(token, key, store);
      expect(await verifyProof(token, key, store)).toEqual({ status: 'invalid', reason: 'replayed' });
    });
  });
});
