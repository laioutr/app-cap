# @laioutr/app-cap

## 0.1.0
### Minor Changes

- Cap as the bot-protection provider for Laioutr actions, without a vendor account. The visitor's browser solves the proof and the storefront's own server checks it, so no request leaves the project's origin.
  
  The app needs `@laioutr-core/frontend-core` 0.72.0 or later and Redis for orchestr's cache. A storefront with a Content Security Policy must allow more sources for it; the README lists them.
