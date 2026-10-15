import { hashwxReady } from 'capjs-core';
import { getHeader } from 'h3';
import { defineNitroPlugin, redisKeyPrefix, setBotProtectionVerifier, useRedis, useRuntimeConfig } from '#imports';
import type { CapOptions } from '../../shared/capOptions';
import { APP_NAME, KEY_ROOT, LOG_PREFIX, PACKAGE_NAME, TOKEN_HEADER } from '../../shared/constants';
import { setCapServer } from '../lib/capServer';
import { createMemoryClaimStore, createRedisClaimStore, type ClaimStore, type RedisSetNx } from '../lib/claim';
import { resolveKeys } from '../lib/secret';
import { verifyProof } from '../lib/verifyProof';

export default defineNitroPlugin(() => {
  const config = useRuntimeConfig();
  const options = config[PACKAGE_NAME] as CapOptions;
  const devServer = import.meta.dev === true;

  const resolved = resolveKeys(config.laioutr?.projectSecretKey, devServer);
  if (!resolved.keys) {
    console.error(`${LOG_PREFIX} ${resolved.error}`);
    return;
  }
  if (resolved.warning) console.warn(`${LOG_PREFIX} ${resolved.warning}`);

  let store: ClaimStore;
  const prefix = redisKeyPrefix(KEY_ROOT);
  if (prefix !== undefined) {
    store = createRedisClaimStore(async () => (await useRedis()) as unknown as RedisSetNx | undefined, prefix);
  } else if (devServer) {
    console.warn(`${LOG_PREFIX} No Redis is configured. Proofs are claimed in this process only.`);
    store = createMemoryClaimStore();
  } else {
    console.error(`${LOG_PREFIX} No Redis is configured, so a proof cannot be made single-use. Every protected action will be rejected.`);
    return;
  }

  // Compiled now, so the first redeem does not pay for it.
  hashwxReady().catch((error) => console.error(`${LOG_PREFIX} HashWX did not compile.`, error));

  const { keys } = resolved;
  setCapServer({ keys, store, options });
  setBotProtectionVerifier({ name: APP_NAME, verify: (event) => verifyProof(getHeader(event, TOKEN_HEADER), keys.token, store) });
});
