import { hashwxReady } from 'capjs-core';
import { getHeader } from 'h3';
import { defineNitroPlugin, redisKeyPrefix, setBotProtectionVerifier, useRedis, useRuntimeConfig } from '#imports';
import type { CapOptions } from '../../shared/capOptions';
import type { RedisSetNx } from '../lib/claim';
import { APP_NAME, KEY_ROOT, LOG_PREFIX, PACKAGE_NAME, TOKEN_HEADER } from '../../shared/constants';
import { setCapServer } from '../lib/capServer';
import { createLazyStore } from '../lib/lazyStore';
import { resolveKeys } from '../lib/secret';
import { verifyProof } from '../lib/verifyProof';

export default defineNitroPlugin(() => {
  const config = useRuntimeConfig();
  const options = config[PACKAGE_NAME] as CapOptions;
  const devServer = import.meta.dev === true;

  const resolved = resolveKeys(config.laioutr?.projectSecretKey, devServer, options);
  if (!resolved.keys) {
    // eslint-disable-next-line no-console -- the bot-protection contract reports a configuration gap with console.error
    console.error(`${LOG_PREFIX} ${resolved.error}`);
    return;
  }
  if (resolved.warning) console.warn(`${LOG_PREFIX} ${resolved.warning}`);

  const store = createLazyStore(
    () => redisKeyPrefix(KEY_ROOT),
    async () => (await useRedis()) as unknown as RedisSetNx | undefined,
    devServer
  );

  // Compiled now, so the first redeem does not pay for it.
  // eslint-disable-next-line no-console -- a broken WASM compile fails every redeem, so it is an error
  hashwxReady().catch((error) => console.error(`${LOG_PREFIX} HashWX did not compile.`, error));

  const { keys } = resolved;
  setCapServer({ keys, options, store });
  setBotProtectionVerifier({ name: APP_NAME, verify: (event) => verifyProof(getHeader(event, TOKEN_HEADER), keys.token, store()) });
});
