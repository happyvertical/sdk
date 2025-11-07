---
"@happyvertical/sdk-mcp": patch
---

fix(sdk-mcp): correct package names in vite external config

Changed @have/* to @happyvertical/* in rollup external configuration to match actual package imports. This fixes build failures where vite could not resolve openai import from ai package dist folder.
