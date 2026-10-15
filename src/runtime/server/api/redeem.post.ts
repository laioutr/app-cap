import { trace } from '@opentelemetry/api';
import { createError, defineEventHandler, getRequestHeader, setResponseHeader, setResponseStatus } from 'h3';
import { capServer } from '../lib/capServer';
import { readBodyLimited } from '../lib/readBody';
import { redeem, REDEEM_BODY_LIMIT, refused } from '../lib/redeem';

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store');
  const server = capServer();
  const store = server?.store();
  if (!server || !store) throw createError({ statusCode: 503, statusMessage: 'Bot protection is not available' });

  // A declared size over the limit is refused before reading. A chunked body declares none.
  const declared = Number(getRequestHeader(event, 'content-length'));
  const body = declared > REDEEM_BODY_LIMIT ? { ok: false as const } : await readBodyLimited(event.node.req, REDEEM_BODY_LIMIT);
  if (!body.ok) setResponseHeader(event, 'connection', 'close');
  const outcome = body.ok ? await redeem(body.text === '' ? undefined : body.text, server.keys, store) : refused(413, 'malformed');

  trace.getActiveSpan()?.setAttribute('app_cap.redeem.result', outcome.result);
  setResponseStatus(event, outcome.status);
  return outcome.body;
});
