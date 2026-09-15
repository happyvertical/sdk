---
'@happyvertical/messages': patch
---

Fix the ESM build: a CommonJS dependency was bundled into `dist/index.js` and its `require("node:os")` threw on import under Node. It is now external, and a dist import smoke test guards the entry.
