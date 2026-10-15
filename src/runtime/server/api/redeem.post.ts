import { trace } from '@opentelemetry/api';
import { createError, defineEventHandler, getRequestHeader, readRawBody, setResponseHeader, setResponseStatus } from 'h3';
import { capServer } from '../lib/capServer';
import { redeem, REDEEM_BODY_LIMIT, refused } from '../lib/redeem';

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store');
  const server = capServer();
  if (!server) throw createError({ statusCode: 503, statusMessage: 'Bot protection is not available' });

  // Refused before reading, so a large body costs nothing.
  const declared = Number(getRequestHeader(event, 'content-length'));
  const outcome =
    declared > REDEEM_BODY_LIMIT ? refused(413, 'malformed') : await redeem(await readRawBody(event, 'utf8'), server.keys, server.store);

  trace.getActiveSpan()?.setAttribute('app_cap.redeem.result', outcome.result);
  setResponseStatus(event, outcome.status);
  return outcome.body;
});
