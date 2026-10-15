import { readProofToken } from './proofToken';
import type { ClaimStore } from './claim';
import type { BotProtectionVerdict } from '@laioutr-core/frontend-core/bot-protection';

export const verifyProof = async (
  header: string | undefined,
  tokenKey: Buffer,
  store: ClaimStore | undefined
): Promise<BotProtectionVerdict> => {
  // A configuration gap, not an outage: `unavailable` would let the project's open policy pass everything.
  if (!store) return { status: 'invalid', reason: 'no-store' };
  if (!header) return { status: 'invalid', reason: 'missing-proof' };

  const read = readProofToken(tokenKey, header);
  if (!read.ok) return { status: 'invalid', reason: read.reason };

  const { id, expires, flag } = read.token;
  const left = expires - Date.now();
  if (left <= 0) return { status: 'invalid', reason: 'expired' };

  // Claimed only after the signature holds, so a forged token never writes to the store.
  const claim = await store.claim(`t:${id}`, left);
  if (claim === 'taken') return { status: 'invalid', reason: 'replayed' };
  if (claim === 'down') return { status: 'unavailable', reason: 'store-down' };
  if (flag === 'u') return { status: 'unavailable', reason: 'unclaimed-challenge' };
  return { status: 'valid' };
};
