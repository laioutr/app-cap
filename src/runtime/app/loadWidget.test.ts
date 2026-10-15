// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ASSET_BASE } from '../shared/constants';

// happy-dom never fetches a script. It settles each one synchronously on insertion: `error` by
// default, `load` when this setting is on.
const settleScriptsAs = (outcome: 'load' | 'error') => {
  (window as any).happyDOM.settings.handleDisabledFileLoadingAsSuccess = outcome === 'load';
};
const scripts = () => [...document.querySelectorAll<HTMLScriptElement>('script[src*="widget.js"]')];

beforeEach(() => {
  vi.resetModules();
  document.head.innerHTML = '';
  delete (window as any).Cap;
  settleScriptsAs('error');
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('loadWidget', () => {
  it('points every widget download at the project, then loads the script once', async () => {
    settleScriptsAs('load');
    (window as any).Cap = class {};
    const { loadWidget } = await import('./loadWidget');

    const first = loadWidget();
    const second = loadWidget();
    expect(scripts()).toHaveLength(1);
    expect(new URL(scripts()[0]!.src).pathname).toBe(`${ASSET_BASE}widget.js`);
    expect(window).toMatchObject({
      CAP_CUSTOM_WASM_URL: `${ASSET_BASE}solver.wasm`,
      CAP_CUSTOM_HASHWX_URL: `${ASSET_BASE}hashwx.wasm`,
      CAP_PAKO_URL: `${ASSET_BASE}inflate.js`,
      CAP_SILENT: true,
    });
    await expect(first).resolves.toBe((window as any).Cap);
    await expect(second).resolves.toBe((window as any).Cap);
  });

  it('tries again after a failed load', async () => {
    // happy-dom caches a failed URL, so this test settles each script itself.
    const appended: HTMLScriptElement[] = [];
    vi.spyOn(document.head, 'append').mockImplementation((node) => {
      appended.push(node as HTMLScriptElement);
    });
    const { loadWidget } = await import('./loadWidget');

    const failed = loadWidget();
    appended[0]!.dispatchEvent(new Event('error'));
    await expect(failed).rejects.toThrow(/could not load/i);

    const retried = loadWidget();
    expect(appended).toHaveLength(2);
    (window as any).Cap = class {};
    appended[1]!.dispatchEvent(new Event('load'));
    await expect(retried).resolves.toBe((window as any).Cap);
  });

  it('gives up after the load limit', async () => {
    vi.useFakeTimers();
    vi.spyOn(document.head, 'append').mockImplementation(() => {});
    const { loadWidget, WIDGET_TIMEOUT_MS } = await import('./loadWidget');
    const loading = loadWidget();
    vi.advanceTimersByTime(WIDGET_TIMEOUT_MS);
    await expect(loading).rejects.toThrow(/in time/i);
  });
});
