import { type CapOptions, DIFFICULTY } from '../runtime/shared/capOptions';

export interface CapModuleOptions {
  /** Reject a browser that Cap's instrumentation identifies as automated. Default `true`. */
  blockAutomatedBrowsers?: boolean;
  /** Expected HashWX hashes per solve. Default `1_000_000`, clamped to `50_000`–`5_000_000`. */
  difficulty?: number;
}

/** The options come from the laioutrrc, which is data we do not control. */
export const resolveCapOptions = (raw: unknown): { options: CapOptions; warnings: string[] } => {
  const input = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const warnings: string[] = [];

  let blockAutomatedBrowsers = true;
  if (input.blockAutomatedBrowsers !== undefined) {
    if (typeof input.blockAutomatedBrowsers === 'boolean') blockAutomatedBrowsers = input.blockAutomatedBrowsers;
    else warnings.push(`"blockAutomatedBrowsers" must be true or false, not ${JSON.stringify(input.blockAutomatedBrowsers)}. Using true.`);
  }

  let difficulty: number = DIFFICULTY.default;
  if (input.difficulty !== undefined) {
    if (typeof input.difficulty !== 'number' || !Number.isFinite(input.difficulty)) {
      warnings.push(`"difficulty" must be a number, not ${JSON.stringify(input.difficulty)}. Using ${DIFFICULTY.default}.`);
    } else {
      difficulty = Math.round(Math.min(DIFFICULTY.max, Math.max(DIFFICULTY.min, input.difficulty)));
      if (difficulty !== input.difficulty) {
        warnings.push(`"difficulty" ${input.difficulty} is outside ${DIFFICULTY.min}–${DIFFICULTY.max} or not whole. Using ${difficulty}.`);
      }
    }
  }

  return { options: { blockAutomatedBrowsers, difficulty }, warnings };
};
