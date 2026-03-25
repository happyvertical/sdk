---
"@happyvertical/analytics": patch
---

Cut a fresh `@happyvertical/analytics` release so downstream installs pick up the
GA4 property discovery and bounded hydration fixes from `#904`.

The published `0.71.17` artifact still contains the pre-`#904` GA4
implementation, so this changeset forces a distinct version with the corrected
build output.
