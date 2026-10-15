import { solveCap } from './solveCap';
import type { BotProtectionAdapter } from '@laioutr-core/frontend-core/bot-protection';
import { APP_NAME, TOKEN_HEADER, TOKEN_TTL_MS } from '../shared/constants';

/** A held proof is sent only with this much life left, so it cannot expire on its way to the server. */
export const MIN_TOKEN_LIFE_MS = 30_000;

interface HeldProof {
  token: string;
  solvedAt: number;
}

export const createCapAdapter = (): BotProtectionAdapter => {
  let held: HeldProof | undefined;
  let solving: Promise<HeldProof> | undefined;
  let queue: Promise<unknown> = Promise.resolve();

  const startSolve = () => {
    const current = solveCap().then((token) => ({ token, solvedAt: Date.now() }));
    solving = current;
    current.then(
      (proof) => {
        if (solving !== current) return;
        solving = undefined;
        held = proof;
      },
      // A failed solve ahead of time is dropped. The next action starts its own and sees its error.
      () => {
        if (solving === current) solving = undefined;
      }
    );
    return current;
  };

  const usable = (proof: HeldProof) => Date.now() - proof.solvedAt <= TOKEN_TTL_MS - MIN_TOKEN_LIFE_MS;

  const take = async (): Promise<string> => {
    const proof = held && usable(held) ? held : await (solving ?? startSolve());
    held = undefined;
    startSolve();
    return proof.token;
  };

  return {
    name: APP_NAME,
    prepare() {
      // One taker at a time, so two actions never leave with the same single-use proof.
      const next = queue.then(take);
      queue = next.catch(() => undefined);
      return next.then((token) => ({ [TOKEN_HEADER]: token }));
    },
  };
};
