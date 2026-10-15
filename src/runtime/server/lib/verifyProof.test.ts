import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryClaimStore, type ClaimStore } from './claim';
import { newProofId, signProofToken, type ProofFlag } from './proofToken';
import { verifyProof } from './verifyProof';

const key = randomBytes(32);
const down: ClaimStore = { claim: async () => 'down' };
const tokenFor = (flag: ProofFlag, expires = Date.now() + 60_000) => signProofToken(key, { id: newProofId(), expires, flag });

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
    const foreign = signProofToken(randomBytes(32), { id: newProofId(), expires: Date.now() + 60_000, flag: 'c' });
    expect(await verifyProof(foreign, key, store)).toEqual({ status: 'invalid', reason: 'bad-signature' });
    expect(store.claim).not.toHaveBeenCalled();
  });

  it('rejects a proof that expires at this very moment', async () => {
    vi.useFakeTimers({ now: 1_900_000_000_000 });
    expect(await verifyProof(tokenFor('c', Date.now()), key, createMemoryClaimStore())).toEqual({ status: 'invalid', reason: 'expired' });
  });

  it('accepts a claimed proof once, and calls the second use a replay', async () => {
    const store = createMemoryClaimStore();
    const token = tokenFor('c');
    expect(await verifyProof(token, key, store)).toEqual({ status: 'valid' });
    expect(await verifyProof(token, key, store)).toEqual({ status: 'invalid', reason: 'replayed' });
  });

  it('hands a store outage to the project policy', async () => {
    expect(await verifyProof(tokenFor('c'), key, down)).toEqual({ status: 'unavailable', reason: 'store-down' });
  });

  it('hands a proof redeemed during an outage to the project policy, once', async () => {
    const store = createMemoryClaimStore();
    const token = tokenFor('u');
    expect(await verifyProof(token, key, store)).toEqual({ status: 'unavailable', reason: 'unclaimed-challenge' });
    expect(await verifyProof(token, key, store)).toEqual({ status: 'invalid', reason: 'replayed' });
  });
});
