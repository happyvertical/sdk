# @happyvertical/analytics

Unified analytics interfaces for Google Analytics 4, Plausible, and Matomo.

## Matomo reports

Date-dimension reports use `VisitsSummary.get` with `period=day`. Each date in
Matomo's response produces one report row, including dates represented by an
empty array or empty record. Empty days have zero metrics; populated days retain
their counts. The provider does not invent dates absent from the response.

Page reports use `Actions.getPageUrls`. For compatibility, `pagePath` and
`unifiedPagePathScreen` return Matomo's full page URL when supplied, falling back
to its label. Consumers matching local content paths should parse the URL at
their application boundary.

`activeUsers` reads `nb_uniq_visitors` or `nb_users`. When Matomo omits both,
the current provider returns zero; this means the visitor metric is unavailable,
not proof that there were no visitors. `nb_visits` maps to `sessions` and must
not be substituted for unique visitors. Page-view metrics read `nb_hits` or
`nb_pageviews`. Consumers should use the available metrics and distinguish an
unavailable visitor count from an observed zero.

Run package validation with `pnpm --filter @happyvertical/analytics test` and
`pnpm exec turbo run build --filter=@happyvertical/analytics`.

## Exact timestamp interval aggregates

`runIntervalReport(propertyId, { interval: { startTime, endTime, timeZone },
metrics })` is separate from calendar-date `runReport`. It describes the exact
half-open interval `[startTime, endTime)`: the end instant is excluded. Timestamps
require seconds and an explicit offset (`Z` or `+/-HH:MM`), with up to three
fractional digits. The explicit IANA `timeZone` provides context; the timestamp
offsets define the instants, including during DST folds. Empty/reversed intervals,
invalid calendar timestamps, unknown-offset `-00:00`, unknown zones and empty or
duplicate metrics reject with `RangeError` before provider access.

Check `getCapabilities().timestampIntervalReporting` and the optional method
before calling; absent capabilities/methods mean unsupported. Matomo advertises
`{ precision: 'utc-calendar-days', metrics: ['screenPageViews'] }`. It verifies
the property's timezone from provider metadata and supports only UTC properties
with both instants at UTC midnight. Intervals ending after the current time
return unavailable (`interval-incomplete`) without a provider report. It requests
`Actions.get` once for the
inclusive calendar range ending the day before the exclusive boundary. This
supports reproducible whole-day or quarterly pageview totals without summing
visitor counts. Non-UTC properties, DST days, partial days and other metrics
return `status: 'unsupported'`; unknown property timezone returns unavailable.

Only `status: 'available'` contains `metrics`, including an observed value `'0'`.
Missing/malformed provider pageviews return `status: 'unavailable'`, never zero.
Authentication, network and provider failures reject normally. GA4 and Plausible
currently advertise `false` and return unsupported precision without a request.
No adapter silently converts arbitrary timestamps to calendar dates. Existing
calendar reports retain their behavior and their documented availability limits.

```typescript
const capabilities = await analytics.getCapabilities();
if (capabilities.timestampIntervalReporting && analytics.runIntervalReport) {
  const result = await analytics.runIntervalReport('site-id', {
    interval: {
      startTime: '2026-07-01T00:00:00Z',
      endTime: '2026-10-01T00:00:00Z',
      timeZone: 'UTC',
    },
    metrics: [{ name: 'screenPageViews' }],
  });
  if (result.status === 'available') console.log(result.metrics);
}
```

Provider boundary contract: [Matomo Reporting API](https://developer.matomo.org/guides/reporting-api)
uses inclusive calendar ranges in the property's timezone. Plausible's documented
timestamp support does not by itself establish this API's exact half-open
precision guarantees, so it remains unsupported here.
