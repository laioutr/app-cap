// Copies the browser half of Cap from the pinned packages into the module, so a storefront serves every
// file itself and the widget never reaches for a CDN.
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = (name) => join(root, 'node_modules', name);
const versionOf = (name) => JSON.parse(readFileSync(join(pkg(name), 'package.json'), 'utf8')).version;

const constants = readFileSync(join(root, 'src/runtime/shared/constants.ts'), 'utf8');
const widgetVersion = /WIDGET_VERSION = '([^']+)'/.exec(constants)?.[1];
const appName = /APP_NAME = '([^']+)'/.exec(constants)?.[1];
if (!widgetVersion || !appName) throw new Error('copy-assets: WIDGET_VERSION or APP_NAME not found in constants.ts.');

if (versionOf('@cap.js/widget') !== widgetVersion) {
  throw new Error(`copy-assets: @cap.js/widget is ${versionOf('@cap.js/widget')}, but WIDGET_VERSION is ${widgetVersion}.`);
}
// The widget asks for this exact WASM build, so a different one breaks every solve.
const wasmVersion = /WASM_VERSION = "([^"]+)"/.exec(readFileSync(join(pkg('@cap.js/widget'), 'src/cap.js'), 'utf8'))?.[1];
if (versionOf('@cap.js/wasm') !== wasmVersion) {
  throw new Error(`copy-assets: the widget expects @cap.js/wasm ${wasmVersion}, but ${versionOf('@cap.js/wasm')} is installed.`);
}

const assets = join(root, 'src/runtime/app/public', appName, widgetVersion);
const licenses = join(root, 'third-party-licenses');
mkdirSync(assets, { recursive: true });
mkdirSync(licenses, { recursive: true });

const files = [
  [join(pkg('@cap.js/widget'), 'cap.min.js'), join(assets, 'widget.js')],
  [join(pkg('@cap.js/wasm'), 'browser/cap_wasm_bg.wasm'), join(assets, 'solver.wasm')],
  [join(pkg('@cap.js/wasm'), 'browser/hashwx.wasm'), join(assets, 'hashwx.wasm')],
  [join(pkg('pako'), 'dist/pako_inflate.min.js'), join(assets, 'inflate.js')],
  // @cap.js/wasm carries no LICENSE file; it comes from the same project as the widget.
  [join(pkg('@cap.js/widget'), 'LICENSE'), join(licenses, 'cap.LICENSE.txt')],
  [join(pkg('pako'), 'LICENSE'), join(licenses, 'pako.LICENSE.txt')],
];
for (const [from, to] of files) copyFileSync(from, to);

process.stdout.write(`copy-assets: ${files.length} files for widget ${widgetVersion}, wasm ${wasmVersion}.\n`);
