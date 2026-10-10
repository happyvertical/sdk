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

## Local Sign in with ChatGPT

Node-only local applications can import `@happyvertical/auth/local` to manage
their Sign in with ChatGPT session. The manager uses a `127.0.0.1` loopback
callback, PKCE and OIDC validation, and writes account-scoped renewable
credentials atomically with owner-only permissions. Pass a configuration path
outside the project directory and open the returned authorization URL in the
system browser. It never exposes credentials from `sessions()`.

Use `accessToken(clientId)` before an authorized request; it serializes token
refreshes. `logout(clientId)` always clears local credentials and reports
whether remote revocation was confirmed. This local runtime does not make any
inference request or use browser storage.

## License

MIT
