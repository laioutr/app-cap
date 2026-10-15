import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_TTL_MS } from '../shared/constants';

const solveCap = vi.fn<() => Promise<string>>();
vi.mock('./solveCap', () => ({ solveCap: () => solveCap() }));

const { createCapAdapter, MIN_TOKEN_LIFE_MS } = await import('./createAdapter');

let count = 0;
beforeEach(() => {
  count = 0;
  solveCap.mockReset();
  solveCap.mockImplementation(async () => `token-${++count}`);
});
afterEach(() => vi.useRealTimers());

const prepare = (adapter: ReturnType<typeof createCapAdapter>) => adapter.prepare({ action: 'a' });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createCapAdapter', () => {
  it('solves for the first action, then holds the next proof ready', async () => {
    const adapter = createCapAdapter();
    expect(await prepare(adapter)).toEqual({ 'x-cap-token': 'token-1' });
    await settle();
    expect(solveCap).toHaveBeenCalledTimes(2);
    expect(await prepare(adapter)).toEqual({ 'x-cap-token': 'token-2' });
  });

  it('gives two parallel actions two different tokens', async () => {
    const adapter = createCapAdapter();
    const [first, second] = await Promise.all([prepare(adapter), prepare(adapter)]);
    expect(first['x-cap-token']).not.toBe(second['x-cap-token']);
  });

  it('never hands out the same proof twice', async () => {
    solveCap.mockImplementationOnce(async () => 'token-a').mockImplementationOnce(() => new Promise(() => {}));
    const adapter = createCapAdapter();
    await prepare(adapter);
    expect(await Promise.race([prepare(adapter), settle().then(() => 'still waiting')])).toBe('still waiting');
  });

  it('waits for a solve in progress instead of starting a second one', async () => {
    let finish!: (token: string) => void;
    solveCap.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const adapter = createCapAdapter();
    const pending = prepare(adapter);
    await settle();
    expect(solveCap).toHaveBeenCalledTimes(1);
    finish('token-slow');
    expect(await pending).toEqual({ 'x-cap-token': 'token-slow' });
  });

  it('drops a held proof with too little life left', async () => {
    vi.useFakeTimers();
    const adapter = createCapAdapter();
    await prepare(adapter);
    await vi.advanceTimersByTimeAsync(0);
    vi.advanceTimersByTime(TOKEN_TTL_MS - MIN_TOKEN_LIFE_MS + 1);
    expect(await prepare(adapter)).toEqual({ 'x-cap-token': 'token-3' });
  });

  it('drops a failed background solve, and solves again for the next action', async () => {
    const adapter = createCapAdapter();
    solveCap
      .mockImplementationOnce(async () => 'token-a')
      .mockImplementationOnce(async () => {
        throw new Error('background');
      });
    await prepare(adapter);
    await settle();
    expect(await prepare(adapter)).toEqual({ 'x-cap-token': 'token-1' });
  });

  it('fails the action when the solve it waits for fails, and recovers on the next', async () => {
    solveCap.mockRejectedValueOnce(new Error('redeem'));
    const adapter = createCapAdapter();
    await expect(prepare(adapter)).rejects.toThrow('redeem');
    expect(await prepare(adapter)).toEqual({ 'x-cap-token': 'token-1' });
  });
});
