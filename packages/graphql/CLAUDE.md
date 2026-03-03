# @happyvertical/graphql

Generic GraphQL client for any endpoint. Factory: `getGraphQLClient(options): Promise<IGraphQLClient>`.

## Key patterns

- Endpoint-agnostic: works with GitHub, GitLab, Shopify, or any GraphQL API
- Two methods: `query<T>(query, variables)` and `mutate<T>(mutation, variables)`
- Token-based auth via `Authorization: Bearer` header
- Custom headers supported for API-key or other auth schemes
- Factory accepts existing `IGraphQLClient` instance (passthrough pattern)
- Typed error codes: `UNAUTHORIZED`, `NOT_FOUND`, `RATE_LIMITED`, `NETWORK_ERROR`, `VALIDATION_ERROR`
- `GraphQLError.isRetryable()` returns true for rate-limit and network errors

## Gotchas

- No adapter pattern — single `GraphQLClient` implementation for all endpoints
- `endpoint` is required; omitting it throws `VALIDATION_ERROR`
- Response must contain `data` field or throws; partial responses with only `errors` also throw
- No built-in retry or pagination — consumer must handle
- No `HAVE_GRAPHQL_*` env vars — pass `endpoint` and `token` directly
