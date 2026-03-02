# @happyvertical/analytics

Unified analytics. Factory: `getAnalytics(options): Promise<AnalyticsProvider>`.

## Adapters

GA4 (full — Admin API, Data API, Measurement Protocol), Plausible (partial — reports + tracking only, no custom dims/metrics).

## Gotchas

- GA4 requires three separate APIs: Admin (property mgmt), Data (reports), Measurement Protocol (server tracking)
- GA4 service account key accepts file path or parsed JSON
- Plausible returns `NotSupportedError` for custom dimensions, user identification, batch tracking
- Plausible supports self-hosted via `baseUrl`
