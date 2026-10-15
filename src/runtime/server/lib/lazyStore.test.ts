import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLazyStore } from './lazyStore';

const connect = async () => undefined;

afterEach(() => vi.restoreAllMocks());

describe('createLazyStore', () => {
  it('finds a Redis mount that appears after the plugin ran, and keeps it', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let prefix: string | undefined;
    const storeNow = createLazyStore(() => prefix, connect, false);

    expect(storeNow()).toBeUndefined();
    prefix = 'tenant-a:app-cap:';
    const found = storeNow();
    expect(found).toBeDefined();
    prefix = undefined;
    expect(storeNow()).toBe(found);
  });

  it('uses one memory store on the dev server, and warns once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storeNow = createLazyStore(() => undefined, connect, true);

    const store = storeNow();
    expect(storeNow()).toBe(store);
    expect(await store!.claim('t:a', 60_000)).toBe('claimed');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('reports a missing store on a built server once, and asks again on each call', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const prefixOf = vi.fn(() => undefined);
    const storeNow = createLazyStore(prefixOf, connect, false);

    expect(storeNow()).toBeUndefined();
    expect(storeNow()).toBeUndefined();
    expect(prefixOf).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledTimes(1);
  });
});
