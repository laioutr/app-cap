import { createHmac, randomBytes } from 'node:crypto';
import type { CapOptions } from '../../shared/capOptions';
import { APP_NAME } from '../../shared/constants';

export interface CapKeys {
  challenge: Buffer;
  token: Buffer;
}

/**
 * Every environment of a project shares one secret, and capjs-core reads the automation check and the
 * difficulty from the challenge itself. Binding the keys to both keeps a proof made under weaker options
 * from passing a stricter environment.
 */
export const deriveKeys = (secret: string, { blockAutomatedBrowsers, difficulty }: CapOptions): CapKeys => {
  const derive = (purpose: string) =>
    createHmac('sha256', secret)
      .update(`${APP_NAME}:v1:${purpose}:b${blockAutomatedBrowsers ? 1 : 0}:d${difficulty}`)
      .digest();
  return { challenge: derive('challenge'), token: derive('token') };
};

export type KeyResolution = { keys: CapKeys; warning?: string } | { keys?: undefined; error: string };

/** The secret comes from runtime config, where an environment variable can set any value or none. */
export const resolveKeys = (projectSecretKey: unknown, devServer: boolean, options: CapOptions): KeyResolution => {
  if (typeof projectSecretKey === 'string' && projectSecretKey !== '') return { keys: deriveKeys(projectSecretKey, options) };
  if (!devServer)
    return { error: 'No project secret key is configured, so no proof can be signed. Every protected action will be rejected.' };
  return {
    keys: deriveKeys(randomBytes(32).toString('hex'), options),
    warning: 'No project secret key is configured. This process uses a random key, so a proof does not survive a restart.',
  };
};
