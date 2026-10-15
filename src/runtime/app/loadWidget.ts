import { ASSET_BASE, LOG_PREFIX } from '../shared/constants';

export const WIDGET_TIMEOUT_MS = 10_000;

export interface CapInstance {
  readonly widget: HTMLElement;
  /** `undefined` when the widget gives up without throwing, as on a blocked instrumentation. */
  solve(): Promise<{ success: boolean; token: string } | undefined>;
  addEventListener(type: 'error', listener: (event: CustomEvent<{ code?: string }>) => void): void;
}
export type CapConstructor = new (config: { apiEndpoint: string }) => CapInstance;

type CapWindow = Window & {
  Cap?: CapConstructor;
  CAP_CUSTOM_WASM_URL?: string;
  CAP_CUSTOM_HASHWX_URL?: string;
  CAP_PAKO_URL?: string;
  CAP_SILENT?: boolean;
};

let loading: Promise<CapConstructor> | undefined;

export const loadWidget = (): Promise<CapConstructor> => {
  loading ??= new Promise<CapConstructor>((resolve, reject) => {
    const capWindow = window as CapWindow;
    // Without these three, the widget downloads its WASM and an inflate fallback from a public CDN.
    capWindow.CAP_CUSTOM_WASM_URL = `${ASSET_BASE}solver.wasm`;
    capWindow.CAP_CUSTOM_HASHWX_URL = `${ASSET_BASE}hashwx.wasm`;
    capWindow.CAP_PAKO_URL = `${ASSET_BASE}inflate.js`;
    capWindow.CAP_SILENT = true;

    const script = document.createElement('script');
    const fail = (message: string) => {
      clearTimeout(timer);
      script.remove();
      loading = undefined;
      reject(new Error(`${LOG_PREFIX} ${message}`));
    };
    const timer = setTimeout(() => fail('The widget did not load in time.'), WIDGET_TIMEOUT_MS);

    script.src = `${ASSET_BASE}widget.js`;
    script.async = true;
    script.addEventListener('load', () => {
      clearTimeout(timer);
      if (capWindow.Cap) resolve(capWindow.Cap);
      else fail('The widget loaded without its global.');
    });
    script.addEventListener('error', () => fail('Could not load the widget.'));
    document.head.append(script);
  });
  return loading;
};
