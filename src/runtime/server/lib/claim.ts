import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { LOG_PREFIX, PACKAGE_NAME } from '../../shared/constants';

/**
 * `down`: no answer in time, an outage the project's policy decides about. `error`: Redis answered and
 * refused the command, as for a key outside the tenant's ACL, which is a configuration fault.
 */
export type ClaimResult = 'claimed' | 'taken' | 'down' | 'error';

export interface ClaimStore {
  claim(key: string, ttlMs: number): Promise<ClaimResult>;
}

export const CLAIM_TIMEOUT_MS = 1_000;

/** The one command a claim sends, in the shape node-redis takes it. */
export interface RedisSetNx {
  set(key: string, value: string, options: { condition: 'NX'; expiration: { type: 'PX'; value: number } }): Promise<unknown>;
}

class ClaimTimeout extends Error {}

const withinLimit = <T>(work: Promise<T>): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ClaimTimeout()), CLAIM_TIMEOUT_MS);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
};

const tracer = trace.getTracer(PACKAGE_NAME);

const REPLY_CLASSES = new Set(['ErrorReply', 'SimpleError', 'BlobError']);

/**
 * The error code of a reply Redis sent, such as `NOPERM` or `READONLY`; `undefined` for a failure to get
 * an answer. node-redis gives its reply errors no `name`, so the class and the code word decide.
 */
const replyCodeOf = (error: unknown): string | undefined => {
  if (!(error instanceof Error)) return undefined;
  const code = /^([A-Z][A-Z_]+)\b/.exec(error.message)?.[1];
  return REPLY_CLASSES.has(error.constructor.name) ? (code ?? 'ERR') : code;
};

/** `connect` is inside the limit: a connection that never comes up is an outage like any other. */
export const createRedisClaimStore = (connect: () => Promise<RedisSetNx | undefined>, prefix: string): ClaimStore => {
  let reported = false;
  return {
    claim: (key, ttlMs) =>
      tracer.startActiveSpan(
        'app_cap.claim',
        { kind: SpanKind.CLIENT, attributes: { 'db.system.name': 'redis', 'db.operation.name': 'SET' } },
        async (span) => {
          try {
            const answer = await withinLimit(
              (async () => {
                const redis = await connect();
                if (!redis) throw new Error('No Redis connection.');
                const expiration = { type: 'PX' as const, value: Math.max(1, Math.ceil(ttlMs)) };
                return redis.set(`${prefix}${key}`, '1', { condition: 'NX', expiration });
              })()
            );
            return answer === 'OK' ? 'claimed' : 'taken';
          } catch (error) {
            span.setStatus({ code: SpanStatusCode.ERROR });
            const replyCode = replyCodeOf(error);
            if (replyCode === undefined) {
              span.setAttribute('error.type', error instanceof ClaimTimeout ? 'timeout' : '_OTHER');
              return 'down';
            }
            span.setAttribute('error.type', replyCode);
            if (!reported) {
              reported = true;
              // eslint-disable-next-line no-console -- the bot-protection contract reports a configuration gap with console.error
              console.error(
                `${LOG_PREFIX} Redis refused a claim below "${prefix}" with ${replyCode}. Every protected action will be rejected.`
              );
            }
            return 'error';
          } finally {
            span.end();
          }
        }
      ),
  };
};

/** For the dev server only: one process, so two instances would each accept the same proof. */
export const createMemoryClaimStore = (): ClaimStore => {
  const claims = new Map<string, number>();
  return {
    claim: async (key, ttlMs) => {
      const now = Date.now();
      for (const [claimed, until] of claims) if (until <= now) claims.delete(claimed);
      if (claims.has(key)) return 'taken';
      claims.set(key, now + ttlMs);
      return 'claimed';
    },
  };
};
