/** The one place the app's name is spelled. Paths, keys, labels and the provider value derive from it. */
export const APP_NAME = 'app-cap';
export const PACKAGE_NAME = `@laioutr/${APP_NAME}`;
export const LOG_PREFIX = `[${PACKAGE_NAME}]`;

/** The argument for `redisKeyPrefix()`, which prepends `app-` itself. */
export const KEY_ROOT = APP_NAME.slice('app-'.length);

export const TOKEN_HEADER = 'x-cap-token';
export const API_BASE = `/api/${APP_NAME}/`;

/** The widget build the static assets come from. `scripts/copy-assets.mjs` refuses any other. */
export const WIDGET_VERSION = '0.1.58';
export const ASSET_BASE = `/${APP_NAME}/${WIDGET_VERSION}/`;

/** Both halves know the lifetime, so the browser never compares the server's clock with its own. */
export const TOKEN_TTL_MS = 10 * 60_000;
