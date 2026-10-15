import { readProofToken } from './proofToken';
import type { ClaimResult, ClaimStore } from './claim';
import type { BotProtectionVerdict } from '@laioutr-core/frontend-core/bot-protection';

const verdictOfFailed = (claim: Exclude<ClaimResult, 'claimed'>, whenDown: string): BotProtectionVerdict => {
  if (claim === 'taken') return { status: 'invalid', reason: 'replayed' };
  if (claim === 'down') return { status: 'unavailable', reason: whenDown };
  // A refused command is a configuration fault. As `unavailable`, an open policy would pass every proof.
  return { status: 'invalid', reason: 'store-refused' };
};

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

  const { id, expires, flag, challenge } = read.token;
  const left = expires - Date.now();
  if (left <= 0) return { status: 'invalid', reason: 'expired' };

  // Claimed only after the signature holds, so a forged token never writes to the store.
  const claim = await store.claim(`t:${id}`, left);
  if (claim !== 'claimed') return verdictOfFailed(claim, 'store-down');
  if (flag === 'c') return { status: 'valid' };

  // Redeemed while the store was down, so its challenge was never claimed. Claimed now, one solution passes
  // once. The token outlives its challenge, so its remaining life covers every redeem the challenge allows.
  const challengeClaim = await store.claim(`c:${challenge}`, left);
  return challengeClaim === 'claimed' ? { status: 'valid' } : verdictOfFailed(challengeClaim, 'unclaimed-challenge');
};
