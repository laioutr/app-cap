// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_BASE } from '../shared/constants';

const loadWidget = vi.fn();
vi.mock('./loadWidget', () => ({ loadWidget: () => loadWidget() }));

type Behaviour = (cap: FakeCap) => Promise<unknown>;
let behaviour: Behaviour;
const made: FakeCap[] = [];

/** Stands in for Cap's widget script, which the browser would load from the project. */
class FakeCap {
  readonly widget = document.createElement('cap-widget');
  private readonly events = new EventTarget();
  constructor(readonly config: { apiEndpoint: string }) {
    document.documentElement.append(this.widget);
    made.push(this);
  }
  solve() {
    return behaviour(this);
  }
  addEventListener(type: string, listener: (event: any) => void) {
    this.events.addEventListener(type, listener);
  }
  fail(code: string) {
    this.events.dispatchEvent(new CustomEvent('error', { detail: { code, message: code } }));
  }
}

beforeEach(() => {
  made.length = 0;
  loadWidget.mockResolvedValue(FakeCap);
});
afterEach(() => vi.useRealTimers());

const { solveCap, SOLVE_TIMEOUT_MS } = await import('./solveCap');

describe('solveCap', () => {
  it('solves against the app routes and removes its widget', async () => {
    behaviour = async () => ({ success: true, token: 'v1.token' });
    await expect(solveCap()).resolves.toBe('v1.token');
    expect(made[0]!.config.apiEndpoint).toBe(API_BASE);
    expect(made[0]!.widget.isConnected).toBe(false);
  });

  it('names the load step when the script does not load', async () => {
    loadWidget.mockRejectedValue(new Error('Could not load'));
    await expect(solveCap()).rejects.toMatchObject({ step: 'load' });
  });

  it.each([
    ['network_error', 'challenge'],
    ['challenge_parse_error', 'challenge'],
    ['invalid_solution', 'redeem'],
    ['solve_failed', 'solve'],
  ])('names the step of widget error %s', async (code, step) => {
    behaviour = async (cap) => {
      cap.fail(code);
      throw new Error(code);
    };
    await expect(solveCap()).rejects.toMatchObject({ step });
  });

  it('treats a blocked instrumentation, which resolves with nothing, as a failed redeem', async () => {
    behaviour = async (cap) => {
      cap.fail('instr_blocked');
      return undefined;
    };
    await expect(solveCap()).rejects.toMatchObject({ step: 'redeem' });
  });

  it('stops a solve that runs past the limit, and removes its widget', async () => {
    vi.useFakeTimers();
    behaviour = () => new Promise(() => {});
    const solving = solveCap();
    const assertion = expect(solving).rejects.toMatchObject({ step: 'solve' });
    await vi.advanceTimersByTimeAsync(SOLVE_TIMEOUT_MS);
    await assertion;
    expect(made[0]!.widget.isConnected).toBe(false);
  });
});
