import { API_BASE, LOG_PREFIX } from '../shared/constants';
import { loadWidget, type CapConstructor } from './loadWidget';

export const SOLVE_TIMEOUT_MS = 30_000;

export type CapStep = 'load' | 'challenge' | 'solve' | 'redeem';

export class CapProofError extends Error {
  constructor(
    readonly step: CapStep,
    detail: string
  ) {
    super(`${LOG_PREFIX} The proof failed at step "${step}": ${detail}`);
    this.name = 'CapProofError';
  }
}

const stepOf = (code: string | undefined): CapStep => {
  switch (code) {
    case 'missing_endpoint':
    case 'network_error':
    case 'challenge_parse_error':
    case 'challenge_unsupported':
      return 'challenge';
    case 'redeem_failed':
    case 'invalid_solution':
    case 'invalid_expires':
    case 'instr_blocked':
    case 'instr_timeout':
      return 'redeem';
    default:
      return 'solve';
  }
};

export const solveCap = async (): Promise<string> => {
  let Cap: CapConstructor;
  try {
    Cap = await loadWidget();
  } catch (error) {
    throw new CapProofError('load', (error as Error).message);
  }

  const cap = new Cap({ apiEndpoint: API_BASE });
  let code: string | undefined;
  cap.addEventListener('error', (event) => {
    code = event.detail?.code;
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), SOLVE_TIMEOUT_MS);
  });

  try {
    const result = await Promise.race([cap.solve(), limit]);
    if (result === 'timeout') throw new CapProofError('solve', `no proof in ${SOLVE_TIMEOUT_MS / 1_000} s`);
    if (!result?.success || !result.token) throw new CapProofError(stepOf(code), code ?? 'no token');
    return result.token;
  } catch (error) {
    if (error instanceof CapProofError) throw error;
    throw new CapProofError(stepOf(code), code ?? (error as Error).message);
  } finally {
    clearTimeout(timer);
    // The widget aborts its work when it leaves the document, so this also stops a late solve.
    cap.widget.remove();
  }
};
