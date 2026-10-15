import { describe, expect, it } from 'vitest';
import { readBodyLimited } from './readBody';

/** A body sent in chunks, as with `transfer-encoding: chunked`, which carries no content-length. */
const chunked = (sizes: number[]) => {
  let pulled = 0;
  const body = (async function* () {
    for (const size of sizes) {
      pulled++;
      yield Buffer.alloc(size, 'x');
    }
  })();
  return { body, pulled: () => pulled };
};

describe('readBodyLimited', () => {
  it('reads a body up to the limit', async () => {
    const { body } = chunked([10, 6]);
    expect(await readBodyLimited(body, 16)).toEqual({ ok: true, text: 'x'.repeat(16) });
  });

  it('stops at the first byte over the limit, before the rest arrives', async () => {
    const { body, pulled } = chunked(Array.from({ length: 1_000 }, () => 1_024));
    expect(await readBodyLimited(body, 16 * 1_024)).toEqual({ ok: false });
    expect(pulled()).toBe(17);
  });

  it('reads string chunks by their bytes', async () => {
    const body = (async function* () {
      yield 'ä'.repeat(9);
    })();
    expect(await readBodyLimited(body, 17)).toEqual({ ok: false });
  });
});
