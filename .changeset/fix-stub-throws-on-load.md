---
'@laioutr/app-cap': patch
---

Fix server-rendered pages answering 500 with `[@laioutr/app-cap] Not bundled: capjs-core needs this only for an obfuscation level above 3.` in some production builds. The health route kept answering, so such a build passed its boot check while serving no pages.
