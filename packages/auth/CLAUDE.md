# @happyvertical/auth: Authentication Package

## Purpose and Responsibilities

The `@happyvertical/auth` package provides a unified authentication interface supporting multiple providers. It is designed to:

- **Unify Auth Provider APIs**: Provide a consistent interface across Keycloak, Kanidm, AWS Cognito, and Nostr
- **Simplify Provider Switching**: Enable seamless switching between auth providers without code changes
- **Handle OAuth2/OIDC Flows**: Authorization code, token exchange, refresh, and introspection
- **Support Decentralized Identity**: Nostr public key authentication with NIP-98 tokens
- **Manage Users**: Create, read, update, delete users (where supported)
- **Control Sessions**: List, revoke, and manage user sessions
- **Enable RBAC**: Role-based access control and permission checking

## Architecture Overview

The package uses a factory pattern with provider-specific implementations:

```
getAuth(options) → AuthInterface
    ├── KeycloakProvider (OIDC/OAuth2)
    ├── KanidmProvider (OIDC/OAuth2)
    ├── CognitoProvider (AWS OAuth2)
    └── NostrProvider (public key identity)
```

### Core Components

1. **Factory Functions** (`shared/factory.ts`)
   - `getAuth()` - Primary factory for creating provider instances
   - `getAuthAuto()` - Auto-detects provider from configuration
   - Type guards for provider options validation

2. **Provider Implementations** (`shared/providers/`)
   - Each provider implements the `AuthInterface` interface
   - Located in: `keycloak.ts`, `kanidm.ts`, `cognito.ts`, `nostr/index.ts`
   - All providers handle error mapping to standardized error types

3. **Type Definitions** (`shared/types.ts`)
   - `AuthInterface` - Core interface all providers must implement
   - Provider options: `KeycloakOptions`, `KanidmOptions`, `CognitoOptions`, `NostrOptions`
   - Flow types: `AuthResult`, `TokenClaims`, `UserProfile`, `Session`

4. **Error Classes** (`shared/errors.ts`)
   - `AuthError` - Base error class with error codes
   - Specialized errors: `InvalidCredentialsError`, `TokenExpiredError`, etc.
   - Nostr-specific: `InvalidSignatureError`, `RelayError`, `ExtensionNotFoundError`

## Key APIs

### Creating an Auth Client

```typescript
import { getAuth } from '@happyvertical/auth';

// Keycloak client
const keycloak = await getAuth({
  type: 'keycloak',
  serverUrl: 'https://auth.example.com',
  realm: 'my-realm',
  clientId: 'my-app',
  clientSecret: 'secret', // Optional for confidential clients
  redirectUri: 'https://app.example.com/callback'
});

// Kanidm client
const kanidm = await getAuth({
  type: 'kanidm',
  serverUrl: 'https://idp.example.com',
  clientId: 'my-app',
  clientSecret: 'secret', // Optional for confidential clients
  redirectUri: 'https://app.example.com/callback',
  // Optional: Admin API credentials for user management
  adminUsername: 'idm_admin',
  adminPassword: 'admin-password'
});

// AWS Cognito client
const cognito = await getAuth({
  type: 'cognito',
  region: 'us-east-1',
  userPoolId: 'us-east-1_xxx',
  clientId: 'xxx',
  domain: 'myapp.auth.us-east-1.amazoncognito.com'
});

// Nostr client
const nostr = await getAuth({
  type: 'nostr',
  relays: ['wss://relay.damus.io', 'wss://nos.lol']
});
```

### Environment Variable Configuration

The package supports configuration via `HAVE_AUTH_*` environment variables:

