import { describe, expect, it } from 'vitest';
import { resolveCapOptions } from './resolveCapOptions';

describe('resolveCapOptions', () => {
  it('needs no option', () => {
    expect(resolveCapOptions(undefined)).toEqual({ options: { blockAutomatedBrowsers: true, difficulty: 1_000_000 }, warnings: [] });
  });

  it('lets a project switch the automation check off', () => {
    expect(resolveCapOptions({ blockAutomatedBrowsers: false }).options.blockAutomatedBrowsers).toBe(false);
  });

  it.each([
    [10, 50_000],
    [9_000_000, 5_000_000],
    [123_456.7, 123_457],
  ])('clamps difficulty %d to %d and names it', (difficulty, used) => {
    const { options, warnings } = resolveCapOptions({ difficulty });
    expect(options.difficulty).toBe(used);
    expect(warnings).toEqual([expect.stringContaining('"difficulty"')]);
  });

  it.each([
    [{ difficulty: '2000000' }, 'difficulty'],
    [{ difficulty: Number.NaN }, 'difficulty'],
    [{ blockAutomatedBrowsers: 'no' }, 'blockAutomatedBrowsers'],
  ])('falls back to the default for a value of the wrong type (%j)', (raw, option) => {
    const { options, warnings } = resolveCapOptions(raw);
    expect(options).toEqual({ blockAutomatedBrowsers: true, difficulty: 1_000_000 });
    expect(warnings).toEqual([expect.stringContaining(`"${option}"`)]);
  });
});
