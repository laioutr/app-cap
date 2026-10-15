import type { CapOptions } from '../../shared/capOptions';
import type { ClaimStore } from './claim';
import type { CapKeys } from './secret';

export interface CapServer {
  keys: CapKeys;
  store: ClaimStore;
  options: CapOptions;
}

let current: CapServer | undefined;

/** Set by the Nitro plugin once a secret and a store exist. The routes answer 503 until then. */
export const setCapServer = (server: CapServer) => {
  current = server;
};

export const capServer = (): CapServer | undefined => current;
