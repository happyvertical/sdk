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
