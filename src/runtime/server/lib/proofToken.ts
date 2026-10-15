import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type ProofFlag = 'c' | 'u';

export interface ProofToken {
  id: string;
  /** Unix ms. */
  expires: number;
  /** `c`: the redeem claimed its challenge. `u`: the store was down, so the verifier claims it later. */
  flag: ProofFlag;
  /** The challenge the proof was redeemed from, as `challengeRef` names it. */
  challenge: string;
}

export type ProofRead = { ok: true; token: ProofToken } | { ok: false; reason: 'malformed-proof' | 'bad-signature' };

const B64_22 = '[A-Za-z0-9_-]{22}';
const B64_43 = '[A-Za-z0-9_-]{43}';
const FORMAT = new RegExp(`^v1\\.(${B64_22})\\.(\\d{1,15})\\.([cu])\\.(${B64_43})\\.(${B64_43})$`);

const mac = (key: Buffer, body: string) => createHmac('sha256', key).update(body).digest();

export const newProofId = (): string => randomBytes(16).toString('base64url');

/** A fixed-length name for a challenge, from its signature. The redeem and the verifier claim the same key. */
export const challengeRef = (signature: string): string => createHash('sha256').update(signature).digest('base64url');

export const signProofToken = (key: Buffer, { id, expires, flag, challenge }: ProofToken): string => {
  const body = `v1.${id}.${expires}.${flag}.${challenge}`;
  return `${body}.${mac(key, body).toString('base64url')}`;
};

export const readProofToken = (key: Buffer, raw: string): ProofRead => {
  const match = FORMAT.exec(raw);
  if (!match) return { ok: false, reason: 'malformed-proof' };

  const [, id, expires, flag, challenge, signature] = match as unknown as [string, string, string, ProofFlag, string, string];
  const expected = mac(key, `v1.${id}.${expires}.${flag}.${challenge}`);
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: 'bad-signature' };

  return { ok: true, token: { id, expires: Number(expires), flag, challenge } };
};
