import type { CapOptions } from '../../shared/capOptions';
import type { ClaimStore } from './claim';
import type { CapKeys } from './secret';

export interface CapServer {
  keys: CapKeys;
  options: CapOptions;
  /** `undefined` while no store exists. */
  store: () => ClaimStore | undefined;
}

let current: CapServer | undefined;

/** Set by the Nitro plugin once a secret exists. The routes answer 503 until then, or while no store exists. */
export const setCapServer = (server: CapServer) => {
  current = server;
};

export const capServer = (): CapServer | undefined => current;