| Variable | Description | Provider |
|----------|-------------|----------|
| `HAVE_AUTH_TYPE` | Provider type | All |
| `HAVE_AUTH_SERVER_URL` | Server URL | Keycloak, Kanidm |
| `HAVE_AUTH_REALM` | Realm name | Keycloak |
| `HAVE_AUTH_CLIENT_ID` | Client ID | Keycloak, Kanidm, Cognito |
| `HAVE_AUTH_CLIENT_SECRET` | Client secret | Keycloak, Kanidm, Cognito |
| `HAVE_AUTH_REDIRECT_URI` | OAuth callback | Keycloak, Kanidm, Cognito |
| `HAVE_AUTH_ADMIN_USERNAME` | Admin username | Kanidm |
| `HAVE_AUTH_ADMIN_PASSWORD` | Admin password | Kanidm |
| `HAVE_AUTH_REGION` | AWS region | Cognito |
| `HAVE_AUTH_USER_POOL_ID` | User pool ID | Cognito |
| `HAVE_AUTH_DOMAIN` | Hosted UI domain | Cognito |
| `HAVE_AUTH_RELAYS` | Relay URLs (comma-separated) | Nostr |
| `HAVE_AUTH_TIMEOUT` | Request timeout (ms) | All |

### Authentication Flows

```typescript
// OAuth2 Authorization Code Flow
const { url, state, codeVerifier } = await auth.getAuthorizationUrl({
  scopes: ['openid', 'profile', 'email'],
  state: crypto.randomUUID()
});
// Redirect user to url...

// Handle callback
const result = await auth.exchangeCode({
  code: 'received-code',
  state: state,
  codeVerifier: codeVerifier
});
console.log(result.accessToken);

// Direct authentication (password grant)
const result = await auth.authenticate({
  username: 'user@example.com',
  password: 'password123'
});

// Nostr authentication
const result = await auth.authenticate({
  method: 'extension' // Use NIP-07 browser extension
});
// or
const result = await auth.authenticate({
  method: 'privateKey',
  privateKey: 'nsec1...'
});

// Token refresh
const newResult = await auth.refresh(result.refreshToken);

// Logout
await auth.logout({
  token: result.accessToken,
  refreshToken: result.refreshToken
});
```

### Token Operations

```typescript
// Validate token and get claims
const claims = await auth.validateToken(accessToken);
if (claims) {
  console.log(`User: ${claims.sub}`);
  console.log(`Email: ${claims.email}`);
  console.log(`Roles: ${claims.roles}`);
}

// Decode without validation (for inspection)
const payload = auth.decodeToken(accessToken);
console.log(payload.header.alg);

// Introspect token (active check)
const introspection = await auth.introspectToken(accessToken);
if (introspection.active) {
  console.log('Token is valid');
}
```

### User Operations

```typescript
// Get current user's profile
const profile = await auth.getProfile(accessToken);
console.log(profile.email);

// Update profile
await auth.updateProfile(accessToken, {
  firstName: 'John',
  lastName: 'Doe'
});

// Admin: List users
const { users, total } = await auth.listUsers(
  { search: 'john', limit: 10 },
  adminToken
);

// Admin: Create user
const newUser = await auth.createUser({
  username: 'newuser',
  email: 'new@example.com',
  password: 'temp123',
  roles: ['user']
}, adminToken);

// Admin: Delete user
await auth.deleteUser(userId, adminToken);
```

### Session Management

```typescript
// List user sessions
const sessions = await auth.listSessions(userId, adminToken);

// Revoke specific session
await auth.revokeSession(sessionId, adminToken);

// Revoke all sessions
await auth.revokeAllSessions(userId, adminToken);
```

### Authorization

```typescript
// Check role
if (await auth.hasRole(accessToken, 'admin')) {
  // Admin access
}

// Check permission
if (await auth.hasPermission(accessToken, 'read', 'resource:123')) {
  // Has permission
}

// Get all roles
const roles = await auth.getRoles(accessToken);

// Admin: Assign/remove roles
await auth.assignRole(userId, 'editor', adminToken);
await auth.removeRole(userId, 'viewer', adminToken);
```

### Error Handling

