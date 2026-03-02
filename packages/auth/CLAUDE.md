# @happyvertical/auth

Authentication providers. Factory: `getAuth(options): Promise<AuthProvider>`.

## Adapters

Keycloak (full OIDC/PKCE, user mgmt, sessions), Kanidm (full OIDC/PKCE, native v1 API). Cognito, Nostr, Google, GitHub are stubs (throw "not yet implemented").

## Gotchas

- Both Keycloak and Kanidm default PKCE to true
- Token validation requires JWKS endpoint (fetched on demand)
- Kanidm supports both username/password and apiToken auth (discriminated union)
- Env vars use `HAVE_AUTH_*` prefix
