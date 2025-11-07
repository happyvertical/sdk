---
"@happyvertical/ai": patch
"@happyvertical/cache": patch
"@happyvertical/documents": patch
"@happyvertical/files": patch
"@happyvertical/geo": patch
"@happyvertical/github-actions": patch
"@happyvertical/logger": patch
"@happyvertical/ocr": patch
"@happyvertical/pdf": patch
"@happyvertical/projects": patch
"@happyvertical/repos": patch
"@happyvertical/sdk-mcp": patch
"@happyvertical/spider": patch
"@happyvertical/sql": patch
"@happyvertical/translator": patch
"@happyvertical/utils": patch
"@happyvertical/weather": patch
"@have/docs": patch
---

chore: update all dependencies to latest versions

Updated all dependencies across the monorepo to their latest versions:
- vite: 5.4.x/6.x/7.1.x → 7.2.2
- vitest: 2.1.9/3.2.4 → 4.0.8
- happy-dom: 18.0.1 → 20.0.10 (fixes CVE-2025-61927, CVE-2025-62410)
- vite-plugin-dts: 3.9.x/4.3.x → 4.5.4
- @biomejs/biome: 1.9.4/2.3.3 → 2.3.4
- turbo: 2.3.3/2.5.x → 2.6.0
- typescript: 5.7.x → 5.9.3
- And 30+ other dependencies

Also fixed test and typecheck failures in logger package:
- Added `vi.clearAllMocks()` to clear mock spy history between tests
- Added `skipLibCheck: true` to prevent checking problematic node_modules types

Closes #387, #396, #397
