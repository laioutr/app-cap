---
'@laioutr/app-cap': patch
---

Fix the production build failing at the Nitro step with `Could not load …/@laioutr/app-cap/dist/runtime/server/lib/unbundled.mjs (imported by capjs-core/src/instrumentation.js): ENOENT`. Every project that installed 0.1.0 from the registry hit it.
