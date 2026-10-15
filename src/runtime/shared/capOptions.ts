export interface CapOptions {
  blockAutomatedBrowsers: boolean;
  difficulty: number;
}

/** Cap's own range for the HashWX difficulty. */
export const DIFFICULTY = { default: 1_000_000, min: 50_000, max: 5_000_000 } as const;
