import { LOG_PREFIX } from '../../shared/constants';
import { createMemoryClaimStore, createRedisClaimStore, type ClaimStore, type RedisSetNx } from './claim';

/**
 * Finds the claim store on first use, because on Laioutr Cloud the cache mount appears after this app's
 * plugin has run. A found store is kept. No store is asked about again on the next call.
 */
export const createLazyStore = (
  prefixOf: () => string | undefined,
  connect: () => Promise<RedisSetNx | undefined>,
  devServer: boolean
): (() => ClaimStore | undefined) => {
  let store: ClaimStore | undefined;
  let reported = false;

  return () => {
    if (store) return store;

    const prefix = prefixOf();
    if (prefix !== undefined) return (store = createRedisClaimStore(connect, prefix));

    if (devServer) {
      console.warn(`${LOG_PREFIX} No Redis is configured. Proofs are claimed in this process only.`);
      return (store = createMemoryClaimStore());
    }

    if (!reported) {
      reported = true;
      console.error(`${LOG_PREFIX} No Redis is configured, so a proof cannot be made single-use. Every protected action will be rejected.`);
    }
    return undefined;
  };
};
