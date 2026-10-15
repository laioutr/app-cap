export type LimitedBody = { ok: true; text: string } | { ok: false };

/**
 * Reads a request body and stops at the first byte over `limit`. A chunked body has no content-length,
 * so a check of the header alone would buffer whatever the client sends.
 */
export const readBodyLimited = async (body: AsyncIterable<Uint8Array | string>, limit: number): Promise<LimitedBody> => {
  const chunks: Buffer[] = [];
  let size = 0;
  // Iterated by hand: leaving a `for await` calls `return()`, which destroys the request and the socket
  // with it, so the 413 would never reach the client.
  const iterator = body[Symbol.asyncIterator]();
  for (let next = await iterator.next(); !next.done; next = await iterator.next()) {
    const chunk = Buffer.from(next.value);
    size += chunk.length;
    if (size > limit) return { ok: false };
    chunks.push(chunk);
  }
  return { ok: true, text: Buffer.concat(chunks).toString('utf8') };
};
