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

See [CLAUDE.md](./CLAUDE.md) for complete API documentation.

## License

MIT
