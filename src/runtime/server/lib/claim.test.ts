import { createServer, type Server, type Socket } from 'node:net';
import { createClient } from 'redis';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CLAIM_TIMEOUT_MS, createMemoryClaimStore, createRedisClaimStore, type RedisSetNx } from './claim';

const redisUrl = process.env.REDIS_URL;
if (process.env.CI && !redisUrl) throw new Error('CI must set REDIS_URL, or the claim tests prove nothing.');

describe('memory claims', () => {
  it('claims once', async () => {
    const store = createMemoryClaimStore();
    expect(await store.claim('t:a', 60_000)).toBe('claimed');
    expect(await store.claim('t:a', 60_000)).toBe('taken');
  });

  it('frees a claim when its time is over', async () => {
    vi.useFakeTimers();
    try {
      const store = createMemoryClaimStore();
      await store.claim('t:a', 1_000);
      vi.advanceTimersByTime(1_001);
      expect(await store.claim('t:a', 1_000)).toBe('claimed');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe.runIf(redisUrl)('redis claims', () => {
  const client = createClient({ url: redisUrl });
  const prefix = `test:app-cap:${Date.now()}:`;
  beforeAll(() => client.connect());
  afterAll(() => client.quit());

  it('claims once, under the prefix, with the expiry', async () => {
    const store = createRedisClaimStore(async () => client as unknown as RedisSetNx, prefix);
    expect(await store.claim('t:a', 5_000)).toBe('claimed');
    expect(await store.claim('t:a', 5_000)).toBe('taken');
    const ttl = await client.pTTL(`${prefix}t:a`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(5_000);
  });

  it('claims again when the connection comes back', async () => {
    let up = false;
    const store = createRedisClaimStore(async () => {
      if (!up) throw new Error('connection refused');
      return client as unknown as RedisSetNx;
    }, prefix);
    expect(await store.claim('t:b', 5_000)).toBe('down');
    up = true;
    expect(await store.claim('t:b', 5_000)).toBe('claimed');
  });
});

describe('a store that does not answer', () => {
  let server: Server;
  let url: string;
  const sockets = new Set<Socket>();
  beforeAll(async () => {
    // Accepts the connection and never answers, which is how a stalled Redis looks from here.
    server = createServer((socket) => sockets.add(socket));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `redis://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(() => {
    for (const socket of sockets) socket.destroy();
    return new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('counts as down after the claim limit', async () => {
    const client = createClient({ url, socket: { connectTimeout: 10_000, reconnectStrategy: false } });
    client.on('error', () => {});
    const store = createRedisClaimStore(async () => {
      if (!client.isOpen) await client.connect();
      return client as unknown as RedisSetNx;
    }, 'test:');
    const started = Date.now();
    expect(await store.claim('t:c', 5_000)).toBe('down');
    expect(Date.now() - started).toBeGreaterThanOrEqual(CLAIM_TIMEOUT_MS - 50);
    expect(Date.now() - started).toBeLessThan(CLAIM_TIMEOUT_MS + 1_000);
    client.destroy();
  });
});
