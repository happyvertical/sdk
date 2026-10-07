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
revocation, and live refresh authorization through `OAuthIdentityProvider`.

## License

MIT
