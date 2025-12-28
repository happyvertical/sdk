# @happyvertical/auth

## 0.63.0

### Patch Changes

- Updated dependencies [8c28ddc]
  - @happyvertical/utils@0.63.0

## 0.62.0

### Minor Changes

- 722dc51: Add new @happyvertical/auth package providing a unified authentication interface for multiple providers.

  **Features:**

  - Factory pattern with `getAuth()` for provider instantiation
  - Full Keycloak provider implementation with OIDC discovery, authorization code flow with PKCE, password and client credentials grants
  - Token validation via JWKS, decoding, and introspection
  - Token refresh and logout with revocation
  - User profile operations and user management via Admin API
  - Session management (list, revoke)
  - Role-based access control
  - Comprehensive error classes with error codes
  - Environment variable configuration (HAVE*AUTH*\* prefix)
  - Stub implementations for Cognito and Nostr providers (coming in future releases)

### Patch Changes

- @happyvertical/utils@0.62.0
