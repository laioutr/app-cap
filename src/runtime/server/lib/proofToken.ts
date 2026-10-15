import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type ProofFlag = 'c' | 'u';

export interface ProofToken {
  id: string;
  /** Unix ms. */
  expires: number;
  /** `c`: the redeem claimed its challenge. `u`: the store was down, so it could not. */
  flag: ProofFlag;
}

export type ProofRead = { ok: true; token: ProofToken } | { ok: false; reason: 'malformed-proof' | 'bad-signature' };

const FORMAT = /^v1\.([A-Za-z0-9_-]{22})\.(\d{1,15})\.([cu])\.([A-Za-z0-9_-]{43})$/;

const mac = (key: Buffer, body: string) => createHmac('sha256', key).update(body).digest();

export const newProofId = (): string => randomBytes(16).toString('base64url');

export const signProofToken = (key: Buffer, { id, expires, flag }: ProofToken): string => {
  const body = `v1.${id}.${expires}.${flag}`;
  return `${body}.${mac(key, body).toString('base64url')}`;
};

export const readProofToken = (key: Buffer, raw: string): ProofRead => {
  const match = FORMAT.exec(raw);
  if (!match) return { ok: false, reason: 'malformed-proof' };

  const [, id, expires, flag, signature] = match as unknown as [string, string, string, ProofFlag, string];
  const expected = mac(key, `v1.${id}.${expires}.${flag}`);
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: 'bad-signature' };

  return { ok: true, token: { id, expires: Number(expires), flag } };
};
