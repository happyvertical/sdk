---
"@happyvertical/analytics": patch
"@happyvertical/utils": patch
"@happyvertical/sql": patch
---

Fix TypeScript errors from @types/node v25 stricter type checking

- analytics/ga4.ts: Use non-null assertions for adminClient/dataClient after ensureClients()
- utils/parse-args.ts: Cast options to Record<string, unknown> for number value post-processing
- sql/postgres.ts: Add type annotation to reduce() for batch insert values
