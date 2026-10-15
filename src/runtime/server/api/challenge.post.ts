import { generateChallenge } from 'capjs-core';
import { createError, defineEventHandler, setResponseHeader } from 'h3';
import { capServer } from '../lib/capServer';

/** Levels 1 to 3 cost the same. Above 3, capjs-core needs esbuild, which the build leaves out. */
const OBFUSCATION_LEVEL = 3;

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store');
  const server = capServer();
  // Without a secret or a store no proof could be redeemed, so the browser is spared the solve.
  if (!server) throw createError({ statusCode: 503, statusMessage: 'Bot protection is not available' });

  return generateChallenge(server.keys.challenge, {
    format: 2,
    protocols: ['hashwx', 'instrumentation'],
    hashwxDifficulty: server.options.difficulty,
    instrumentation: { blockAutomatedBrowsers: server.options.blockAutomatedBrowsers, obfuscationLevel: OBFUSCATION_LEVEL },
  });
});
