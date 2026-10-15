import { validateChallenge, type ValidateChallengeBody } from 'capjs-core';
import { newProofId, type ProofFlag, signProofToken } from './proofToken';
import type { ClaimStore } from './claim';
import type { CapKeys } from './secret';
import { TOKEN_TTL_MS } from '../../shared/constants';

export const REDEEM_BODY_LIMIT = 16 * 1024;

export type RedeemResult =
  | 'ok'
  | 'ok-unclaimed'
  | 'bad-solution'
  | 'expired'
  | 'already-redeemed'
  | 'automated-browser'
  | 'malformed'
  | '_OTHER';

export interface RedeemOutcome {
  status: 200 | 400 | 403 | 413;
  body: { success: true; token: string; expires: number } | { success: false };
  result: RedeemResult;
}

export const refused = (status: 400 | 403 | 413, result: RedeemResult): RedeemOutcome => ({ status, body: { success: false }, result });

const resultOf = (reason: string): RedeemResult => {
  switch (reason) {
    case 'invalid_solution':
    case 'invalid_solutions':
    case 'missing_solutions':
      return 'bad-solution';
    case 'expired':
    case 'instr_expired':
      return 'expired';
    case 'already_redeemed':
      return 'already-redeemed';
    case 'instr_automated_browser':
      return 'automated-browser';
    case 'invalid_body':
    case 'invalid_token':
    case 'missing_token':
    case 'instr_corrupted':
    case 'instr_missing':
      return 'malformed';
    default:
      return '_OTHER';
  }
};

const isBody = (value: unknown): value is ValidateChallengeBody =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { token?: unknown }).token === 'string' &&
  Array.isArray((value as { solutions?: unknown }).solutions);

export const redeem = async (raw: string | undefined, keys: CapKeys, store: ClaimStore): Promise<RedeemOutcome> => {
  if (raw === undefined) return refused(400, 'malformed');
  if (Buffer.byteLength(raw) > REDEEM_BODY_LIMIT) return refused(413, 'malformed');

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return refused(400, 'malformed');
  }
  if (!isBody(body)) return refused(400, 'malformed');

  // Widened: the claim callback changes it, and TypeScript does not see that assignment.
  let flag = 'c' as ProofFlag;
  const result = await validateChallenge(keys.challenge, body, {
    tokenTtlMs: TOKEN_TTL_MS,
    consumeNonce: async (signature, ttlMs) => {
      const claim = await store.claim(`c:${signature}`, ttlMs);
      // The solution is valid and only the store failed: issue the proof, marked for the outage policy.
      if (claim === 'down') {
        flag = 'u';
        return true;
      }
      return claim === 'claimed';
    },
    signToken: ({ expires }) => signProofToken(keys.token, { id: newProofId(), expires, flag }),
  });

  if (!result.success) return refused(403, resultOf(result.reason));
  return {
    status: 200,
    body: { success: true, token: result.token, expires: result.expires },
    result: flag === 'u' ? 'ok-unclaimed' : 'ok',
  };
};