```typescript
import {
  AuthError,
  InvalidCredentialsError,
  TokenExpiredError,
  AccessDeniedError,
  NotImplementedError
} from '@happyvertical/auth';

try {
  await auth.authenticate(credentials);
} catch (error) {
  if (error instanceof InvalidCredentialsError) {
    console.error('Wrong username or password');
  } else if (error instanceof TokenExpiredError) {
    console.error('Token expired, refreshing...');
    await auth.refresh(refreshToken);
  } else if (error instanceof AccessDeniedError) {
    console.error('Access denied');
  } else if (error instanceof NotImplementedError) {
    console.error(`Operation not supported: ${error.operation}`);
  } else if (error instanceof AuthError) {
    console.error(`Auth error [${error.code}]: ${error.message}`);
  }
}
```

## Nostr Provider Details

The Nostr provider abstracts public key cryptography to an OAuth-like interface:

### Concept Mapping

| Concept | OAuth/OIDC | Nostr |
|---------|------------|-------|
| Identity | Server user ID | Public key (npub) |
| Authentication | Password | Signature (prove key ownership) |
| Tokens | JWT | NIP-98 signed events |
| Profiles | Userinfo endpoint | kind:0 events from relays |
| Sessions | Server-side | Client-side keypair reference |
| User Management | Admin API | Self-managed (decentralized) |

### Authentication Methods

```typescript
// NIP-07 browser extension (most secure)
const result = await auth.authenticate({ method: 'extension' });

// Private key import (use with caution)
const result = await auth.authenticate({
  method: 'privateKey',
  privateKey: 'nsec1...'
});

// Generate new keypair
const result = await auth.authenticate({ method: 'generate' });
// IMPORTANT: result.privateKey is shown ONCE - user must save it!
console.log('Save your key:', result.privateKey);
console.log('Warning:', result.warning);

// NIP-46 remote signer (bunker)
const result = await auth.authenticate({
  method: 'bunker',
  bunkerUrl: 'bunker://...'
});
```

### NIP-98 Tokens

```typescript
// Generate HTTP Auth token for API requests
const token = await auth.getToken({
  url: 'https://api.example.com/data',
  method: 'GET'
});

// Use in request
fetch(url, {
  headers: {
    'Authorization': `Nostr ${token.authorizationHeader}`
  }
});

// Server-side validation
const claims = await auth.validateToken(authHeader, {
  expectedUrl: 'https://api.example.com/data',
  expectedMethod: 'GET',
  maxAge: 60 // seconds
});
```

### Unsupported Operations

Some operations are not applicable for Nostr due to its decentralized nature:

```typescript
// These will throw NotImplementedError with helpful messages
await auth.createUser(...); // Use authenticate({ method: 'generate' }) instead
await auth.deleteUser(...); // Keys cannot be revoked
await auth.requestPasswordReset(...); // No passwords in Nostr
await auth.refresh(...); // NIP-98 tokens are ephemeral
```

## Provider Capabilities

| Capability | Keycloak | Kanidm | Cognito | Nostr |
|------------|----------|--------|---------|-------|
| Authorization Code | Yes | Yes | Yes | No* |
| Password Grant | Yes | No | Yes | No |
| Token Refresh | Yes | Yes | Yes | No |
| OIDC | Yes | Yes | Yes | No |
| User Management | Yes | Yes† | Yes | No** |
| Session Management | Yes | No | Yes | No*** |
| RBAC | Yes | Yes‡ | Yes | Configurable |
| Password Reset | Yes | No | Yes | No |
| MFA | Yes | Yes | Yes | No |
| Social Login | Yes | No | Yes | No |
| Decentralized | No | No | No | Yes |

\* Uses challenge-response signing instead
\** Users self-manage via keypairs
\*** Client-side only
† Via Kanidm's native /v1/ API
‡ Via groups claim (role assignment requires CLI)

## Dependencies

