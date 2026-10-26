# @laioutr/app-cap

## 0.1.2
### Patch Changes

- 3b0e159: Fix server-rendered pages answering 500 with `[@laioutr/app-cap] Not bundled: capjs-core needs this only for an obfuscation level above 3.` in some production builds. The health route kept answering, so such a build passed its boot check while serving no pages.

## 0.1.1
### Patch Changes

- dd2aa82: Fix the production build failing at the Nitro step with `Could not load …/@laioutr/app-cap/dist/runtime/server/lib/unbundled.mjs (imported by capjs-core/src/instrumentation.js): ENOENT`. Every project that installed 0.1.0 from the registry hit it.

## 0.1.0
### Minor Changes

- Cap as the bot-protection provider for Laioutr actions, without a vendor account. The visitor's browser solves the proof and the storefront's own server checks it, so no request leaves the project's origin.
  
  The app needs `@laioutr-core/frontend-core` 0.72.0 or later and Redis for orchestr's cache. A storefront with a Content Security Policy must allow more sources for it; the README lists them.
