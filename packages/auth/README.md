# @happyvertical/auth

Unified authentication interface supporting multiple providers.

## Providers

- **Keycloak** - Full OIDC/OAuth2 with admin capabilities
- **AWS Cognito** - OAuth2 with hosted UI
- **Nostr** - Decentralized public key identity

## Installation

```bash
npm install @happyvertical/auth
```

## Claude Code Context

Install Claude Code context files for AI-assisted development:

```bash
npx have-auth-context
```

This copies the package's `AGENT.md` documentation and `metadata.json` metadata to your project's `.claude/` directory, enabling Claude to provide better assistance when working with this package.

## Quick Start

```typescript
import { getAuth } from '@happyvertical/auth';

// Keycloak
const auth = await getAuth({
  type: 'keycloak',
  serverUrl: 'https://auth.example.com',
  realm: 'my-realm',
  clientId: 'my-app'
});

// Cognito
const auth = await getAuth({
  type: 'cognito',
  region: 'us-east-1',
  userPoolId: 'us-east-1_xxx',
  clientId: 'xxx'
});

// Nostr
const auth = await getAuth({
  type: 'nostr',
  relays: ['wss://relay.damus.io']
});

// Authenticate
const result = await auth.authenticate({ username, password });
console.log(result.accessToken);

// Validate token
const claims = await auth.validateToken(token);

// Check role
if (await auth.hasRole(token, 'admin')) {
  // Admin access
}
```

## Documentation

See [AGENT.md](./AGENT.md) for complete API documentation.

## Authorization server

`@happyvertical/auth/server` provides a framework-independent OAuth 2.0
authorization-code issuer. It intentionally does not authenticate browser
sessions or render consent: an application validates its current session and
permissions, then calls `parseAuthorizationRequest()` and `approve()` with an
application-owned `OAuthConsentContext`.

```typescript
import { createAuthorizationServer } from '@happyvertical/auth/server';

const request = await server.parseAuthorizationRequest(url.searchParams);
const approved = await server.approve(request, {
  subject: session.userId,
  tenantId: session.activeTenantId,
});
return Response.redirect(approved.redirectUri, 302);
```

Supply a durable `OAuthAuthorizationStorage` implementation. Its
`consumeAuthorizationCode` and `rotateRefreshGrant` operations must be atomic
database transactions (or compare-and-swap operations); the exported in-memory
store is for tests only. The server enforces S256 PKCE, exact redirect URI and
resource binding, JWT signing/JWKS, refresh-token rotation with family replay
revocation, and live authorization checks at both code exchange and refresh
through `OAuthIdentityProvider.revalidateConsent` (the legacy `refreshConsent`
hook is a fallback for both). Return the unchanged subject and tenant, optional
replacement application claims, and optional scopes that are a subset of the
grant. Return null to deny; changing identity, tenant, or expanding scope fails
closed. Omitting claims removes previous application claims. JWT protocol claims
are reserved. Consent supplied to `approve` may also narrow the requested scopes.

Stores supporting live narrowing implement `narrowRefreshGrant`: atomically
validate the replacement token hash and active grant, then persist only a subset
of its current scopes. Throw on any failure. The server revokes the family on
failed live checks or narrowing persistence; it never returns the replacement.
Older stores without this optional method fail closed if narrowing is requested.
Storage failures must reject; never return success before durable commit. A
connection failure after commit can leave an unreachable hash-only grant, but
must not expose any token. Concrete SQL adapters and dialect tests belong to the
host application.

Path issuers such as `https://host/oauth` advertise endpoints under `/oauth` and
RFC 8414 discovery at `/.well-known/oauth-authorization-server/oauth`. Public
DCR accepts only code responses, authorization-code/refresh grants, allowed
scopes, and HTTPS redirects. HTTP loopback redirects require explicit
`allowLoopbackRedirects: true` for native/development clients. Access-token
verification requires `typ: at+jwt`, expiry, issued-at, subject, audience, token
ID, client ID and scope with valid claim types. Registration bodies are limited to 16 KiB while streaming, including when
Content-Length is absent or understated. Metadata permits at most 10 redirect
URIs of 2,048 characters each, a 256-character client name, a 2,048-character
scope string, two grant types and one response type. Direct `register()` calls
apply the same field bounds. Oversized bodies return 413 before persistence;
invalid metadata returns 400. Unknown extension metadata is ignored within the
body limit. Revocation returns success for unknown or invalid tokens, but
storage outages return a generic 500 server_error so callers can retry after
recovery. CIMD is not implemented. The signing API supports one active key;
overlapping signing-key rotation is not implemented. Hosts must supply a public
JWK matching the private signing key and keep private material out of JWKS.

## License

MIT