### Required
- `@happyvertical/utils` - Utilities and error handling
- `jose` - JWT/JWS/JWE library for token handling

### Optional
- `@aws-sdk/client-cognito-identity-provider` - AWS Cognito SDK
- `nostr-tools` - Nostr protocol utilities

## File Structure

```
packages/auth/
├── src/
│   ├── index.ts                    # Main exports
│   ├── shared/
│   │   ├── factory.ts              # getAuth() factory
│   │   ├── types.ts                # Type definitions
│   │   ├── errors.ts               # Error classes
│   │   └── providers/
│   │       ├── keycloak.ts         # Keycloak provider
│   │       ├── kanidm.ts           # Kanidm provider
│   │       ├── cognito.ts          # Cognito provider
│   │       └── nostr/
│   │           ├── index.ts        # Nostr provider
│   │           ├── types.ts        # Nostr-specific types
│   │           ├── signers.ts      # Signer abstractions
│   │           └── nip98.ts        # HTTP Auth tokens
├── package.json
├── tsconfig.json
├── vite.config.ts
└── CLAUDE.md
```

## Implementation Status

### Phase 1: Foundation (Complete)
- [x] Package structure
- [x] Type definitions
- [x] Error classes
- [x] Factory function
- [x] Documentation

### Phase 2: Keycloak Provider (Complete)
- [x] OIDC discovery
- [x] Authorization code flow with PKCE
- [x] Token validation (JWKS)
- [x] User management (Admin API)
- [x] Session management
- [x] Tests

### Phase 3: Kanidm Provider (Complete)
- [x] OIDC discovery (client-specific endpoints)
- [x] Authorization code flow with PKCE
- [x] Token validation (ES256/JWKS)
- [x] User management (native /v1/ API)
- [x] Integration tests

### Phase 4: Cognito Provider (Pending)
- [ ] Hosted UI flow
- [ ] Cognito Identity Provider SDK
- [ ] Token validation
- [ ] User management
- [ ] Tests

### Phase 5: Nostr Provider (Pending)
- [ ] Signer abstractions (Extension, PrivateKey, Bunker)
- [ ] NIP-98 token generation/validation
- [ ] Profile fetching (kind:0)
- [ ] Profile publishing
- [ ] Role mapping
- [ ] Tests

## Development

```bash
# Install dependencies
pnpm install

# Run tests
npm test

# Build
npm run build

# Watch mode
npm run build:watch
```

## Security Considerations

1. **Never expose private keys**: Nostr private keys should never be stored or logged
2. **Use PKCE**: Always enable PKCE for public clients (default in Keycloak provider)
3. **Validate tokens**: Always validate tokens before trusting claims
4. **Secure storage**: Store tokens securely (httpOnly cookies, secure storage)
5. **Short token lifetimes**: Use short-lived access tokens with refresh
6. **HTTPS only**: All auth communication should use HTTPS

## Quick Reference

### Factory

```typescript
import { getAuth, getAuthAuto } from '@happyvertical/auth';

const auth = await getAuth({ type: 'keycloak', ... });
const auth = await getAuthAuto({ serverUrl: ..., realm: ... }); // Auto-detect
```

### Common Operations

```typescript
// Authenticate
const result = await auth.authenticate({ username, password });

// Validate token
const claims = await auth.validateToken(token);

// Get profile
const profile = await auth.getProfile(token);

// Check role
const isAdmin = await auth.hasRole(token, 'admin');

// Logout
await auth.logout({ token });
```

### Error Handling

```typescript
import { AuthError, AuthErrorCode, isAuthError } from '@happyvertical/auth';

if (isAuthError(error)) {
  switch (error.code) {
    case AuthErrorCode.INVALID_CREDENTIALS:
    case AuthErrorCode.TOKEN_EXPIRED:
    case AuthErrorCode.ACCESS_DENIED:
    case AuthErrorCode.NOT_IMPLEMENTED:
    // Handle specific cases
  }
}
```
