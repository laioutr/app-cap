import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { PACKAGE_NAME } from '../../shared/constants';

export type ClaimResult = 'claimed' | 'taken' | 'down';

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

/** `connect` is inside the limit: a connection that never comes up is an outage like any other. */
export const createRedisClaimStore = (connect: () => Promise<RedisSetNx | undefined>, prefix: string): ClaimStore => ({
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
          span.setAttribute('error.type', error instanceof ClaimTimeout ? 'timeout' : '_OTHER');
          return 'down';
        } finally {
          span.end();
        }
      }
    ),
});

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
