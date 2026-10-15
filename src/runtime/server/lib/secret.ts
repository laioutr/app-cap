import { createHmac, randomBytes } from 'node:crypto';
import { APP_NAME } from '../../shared/constants';

export interface CapKeys {
  challenge: Buffer;
  token: Buffer;
}

const derive = (secret: string, purpose: string) => createHmac('sha256', secret).update(`${APP_NAME}:v1:${purpose}`).digest();

export const deriveKeys = (secret: string): CapKeys => ({ challenge: derive(secret, 'challenge'), token: derive(secret, 'token') });

export type KeyResolution = { keys: CapKeys; warning?: string } | { keys?: undefined; error: string };

/** The secret comes from runtime config, where an environment variable can set any value or none. */
export const resolveKeys = (projectSecretKey: unknown, devServer: boolean): KeyResolution => {
  if (typeof projectSecretKey === 'string' && projectSecretKey !== '') return { keys: deriveKeys(projectSecretKey) };
  if (!devServer)
    return { error: 'No project secret key is configured, so no proof can be signed. Every protected action will be rejected.' };
  return {
    keys: deriveKeys(randomBytes(32).toString('hex')),
    warning: 'No project secret key is configured. This process uses a random key, so a proof does not survive a restart.',
  };
};
